"""Reset only the local demo tenant before seeding the Python fetch story."""

from __future__ import annotations

import asyncio
from pathlib import Path
import sys

from pymongo import AsyncMongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


async def main() -> None:
    settings = Settings()
    if settings.resolved_storage_backend != "mongodb" or not settings.mongodb_uri:
        raise RuntimeError("This reset requires the configured MongoDB demo database")
    if settings.mongodb_database != "agentalize_demo":
        raise RuntimeError(
            f"Refusing to reset non-demo database: {settings.mongodb_database}"
        )

    client = AsyncMongoClient(settings.mongodb_uri)
    database = client[settings.mongodb_database]
    tenant = {
        "organizationId": settings.demo_organization_id,
        "projectId": settings.demo_project_id,
    }
    removed = 0
    for collection_name in await database.list_collection_names():
        result = await database[collection_name].delete_many(tenant)
        removed += result.deleted_count
    await client.close()
    print(
        f"Removed {removed} documents from "
        f"{settings.mongodb_database}/{settings.demo_organization_id}/{settings.demo_project_id}"
    )


if __name__ == "__main__":
    asyncio.run(main())
