from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, status

from app.config import Settings


@dataclass(frozen=True)
class TenantContext:
    organization_id: str
    project_id: str
    actor: str = "demo-user"


def _settings(request: Request) -> Settings:
    return request.app.state.container.settings


async def sdk_tenant(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
) -> TenantContext:
    settings = _settings(request)
    if not x_api_key or x_api_key != settings.sdk_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid SDK API key")
    return TenantContext(settings.demo_organization_id, settings.demo_project_id, "sdk")


async def frontend_tenant(
    request: Request,
    x_organization_id: str | None = Header(default=None, alias="x-organization-id"),
    x_project_id: str | None = Header(default=None, alias="x-project-id"),
    x_actor_id: str | None = Header(default=None, alias="x-actor-id"),
) -> TenantContext:
    settings = _settings(request)
    organization_id = x_organization_id or settings.demo_organization_id
    project_id = x_project_id or settings.demo_project_id
    # This local demo intentionally has one tenant. Production auth must derive scope from identity.
    if organization_id != settings.demo_organization_id or project_id != settings.demo_project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is out of scope")
    return TenantContext(organization_id, project_id, x_actor_id or "demo-user")

