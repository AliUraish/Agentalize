import base64
import json
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceResponse

from app.core.ids import new_id
from app.core.redaction import redact_text
from app.core.serialization import json_safe
from app.core.time import utc_now
from app.models.schemas import (
    AgentUpsert,
    ApprovalCreate,
    DeploymentCreate,
    EvaluationCreate,
    FeedbackCreate,
    IncidentPatch,
    InvestigationCreate,
    InvestigationMessage,
    MemoryCreate,
    MemorySearch,
    TraceInput,
)
from app.security import TenantContext, frontend_tenant, sdk_tenant
from app.services.telemetry import decode_otlp, decode_otlp_json
from app.storage import new_document, tenant_query


router = APIRouter()


def _container(request: Request) -> Any:
    return request.app.state.container


def _page_offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return int(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid pagination cursor") from exc


def _next_cursor(offset: int, limit: int, total: int) -> str | None:
    next_offset = offset + limit
    if next_offset >= total:
        return None
    return base64.urlsafe_b64encode(str(next_offset).encode()).decode()


def _json(data: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=json_safe(data), status_code=status_code)


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    container = _container(request)
    database_ok = False
    try:
        database_ok = await container.store.ping()
    except Exception:
        database_ok = False
    return _json(
        {
            "status": "ok" if database_ok else "degraded",
            "service": container.settings.app_name,
            "version": "0.1.0",
            "storage": container.store.backend_name,
            "database": "connected" if database_ok else "unavailable",
            "workerMode": "inline" if container.settings.run_worker_inline else "separate",
            "timestamp": utc_now(),
        },
        status_code=200 if database_ok else 503,
    )


@router.post("/traces", include_in_schema=True)
async def ingest_otlp_traces(
    request: Request,
    tenant: TenantContext = Depends(sdk_tenant),
) -> Response:
    payload = await request.body()
    content_type = request.headers.get("content-type", "")
    try:
        if "json" in content_type:
            traces = decode_otlp_json(json.loads(payload))
            results = await _container(request).telemetry.ingest_many(tenant, traces)
            return _json({"accepted": len(results), "results": results}, status_code=202)
        traces = decode_otlp(payload)
        await _container(request).telemetry.ingest_many(tenant, traces)
        response = ExportTraceServiceResponse().SerializeToString()
        return Response(content=response, media_type="application/x-protobuf", status_code=200)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid OTLP trace payload: {exc}") from exc


@router.post("/ingest/traces")
async def ingest_json_trace(
    payload: TraceInput,
    request: Request,
    tenant: TenantContext = Depends(sdk_tenant),
) -> JSONResponse:
    result = await _container(request).telemetry.ingest(tenant, payload)
    return _json(result, status_code=202)


@router.post("/evaluations")
async def create_evaluation(
    payload: EvaluationCreate,
    request: Request,
    tenant: TenantContext = Depends(sdk_tenant),
) -> JSONResponse:
    evaluation, incident = await _container(request).evaluations.create(tenant, payload)
    return _json({"evaluation": evaluation, "incident": incident}, status_code=201)


@router.post("/feedback")
async def create_feedback(
    payload: FeedbackCreate,
    request: Request,
    tenant: TenantContext = Depends(sdk_tenant),
) -> JSONResponse:
    feedback, evaluation, incident = await _container(request).feedback.create(tenant, payload)
    return _json(
        {"feedback": feedback, "evaluation": evaluation, "incident": incident},
        status_code=201,
    )


@router.post("/deployments")
async def create_deployment(
    payload: DeploymentCreate,
    request: Request,
    tenant: TenantContext = Depends(sdk_tenant),
) -> JSONResponse:
    deployment = await _container(request).deployments.create(tenant, payload)
    return _json(deployment, status_code=201)


@router.get("/overview")
async def overview(
    request: Request,
    environment: str | None = None,
    agent_id: str | None = None,
    workflow: str | None = None,
    hours: int = Query(default=24, ge=1, le=24 * 90),
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    container = _container(request)
    since = utc_now() - timedelta(hours=hours)
    run_query = tenant_query(
        tenant.organization_id, tenant.project_id, startedAt={"$gte": since}
    )
    incident_query = tenant_query(tenant.organization_id, tenant.project_id)
    if environment:
        run_query["environment"] = environment
        incident_query["environment"] = environment
    if agent_id:
        run_query["agentId"] = agent_id
        incident_query["agentId"] = agent_id
    runs = await container.store.find_many("runs", run_query, limit=10_000)
    incidents = await container.store.find_many("incidents", incident_query, limit=2_000)
    evaluations = await container.store.find_many(
        "evaluations",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            createdAt={"$gte": since},
            **({"agent_id": agent_id} if agent_id else {}),
            **({"metadata.workflow": workflow} if workflow else {}),
        ),
        limit=10_000,
    )
    feedback = await container.store.find_many(
        "feedback",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            createdAt={"$gte": since},
            **({"agent_id": agent_id} if agent_id else {}),
            **({"metadata.workflow": workflow} if workflow else {}),
        ),
        limit=10_000,
    )
    successful = sum(1 for item in runs if item.get("status") == "ok")
    passed = sum(1 for item in evaluations if item.get("passed") is True)
    failed = sum(1 for item in evaluations if item.get("passed") is False)
    negative = sum(
        1
        for item in feedback
        if item.get("sentiment") == "negative" or (item.get("rating") or 5) <= 2
    )
    latencies = sorted(item.get("durationMs", 0) for item in runs)
    p95_index = max(0, min(len(latencies) - 1, int(len(latencies) * 0.95) - 1)) if latencies else 0
    open_statuses = {"open", "investigating", "fix_proposed", "awaiting_approval", "regressed"}
    return _json(
        {
            "windowHours": hours,
            "environment": environment,
            "metrics": {
                "runs": len(runs),
                "successfulRuns": successful,
                "successRate": successful / len(runs) if runs else None,
                "evaluationPassRate": passed / (passed + failed) if passed + failed else None,
                "evaluationSampleSize": passed + failed,
                "negativeFeedbackRate": negative / len(feedback) if feedback else None,
                "feedbackSampleSize": len(feedback),
                "p95LatencyMs": latencies[p95_index] if latencies else None,
                "totalCost": sum(float(item.get("estimatedCost", 0)) for item in runs),
                "openIncidents": sum(1 for item in incidents if item.get("status") in open_statuses),
            },
            "needsAttention": sorted(
                [item for item in incidents if item.get("status") in open_statuses],
                key=lambda item: item.get("lastSeenAt"),
                reverse=True,
            )[:10],
            "activeInvestigations": await container.store.find_many(
                "investigations",
                tenant_query(
                    tenant.organization_id,
                    tenant.project_id,
                    status={"$in": ["queued", "running"]},
                    **({"agentId": agent_id} if agent_id else {}),
                ),
                sort=[("createdAt", -1)],
                limit=10,
            ),
        }
    )


