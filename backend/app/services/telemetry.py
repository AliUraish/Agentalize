from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from google.protobuf.json_format import MessageToDict
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest

from app.core.ids import new_id
from app.core.redaction import redact_value
from app.core.time import utc_now
from app.events import EventBroker
from app.models.schemas import SpanInput, TraceInput
from app.security import TenantContext
from app.services.incidents import IncidentService
from app.storage import Store, new_document, tenant_query


def _timestamp(nanoseconds: int) -> datetime:
    if not nanoseconds:
        return utc_now()
    return datetime.fromtimestamp(nanoseconds / 1_000_000_000, tz=UTC)


def _any_value(value: Any) -> Any:
    kind = value.WhichOneof("value")
    if kind == "string_value":
        return value.string_value
    if kind == "bool_value":
        return value.bool_value
    if kind == "int_value":
        return value.int_value
    if kind == "double_value":
        return value.double_value
    if kind == "bytes_value":
        return value.bytes_value.hex()
    if kind == "array_value":
        return [_any_value(item) for item in value.array_value.values]
    if kind == "kvlist_value":
        return {item.key: _any_value(item.value) for item in value.kvlist_value.values}
    return None


def _attributes(attributes: Any) -> dict[str, Any]:
    return {item.key: _any_value(item.value) for item in attributes}


def _status(code: int) -> str:
    if code == 2:
        return "error"
    if code == 1:
        return "ok"
    return "unset"


