import hashlib
import re
from typing import Any

from app.core.ids import new_id
from app.core.redaction import redact_text
from app.core.time import utc_now
from app.events import EventBroker
from app.models.schemas import IncidentPatch, Severity
from app.security import TenantContext
from app.storage import Store, new_document, tenant_query


ACTIVE_STATUSES = [
    "detected",
    "triaging",
    "open",
    "investigating",
    "needs_input",
    "reproduced",
    "unreproduced",
    "fix_proposed",
    "testing",
    "awaiting_approval",
    "pr_created",
    "deployed",
    "verifying",
    "monitoring",
    "inconclusive",
]


def _normalized_reason(value: str) -> str:
    value = redact_text(value, max_length=2_000).lower()
    value = re.sub(r"\b[0-9a-f]{8,}\b", "<id>", value)
    value = re.sub(r"\b\d+\b", "<n>", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:500]


def fingerprint_for(agent_id: str, signal_type: str, metric: str, reason: str) -> str:
    source = "|".join([agent_id, signal_type, metric, _normalized_reason(reason)])
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def recommended_severity(
    signal_type: str,
    *,
    confidence: float = 1.0,
    score: float | None = None,
    explicit: Severity | None = None,
) -> Severity:
    if explicit:
        return explicit
    if signal_type in {"exception", "security", "policy_violation"} and confidence >= 0.8:
        return Severity.high
    if signal_type == "user_feedback" and score is not None and score <= 0.2:
        return Severity.high
    if confidence < 0.5:
        return Severity.low
    return Severity.medium


class IncidentService:
    def __init__(self, store: Store, events: EventBroker) -> None:
        self.store = store
        self.events = events

    async def record_signal(
        self,
        tenant: TenantContext,
        *,
        agent_id: str,
        environment: str,
        signal_type: str,
        signal_id: str,
        title: str,
        reason: str,
        metric: str = "unknown",
        confidence: float = 1.0,
        score: float | None = None,
        user_id: str | None = None,
        target_id: str | None = None,
        deployment_id: str | None = None,
        severity: Severity | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        fingerprint = fingerprint_for(agent_id, signal_type, metric, reason)
        fingerprint_query = tenant_query(
            tenant.organization_id,
            tenant.project_id,
            fingerprint=fingerprint,
            status={"$in": ACTIVE_STATUSES},
        )
        existing = None
        if target_id:
            existing = await self.store.find_one(
                "incidents",
                tenant_query(
                    tenant.organization_id,
                    tenant.project_id,
                    targetRefs=target_id,
                    status={"$in": ACTIVE_STATUSES},
                ),
            )
        if existing:
            query = tenant_query(
                tenant.organization_id,
                tenant.project_id,
                incidentId=existing["incidentId"],
            )
        else:
            query = fingerprint_query
            existing = await self.store.find_one("incidents", fingerprint_query)
        if existing:
            update: dict[str, Any] = {
                "$set": {"lastSeenAt": now, "updatedAt": now},
                "$inc": {"occurrenceCount": 1},
                "$addToSet": {
                    "signalRefs": signal_id,
                    "signalTypes": signal_type,
                    **({"targetRefs": target_id} if target_id else {}),
                    **({"affectedUserRefs": user_id} if user_id else {}),
                    **({"deploymentIds": deployment_id} if deployment_id else {}),
                },
            }
            if user_id and user_id not in existing.get("affectedUserRefs", []):
                update["$inc"]["affectedUserCount"] = 1
            incident = await self.store.update_one("incidents", query, update)
            event_type = "incident.updated"
        else:
            severity_value = recommended_severity(
                signal_type, confidence=confidence, score=score, explicit=severity
            )
            incident = new_document(
                tenant.organization_id,
                tenant.project_id,
                incidentId=new_id("inc"),
                agentId=agent_id,
                environment=environment,
                title=redact_text(title, 240),
                summary=redact_text(reason, 2_000),
                fingerprint=fingerprint,
                severity=severity_value.value,
                status="open",
                firstSeenAt=now,
                lastSeenAt=now,
                occurrenceCount=1,
                affectedUserCount=1 if user_id else 0,
                affectedUserRefs=[user_id] if user_id else [],
                deploymentIds=[deployment_id] if deployment_id else [],
                signalRefs=[signal_id],
                signalTypes=[signal_type],
                targetRefs=[target_id] if target_id else [],
                owner=None,
                activeInvestigationId=None,
                bestHypothesis=None,
                version=1,
            )
            incident = await self.store.insert_one("incidents", incident)
            event_type = "incident.created"
        await self.store.insert_one(
            "incidentSignals",
            new_document(
                tenant.organization_id,
                tenant.project_id,
                incidentSignalId=new_id("isig"),
                incidentId=incident["incidentId"],
                signalType=signal_type,
                signalId=signal_id,
                reason=redact_text(reason, 2_000),
            ),
        )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            event_type,
            {
                "incidentId": incident["incidentId"],
                "severity": incident["severity"],
                "status": incident["status"],
                "occurrenceCount": incident["occurrenceCount"],
            },
        )
        return incident

    async def get(self, tenant: TenantContext, incident_id: str) -> dict[str, Any] | None:
        return await self.store.find_one(
            "incidents",
            tenant_query(
                tenant.organization_id, tenant.project_id, incidentId=incident_id
            ),
        )

    async def patch(
        self, tenant: TenantContext, incident_id: str, patch: IncidentPatch
    ) -> dict[str, Any] | None:
        changes = patch.model_dump(exclude_none=True, exclude={"reason"})
        if not changes:
            return await self.get(tenant, incident_id)
        changes = {key: value.value if hasattr(value, "value") else value for key, value in changes.items()}
        changes["updatedAt"] = utc_now()
        incident = await self.store.update_one(
            "incidents",
            tenant_query(
                tenant.organization_id, tenant.project_id, incidentId=incident_id
            ),
            {"$set": changes, "$inc": {"version": 1}},
        )
        if incident:
            await self.events.publish(
                tenant.organization_id,
                tenant.project_id,
                "incident.status_changed",
                {"incidentId": incident_id, "changes": changes, "reason": patch.reason},
            )
        return incident
