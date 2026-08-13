from typing import Any

from app.events import EventBroker
from app.models.schemas import DeploymentCreate
from app.security import TenantContext
from app.storage import Store, new_document, tenant_query


class DeploymentService:
    def __init__(self, store: Store, events: EventBroker) -> None:
        self.store = store
        self.events = events

    async def create(
        self, tenant: TenantContext, payload: DeploymentCreate
    ) -> dict[str, Any]:
        query = tenant_query(
            tenant.organization_id,
            tenant.project_id,
            deploymentId=payload.deployment_id,
        )
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            **payload.model_dump(),
        )
        stored = await self.store.update_one(
            "deployments",
            query,
            {"$set": document},
            upsert=True,
        )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "deployment.observed",
            {
                "deploymentId": payload.deployment_id,
                "environment": payload.environment,
                "status": payload.status,
            },
        )
        return stored or document

