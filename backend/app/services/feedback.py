from typing import Any

from app.core.ids import new_id
from app.core.redaction import redact_value
from app.events import EventBroker
from app.models.schemas import EvaluationCreate, EvaluationTarget, FeedbackCreate
from app.security import TenantContext
from app.services.evaluations import EvaluationService
from app.storage import Store, new_document


def feedback_passed(payload: FeedbackCreate) -> bool | None:
    if payload.sentiment == "negative":
        return False
    if payload.sentiment == "positive":
        return True
    if payload.rating is not None:
        if payload.rating <= 2:
            return False
        if payload.rating >= 4:
            return True
    return None


class FeedbackService:
    def __init__(
        self, store: Store, events: EventBroker, evaluations: EvaluationService
    ) -> None:
        self.store = store
        self.events = events
        self.evaluations = evaluations

    async def create(
        self, tenant: TenantContext, payload: FeedbackCreate
    ) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any] | None]:
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            feedbackId=new_id("feedback"),
            responseStatus="unanswered",
            **redact_value(payload.model_dump()),
        )
        stored = await self.store.insert_one("feedback", document)
        if payload.target.type == "run":
            await self.store.update_one(
                "runs",
                {
                    "organizationId": tenant.organization_id,
                    "projectId": tenant.project_id,
                    "runId": payload.target.id,
                },
                {"$inc": {"feedbackCount": 1}},
            )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "feedback.received",
            {
                "feedbackId": stored["feedbackId"],
                "target": stored["target"],
                "category": stored["category"],
                "sentiment": stored.get("sentiment"),
            },
        )
        passed = feedback_passed(payload)
        if passed is None:
            return stored, None, None
        score = None if payload.rating is None else (payload.rating - 1) / 4
        evaluation_payload = EvaluationCreate(
            target=EvaluationTarget(type=payload.target.type, id=payload.target.id),
            agent_id=payload.agent_id,
            environment=payload.environment,
            metric="user_satisfaction",
            rubric_version="feedback-v1",
            evaluator_type="user_feedback",
            evaluator_name=payload.category,
            score=score,
            label=payload.sentiment or ("positive" if passed else "negative"),
            passed=passed,
            confidence=0.95 if payload.comment else 0.85,
            reason=payload.comment or f"User rating: {payload.rating}",
            evidence_refs=[stored["feedbackId"]],
            triggers_incident=True,
            metadata={"source_user_id": payload.source_user_id},
        )
        evaluation, incident = await self.evaluations.create(tenant, evaluation_payload)
        await self.store.update_one(
            "feedback",
            {
                "organizationId": tenant.organization_id,
                "projectId": tenant.project_id,
                "feedbackId": stored["feedbackId"],
            },
            {"$set": {"evaluationId": evaluation["evaluationId"]}},
        )
        stored["evaluationId"] = evaluation["evaluationId"]
        return stored, evaluation, incident
