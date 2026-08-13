from typing import Any

from app.core.ids import new_id
from app.core.redaction import redact_value
from app.events import EventBroker
from app.models.schemas import EvaluationCreate
from app.security import TenantContext
from app.services.incidents import IncidentService
from app.storage import Store, new_document


class EvaluationService:
    def __init__(
        self, store: Store, events: EventBroker, incidents: IncidentService
    ) -> None:
        self.store = store
        self.events = events
        self.incidents = incidents

    async def create(
        self, tenant: TenantContext, payload: EvaluationCreate
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        data = redact_value(payload.model_dump())
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            evaluationId=new_id("eval"),
            **data,
        )
        stored = await self.store.insert_one("evaluations", document)
        if payload.target.type == "run":
            rollup_field = "evaluationRollup.passed" if payload.passed is True else "evaluationRollup.failed"
            if payload.passed is not None:
                await self.store.update_one(
                    "runs",
                    {
                        "organizationId": tenant.organization_id,
                        "projectId": tenant.project_id,
                        "runId": payload.target.id,
                    },
                    {
                        "$inc": {rollup_field: 1},
                        "$set": {
                            "evaluationRollup.status": "failed" if payload.passed is False else "passed",
                        },
                    },
                )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "evaluation.completed",
            {
                "evaluationId": stored["evaluationId"],
                "target": stored["target"],
                "metric": stored["metric"],
                "passed": stored["passed"],
            },
        )
        incident = None
        if payload.passed is False and payload.triggers_incident:
            title = f"{payload.metric.replace('_', ' ').title()} evaluation failed"
            signal_type = (
                "user_feedback" if payload.evaluator_type == "user_feedback" else "evaluation"
            )
            incident = await self.incidents.record_signal(
                tenant,
                agent_id=payload.agent_id,
                environment=payload.environment,
                signal_type=signal_type,
                signal_id=stored["evaluationId"],
                title=title,
                reason=payload.reason or title,
                metric=payload.metric,
                confidence=payload.confidence,
                score=payload.score,
                user_id=payload.metadata.get("source_user_id"),
                target_id=payload.target.id,
            )
        return stored, incident
