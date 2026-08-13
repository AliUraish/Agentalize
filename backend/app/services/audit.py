from typing import Any

from app.core.ids import new_id
from app.events import EventBroker
from app.security import TenantContext
from app.storage import Store, new_document


class AuditService:
    def __init__(self, store: Store, events: EventBroker) -> None:
        self.store = store
        self.events = events

    async def record(
        self,
        tenant: TenantContext,
        action: str,
        resource_type: str,
        resource_id: str,
        *,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            auditEventId=new_id("audit"),
            actor=tenant.actor,
            action=action,
            resource={"type": resource_type, "id": resource_id},
            details=details or {},
        )
        stored = await self.store.insert_one("auditEvents", document)
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "audit.recorded",
            {"auditEventId": stored["auditEventId"], "action": action},
        )
        return stored

