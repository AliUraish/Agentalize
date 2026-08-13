from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Agentalize Demo API"
    app_env: str = "development"
    debug: bool = True
    api_prefix: str = "/api/v1"

    storage_backend: Literal["auto", "mongodb", "memory"] = "auto"
    mongodb_uri: str = ""
    mongodb_database: str = "agentalize_demo"

    sdk_api_key: str = "demo-sdk-key"
    demo_organization_id: str = "org_demo"
    demo_project_id: str = "project_demo"
    frontend_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )

    run_worker_inline: bool = True
    worker_poll_seconds: float = 1.0

    demo_repository_path: Path = Path("../Agentalize_sdk")
    allow_repository_writes: bool = False
    max_repository_files: int = 300
    max_repository_file_bytes: int = 200_000

    ai_api_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_embedding_model: str = ""

    atlas_vector_search_enabled: bool = False
    atlas_vector_index: str = "memory_vector_index"

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @property
    def resolved_storage_backend(self) -> Literal["mongodb", "memory"]:
        if self.storage_backend == "mongodb":
            return "mongodb"
        if self.storage_backend == "memory":
            return "memory"
        return "mongodb" if self.mongodb_uri else "memory"

    @property
    def repository_path(self) -> Path:
        return self.demo_repository_path.expanduser().resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()