@router.put("/agents/{agent_id}")
async def upsert_agent(
    agent_id: str,
    payload: AgentUpsert,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    if payload.agent_id != agent_id:
        raise HTTPException(status_code=400, detail="Agent ID does not match path")
    now = utc_now()
    document = new_document(
        tenant.organization_id,
        tenant.project_id,
        agentId=payload.agent_id,
        name=payload.name,
        description=payload.description,
        framework=payload.framework,
        owner=payload.owner,
        tags=payload.tags,
        mode=payload.mode.value,
    )
    stored = await _container(request).store.update_one(
        "agents",
        tenant_query(tenant.organization_id, tenant.project_id, agentId=agent_id),
        {"$set": {**document, "updatedAt": now}},
        upsert=True,
    )
    await _container(request).audit.record(
        tenant, "agent.configured", "agent", agent_id, details={"mode": payload.mode.value}
    )
    return _json(stored)


@router.get("/agents")
async def list_agents(
    request: Request,
    agent_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    query = tenant_query(
        tenant.organization_id,
        tenant.project_id,
        **({"agentId": agent_id} if agent_id else {}),
    )
    total = await store.count("agents", query)
    offset = _page_offset(cursor)
    items = await store.find_many("agents", query, sort=[("lastSeenAt", -1)], limit=limit, skip=offset)
    return _json({"items": items, "count": total, "nextCursor": _next_cursor(offset, limit, total)})


@router.get("/agents/{agent_id}")
async def get_agent(
    agent_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    agent = await store.find_one(
        "agents", tenant_query(tenant.organization_id, tenant.project_id, agentId=agent_id)
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent["recentRuns"] = await store.find_many(
        "runs",
        tenant_query(tenant.organization_id, tenant.project_id, agentId=agent_id),
        sort=[("startedAt", -1)],
        limit=20,
    )
    agent["openIncidents"] = await store.find_many(
        "incidents",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            agentId=agent_id,
            status={"$nin": ["resolved", "dismissed"]},
        ),
        sort=[("lastSeenAt", -1)],
        limit=20,
    )
    return _json(agent)


async def _list_collection(
    request: Request,
    tenant: TenantContext,
    collection: str,
    *,
    limit: int,
    cursor: str | None,
    sort_field: str,
    filters: dict[str, Any] | None = None,
) -> JSONResponse:
    query = tenant_query(tenant.organization_id, tenant.project_id, **(filters or {}))
    store = _container(request).store
    total = await store.count(collection, query)
    offset = _page_offset(cursor)
    items = await store.find_many(
        collection, query, sort=[(sort_field, -1)], limit=limit, skip=offset
    )
    return _json({"items": items, "count": total, "nextCursor": _next_cursor(offset, limit, total)})


@router.get("/runs")
async def list_runs(
    request: Request,
    agent_id: str | None = None,
    run_status: str | None = Query(default=None, alias="status"),
    environment: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters = {key: value for key, value in {"agentId": agent_id, "status": run_status, "environment": environment}.items() if value}
    return await _list_collection(
        request, tenant, "runs", limit=limit, cursor=cursor, sort_field="startedAt", filters=filters
    )


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    query = tenant_query(tenant.organization_id, tenant.project_id, runId=run_id)
    run = await store.find_one("runs", query)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    run["spans"] = await store.find_many("spans", query, sort=[("startTime", 1)], limit=2_000)
    run["evaluations"] = await store.find_many(
        "evaluations",
        tenant_query(tenant.organization_id, tenant.project_id, **{"target.id": run_id}),
        sort=[("createdAt", -1)],
        limit=200,
    )
    run["feedback"] = await store.find_many(
        "feedback",
        tenant_query(tenant.organization_id, tenant.project_id, **{"target.id": run_id}),
        sort=[("createdAt", -1)],
        limit=200,
    )
    return _json(run)


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    trace = await store.find_one(
        "traces", tenant_query(tenant.organization_id, tenant.project_id, traceId=trace_id)
    )
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    trace["spans"] = await store.find_many(
        "spans",
        tenant_query(tenant.organization_id, tenant.project_id, traceId=trace_id),
        sort=[("startTime", 1)],
        limit=2_000,
    )
    return _json(trace)


@router.get("/evaluations")
async def list_evaluations(
    request: Request,
    passed: bool | None = None,
    metric: str | None = None,
    agent_id: str | None = None,
    workflow: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters: dict[str, Any] = {}
    if passed is not None:
        filters["passed"] = passed
    if metric:
        filters["metric"] = metric
    if agent_id:
        filters["agent_id"] = agent_id
    if workflow:
        filters["metadata.workflow"] = workflow
    return await _list_collection(
        request, tenant, "evaluations", limit=limit, cursor=cursor, sort_field="createdAt", filters=filters
    )


@router.get("/feedback")
async def list_feedback(
    request: Request,
    sentiment: str | None = None,
    category: str | None = None,
    agent_id: str | None = None,
    workflow: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters = {key: value for key, value in {"sentiment": sentiment, "category": category, "agent_id": agent_id, "metadata.workflow": workflow}.items() if value}
    return await _list_collection(
        request, tenant, "feedback", limit=limit, cursor=cursor, sort_field="createdAt", filters=filters
    )


@router.get("/incidents")
async def list_incidents(
    request: Request,
    incident_status: str | None = Query(default=None, alias="status"),
    severity: str | None = None,
    agent_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters = {key: value for key, value in {"status": incident_status, "severity": severity, "agentId": agent_id}.items() if value}
    return await _list_collection(
        request, tenant, "incidents", limit=limit, cursor=cursor, sort_field="lastSeenAt", filters=filters
    )


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    container = _container(request)
    incident = await container.incidents.get(tenant, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    base = tenant_query(tenant.organization_id, tenant.project_id, incidentId=incident_id)
    incident["signals"] = await container.store.find_many(
        "incidentSignals", base, sort=[("createdAt", -1)], limit=500
    )
    incident["hypotheses"] = await container.store.find_many(
        "hypotheses", base, sort=[("createdAt", -1)], limit=100
    )
    incident["investigations"] = await container.store.find_many(
        "investigations", base, sort=[("createdAt", -1)], limit=100
    )
    incident["remediations"] = await container.store.find_many(
        "remediations", base, sort=[("createdAt", -1)], limit=100
    )
    return _json(incident)


@router.patch("/incidents/{incident_id}")
async def patch_incident(
    incident_id: str,
    payload: IncidentPatch,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    incident = await _container(request).incidents.patch(tenant, incident_id, payload)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    await _container(request).audit.record(
        tenant,
        "incident.updated",
        "incident",
        incident_id,
        details={"changes": payload.model_dump(mode="json", exclude_none=True)},
    )
    return _json(incident)


@router.get("/incidents/{incident_id}/timeline")
async def incident_timeline(
    incident_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    base = tenant_query(tenant.organization_id, tenant.project_id, incidentId=incident_id)
    collections = ["incidentSignals", "investigations", "agentSteps", "remediations", "approvals", "verifications"]
    items: list[dict[str, Any]] = []
    for collection in collections:
        collection_items = await store.find_many(collection, base, limit=1_000)
        for item in collection_items:
            item["timelineType"] = collection
        items.extend(collection_items)
    items.sort(key=lambda item: item.get("createdAt"), reverse=False)
    return _json({"items": items, "count": len(items)})


@router.post("/incidents/{incident_id}/investigations")
async def start_investigation(
    incident_id: str,
    payload: InvestigationCreate,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    container = _container(request)
    incident = await container.incidents.get(tenant, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    try:
        investigation, job = await container.investigations.start(tenant, incident, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    refreshed = await container.store.find_one(
        "investigations",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            investigationId=investigation["investigationId"],
        ),
    )
    return _json({"investigation": refreshed, "jobId": job["jobId"]}, status_code=202)


@router.get("/investigations")
async def list_investigations(
    request: Request,
    investigation_status: str | None = Query(default=None, alias="status"),
    agent_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters = {key: value for key, value in {"status": investigation_status, "agentId": agent_id}.items() if value}
    return await _list_collection(
        request, tenant, "investigations", limit=limit, cursor=cursor, sort_field="createdAt", filters=filters
    )


@router.get("/investigations/{investigation_id}")
async def get_investigation(
    investigation_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    store = _container(request).store
    query = tenant_query(
        tenant.organization_id, tenant.project_id, investigationId=investigation_id
    )
    investigation = await store.find_one("investigations", query)
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    investigation["steps"] = await store.find_many(
        "agentSteps", query, sort=[("createdAt", 1)], limit=1_000
    )
    investigation["hypotheses"] = await store.find_many(
        "hypotheses", query, sort=[("createdAt", -1)], limit=100
    )
    investigation["remediations"] = await store.find_many(
        "remediations", query, sort=[("createdAt", -1)], limit=100
    )
    return _json(investigation)


async def _investigation_repository(
    investigation_id: str,
    request: Request,
    tenant: TenantContext,
) -> tuple[dict[str, Any], Any]:
    container = _container(request)
    investigation = await container.store.find_one(
        "investigations",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            investigationId=investigation_id,
        ),
    )
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    try:
        root = container.investigations.inspector.validate_root(
            investigation.get("repositoryPath")
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return investigation, root


@router.get("/investigations/{investigation_id}/repository")
async def investigation_repository(
    investigation_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    investigation, root = await _investigation_repository(
        investigation_id, request, tenant
    )
    inspector = _container(request).investigations.inspector
    structure = inspector.structure(root)
    files = [entry for entry in structure if entry["type"] == "file"]
    return _json(
        {
            "investigationId": investigation["investigationId"],
            "repositoryName": root.name,
            "repositoryPath": str(root),
            "files": files,
            "structure": structure,
            "fileCount": len(files),
            "directoryCount": sum(1 for entry in structure if entry["type"] == "directory"),
        }
    )


@router.get("/investigations/{investigation_id}/repository/file")
async def investigation_repository_file(
    investigation_id: str,
    request: Request,
    path: str = Query(min_length=1, max_length=1_000),
    line: int = Query(default=1, ge=1),
    context: int = Query(default=20, ge=2, le=60),
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    _, root = await _investigation_repository(investigation_id, request, tenant)
    try:
        result = _container(request).investigations.inspector.read_file(
            root, path, line=line, context=context
        )
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _json(result)


@router.post("/investigations/{investigation_id}/messages")
async def investigation_message(
    investigation_id: str,
    payload: InvestigationMessage,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    investigation = await _container(request).store.find_one(
        "investigations",
        tenant_query(
            tenant.organization_id,
            tenant.project_id,
            investigationId=investigation_id,
        ),
    )
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    step = await _container(request).investigations.add_step(
        tenant,
        investigation_id,
        "decision_support",
        "human_input",
        redact_text(payload.message, 5_000),
        details={"author": payload.author},
    )
    return _json(step, status_code=201)


@router.get("/remediations/{remediation_id}")
async def get_remediation(
    remediation_id: str,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    remediation = await _container(request).store.find_one(
        "remediations",
        tenant_query(
            tenant.organization_id, tenant.project_id, remediationId=remediation_id
        ),
    )
    if not remediation:
        raise HTTPException(status_code=404, detail="Remediation not found")
    return _json(remediation)


@router.post("/remediations/{remediation_id}/approvals")
async def approve_remediation(
    remediation_id: str,
    payload: ApprovalCreate,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    container = _container(request)
    query = tenant_query(
        tenant.organization_id, tenant.project_id, remediationId=remediation_id
    )
    remediation = await container.store.find_one("remediations", query)
    if not remediation:
        raise HTTPException(status_code=404, detail="Remediation not found")
    approval = new_document(
        tenant.organization_id,
        tenant.project_id,
        approvalId=new_id("approval"),
        remediationId=remediation_id,
        incidentId=remediation["incidentId"],
        investigationId=remediation["investigationId"],
        **payload.model_dump(),
    )
    approval = await container.store.insert_one("approvals", approval)
    await container.store.update_one(
        "remediations",
        query,
        {
            "$set": {
                "status": "approved" if payload.decision == "approved" else payload.decision,
                "updatedAt": utc_now(),
            },
            "$addToSet": {"approvals": approval["approvalId"]},
        },
    )
    await container.audit.record(
        tenant,
        f"remediation.{payload.decision}",
        "remediation",
        remediation_id,
        details={"reason": payload.reason},
    )
    await container.events.publish(
        tenant.organization_id,
        tenant.project_id,
        "approval.recorded",
        {"remediationId": remediation_id, "decision": payload.decision},
    )
    return _json(approval, status_code=201)


@router.post("/memories")
async def create_memory(
    payload: MemoryCreate,
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    memory = await _container(request).memory.create(tenant, payload)
    return _json(memory, status_code=201)


@router.get("/memories/search")
async def search_memories(
    request: Request,
    query: str = "",
    agent_id: str | None = None,
    outcome: str | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    results = await _container(request).memory.search(
        tenant, MemorySearch(query=query, agent_id=agent_id, outcome=outcome, limit=limit)
    )
    return _json({"items": results, "count": len(results)})


@router.get("/deployments")
async def list_deployments(
    request: Request,
    environment: str | None = None,
    repository: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    filters = {key: value for key, value in {"environment": environment, "repository": repository}.items() if value}
    return await _list_collection(
        request, tenant, "deployments", limit=limit, cursor=cursor, sort_field="deployed_at", filters=filters
    )


@router.get("/audit-events")
async def list_audit_events(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    tenant: TenantContext = Depends(frontend_tenant),
) -> JSONResponse:
    return await _list_collection(
        request, tenant, "auditEvents", limit=limit, cursor=cursor, sort_field="createdAt"
    )


@router.get("/events")
async def stream_events(
    request: Request,
    tenant: TenantContext = Depends(frontend_tenant),
) -> StreamingResponse:
    return StreamingResponse(
        _container(request).events.subscribe(tenant.organization_id, tenant.project_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
