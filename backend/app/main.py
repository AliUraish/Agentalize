from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.config import Settings, get_settings
from app.container import Container


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = await Container.create(resolved_settings)
        yield
        await app.state.container.close()

    app = FastAPI(
        title=resolved_settings.app_name,
        version="0.1.0",
        description="Telemetry, evaluation, incident, memory, and remediation API for the Agentalize demo.",
        debug=resolved_settings.debug,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix=resolved_settings.api_prefix)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "name": resolved_settings.app_name,
            "docs": "/docs",
            "health": f"{resolved_settings.api_prefix}/health",
        }

    return app


app = create_app()