def _resource_value(attributes: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = attributes.get(key)
        if value not in (None, ""):
            return value
    return default


def decode_otlp(payload: bytes) -> list[TraceInput]:
    request = ExportTraceServiceRequest()
    request.ParseFromString(payload)
    grouped: defaultdict[str, dict[str, Any]] = defaultdict(
        lambda: {"spans": [], "resource": {}}
    )
    for resource_spans in request.resource_spans:
        resource_attrs = _attributes(resource_spans.resource.attributes)
        for scope_spans in resource_spans.scope_spans:
            for span in scope_spans.spans:
                trace_id = span.trace_id.hex()
                span_attrs = _attributes(span.attributes)
                events: list[dict[str, Any]] = []
                for event in span.events:
                    events.append(
                        {
                            "name": event.name,
                            "time": _timestamp(event.time_unix_nano),
                            "attributes": _attributes(event.attributes),
                        }
                    )
                grouped[trace_id]["resource"] = resource_attrs
                grouped[trace_id]["spans"].append(
                    SpanInput(
                        span_id=span.span_id.hex(),
                        parent_span_id=span.parent_span_id.hex() or None,
                        name=span.name,
                        kind=str(span.kind),
                        start_time=_timestamp(span.start_time_unix_nano),
                        end_time=_timestamp(span.end_time_unix_nano),
                        status=_status(span.status.code),
                        attributes=span_attrs,
                        events=events,
                    )
                )
    traces: list[TraceInput] = []
    for trace_id, value in grouped.items():
        resource = value["resource"]
        spans = value["spans"]
        combined_attrs: dict[str, Any] = {}
        for span in spans:
            combined_attrs.update(span.attributes)
        agent_id = str(
            _resource_value(
                resource,
                "agentalize.agent.id",
                "service.instance.id",
                default=combined_attrs.get("agentalize.agent.id", "unknown-agent"),
            )
        )
        run_id = combined_attrs.get("agentalize.run.id") or trace_id
        traces.append(
            TraceInput(
                trace_id=trace_id,
                run_id=str(run_id),
                agent_id=agent_id,
                agent_name=_resource_value(resource, "service.name", default=agent_id),
                environment=str(
                    _resource_value(
                        resource,
                        "deployment.environment.name",
                        "deployment.environment",
                        default="production",
                    )
                ),
                deployment_id=_resource_value(
                    resource, "deployment.id", default=combined_attrs.get("deployment.id")
                ),
                git_commit_sha=_resource_value(
                    resource,
                    "vcs.ref.head.revision",
                    "git.commit.sha",
                    default=combined_attrs.get("git.commit.sha"),
                ),
                service_version=_resource_value(resource, "service.version"),
                user_id=combined_attrs.get("agentalize.user.id"),
                session_id=combined_attrs.get("agentalize.session.id"),
                conversation_id=combined_attrs.get("agentalize.conversation.id"),
                spans=spans,
            )
        )
    return traces


def decode_otlp_json(payload: dict[str, Any]) -> list[TraceInput]:
    # JSON OTLP is accepted for debugging; protobuf is what the Python SDK sends.
    request = ExportTraceServiceRequest()
    from google.protobuf.json_format import ParseDict

    ParseDict(payload, request)
    return decode_otlp(request.SerializeToString())


def _attribute_number(spans: list[SpanInput], *keys: str) -> float:
    total = 0.0
    for span in spans:
        for key in keys:
            value = span.attributes.get(key)
            if isinstance(value, (int, float)):
                total += float(value)
                break
    return total


def _error_reason(span: SpanInput) -> str:
    for event in span.events:
        if event.get("name") == "exception":
            attributes = event.get("attributes", {})
            return str(
                attributes.get("exception.message")
                or attributes.get("exception.type")
                or span.name
            )
    return str(span.attributes.get("error.message") or span.name)


class TelemetryService:
    def __init__(
        self, store: Store, events: EventBroker, incidents: IncidentService
    ) -> None:
        self.store = store
        self.events = events
        self.incidents = incidents

    async def ingest(
        self, tenant: TenantContext, trace: TraceInput
    ) -> dict[str, Any]:
        existing = await self.store.find_one(
            "traces",
            tenant_query(
                tenant.organization_id, tenant.project_id, traceId=trace.trace_id
            ),
        )
        if existing:
            return {"traceId": trace.trace_id, "runId": existing["runId"], "duplicate": True}

        now = utc_now()
        spans = sorted(trace.spans, key=lambda item: item.start_time)
        start_time = min(span.start_time for span in spans)
        end_time = max(span.end_time for span in spans)
        duration_ms = max(0, int((end_time - start_time).total_seconds() * 1000))
        error_spans = [span for span in spans if span.status == "error"]
        run_id = trace.run_id or new_id("run")
        status = "error" if error_spans else "ok"
        total_tokens = int(
            _attribute_number(spans, "llm.usage.total_tokens", "gen_ai.usage.total_tokens")
        )
        prompt_tokens = int(
            _attribute_number(spans, "llm.usage.prompt_tokens", "gen_ai.usage.input_tokens")
        )
        completion_tokens = int(
            _attribute_number(spans, "llm.usage.completion_tokens", "gen_ai.usage.output_tokens")
        )
        estimated_cost = _attribute_number(spans, "llm.usage.cost", "gen_ai.usage.cost")

        agent_defaults = new_document(
            tenant.organization_id,
            tenant.project_id,
            description="",
            framework=None,
            owner=None,
            tags=[],
            mode="monitor",
        )
        # MongoDB rejects the same path in $set and $setOnInsert. The current
        # name and timestamp belong in $set so both inserts and updates use them.
        agent_defaults.pop("updatedAt")

        await self.store.update_one(
            "agents",
            tenant_query(
                tenant.organization_id, tenant.project_id, agentId=trace.agent_id
            ),
            {
                "$setOnInsert": agent_defaults,
                "$set": {
                    "name": trace.agent_name or trace.agent_id,
                    "lastSeenAt": end_time,
                    "activeVersion": trace.service_version,
                    "updatedAt": now,
                },
            },
            upsert=True,
        )

        for span in spans:
            span_document = new_document(
                tenant.organization_id,
                tenant.project_id,
                traceId=trace.trace_id,
                runId=run_id,
                agentId=trace.agent_id,
                spanId=span.span_id,
                parentSpanId=span.parent_span_id,
                name=span.name,
                kind=span.kind,
                startTime=span.start_time,
                endTime=span.end_time,
                durationMs=max(0, int((span.end_time - span.start_time).total_seconds() * 1000)),
                status=span.status,
                attributes=redact_value(span.attributes),
                events=redact_value(span.events),
            )
            await self.store.insert_one("spans", span_document)

        root_span = next((span for span in spans if not span.parent_span_id), spans[0])
        trace_document = new_document(
            tenant.organization_id,
            tenant.project_id,
            traceId=trace.trace_id,
            runId=run_id,
            rootSpanId=root_span.span_id,
            agentId=trace.agent_id,
            environment=trace.environment,
            deploymentId=trace.deployment_id,
            gitCommitSha=trace.git_commit_sha,
            serviceVersion=trace.service_version,
            startTime=start_time,
            endTime=end_time,
            durationMs=duration_ms,
            status=status,
            spanCount=len(spans),
            errorCount=len(error_spans),
        )
        await self.store.insert_one("traces", trace_document)
        existing_evaluations = await self.store.find_many(
            "evaluations",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                **{"target.id": run_id},
            ),
            limit=10_000,
        )
        existing_feedback_count = await self.store.count(
            "feedback",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                **{"target.id": run_id},
            ),
        )
        passed_evaluations = sum(
            1 for evaluation in existing_evaluations if evaluation.get("passed") is True
        )
        failed_evaluations = sum(
            1 for evaluation in existing_evaluations if evaluation.get("passed") is False
        )
        if failed_evaluations:
            evaluation_status = "failed"
        elif passed_evaluations:
            evaluation_status = "passed"
        else:
            evaluation_status = "not_evaluated"
        run_document = new_document(
            tenant.organization_id,
            tenant.project_id,
            runId=run_id,
            traceId=trace.trace_id,
            agentId=trace.agent_id,
            agentName=trace.agent_name or trace.agent_id,
            environment=trace.environment,
            deploymentId=trace.deployment_id,
            gitCommitSha=trace.git_commit_sha,
            serviceVersion=trace.service_version,
            userId=trace.user_id,
            sessionId=trace.session_id,
            conversationId=trace.conversation_id,
            startedAt=start_time,
            endedAt=end_time,
            durationMs=duration_ms,
            status=status,
            totalTokens=total_tokens,
            promptTokens=prompt_tokens,
            completionTokens=completion_tokens,
            estimatedCost=estimated_cost,
            toolCount=sum(1 for span in spans if "tool" in span.name.lower()),
            errorCount=len(error_spans),
            evaluationRollup={
                "status": evaluation_status,
                "passed": passed_evaluations,
                "failed": failed_evaluations,
            },
            feedbackCount=existing_feedback_count,
        )
        await self.store.insert_one("runs", run_document)

        incidents: list[str] = []
        if error_spans:
            primary_error = error_spans[0]
            reason = _error_reason(primary_error)
            incident = await self.incidents.record_signal(
                tenant,
                agent_id=trace.agent_id,
                environment=trace.environment,
                signal_type="exception",
                signal_id=primary_error.span_id,
                title=f"{primary_error.name} failed",
                reason=reason,
                metric=primary_error.name,
                confidence=1.0,
                user_id=trace.user_id,
                target_id=run_id,
                deployment_id=trace.deployment_id,
            )
            incidents.append(incident["incidentId"])

        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "run.completed",
            {
                "runId": run_id,
                "traceId": trace.trace_id,
                "agentId": trace.agent_id,
                "status": status,
                "incidentIds": incidents,
            },
        )
        return {
            "traceId": trace.trace_id,
            "runId": run_id,
            "duplicate": False,
            "status": status,
            "incidentIds": incidents,
        }

    async def ingest_many(
        self, tenant: TenantContext, traces: list[TraceInput]
    ) -> list[dict[str, Any]]:
        results = []
        for trace in traces:
            results.append(await self.ingest(tenant, trace))
        return results


def otlp_debug_dict(payload: bytes) -> dict[str, Any]:
    request = ExportTraceServiceRequest()
    request.ParseFromString(payload)
    return MessageToDict(request, preserving_proto_field_name=True)
