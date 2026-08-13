from datetime import timedelta
from typing import Any

from app.core.ids import new_id
from app.core.time import utc_now
from app.security import TenantContext
from app.storage import Store, new_document


class JobService:
    def __init__(self, store: Store) -> None:
        self.store = store

    async def enqueue(
        self,
        tenant: TenantContext,
        job_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            jobId=new_id("job"),
            type=job_type,
            payload=payload,
            status="queued",
            attempts=0,
            maxAttempts=3,
            availableAt=utc_now(),
            lockedAt=None,
            completedAt=None,
            error=None,
        )
        return await self.store.insert_one("jobs", document)

    async def claim(self) -> dict[str, Any] | None:
        now = utc_now()
        return await self.store.find_one_and_update(
            "jobs",
            {
                "status": "queued",
                "availableAt": {"$lte": now},
            },
            {
                "$set": {"status": "running", "lockedAt": now, "updatedAt": now},
                "$inc": {"attempts": 1},
            },
            sort=[("createdAt", 1)],
        )

    async def complete(self, job_id: str, result: dict[str, Any]) -> None:
        now = utc_now()
        await self.store.update_one(
            "jobs",
            {"jobId": job_id},
            {
                "$set": {
                    "status": "completed",
                    "result": result,
                    "completedAt": now,
                    "updatedAt": now,
                }
            },
        )

    async def fail(self, job: dict[str, Any], error: str) -> None:
        now = utc_now()
        attempts = int(job.get("attempts", 1))
        max_attempts = int(job.get("maxAttempts", 3))
        if attempts >= max_attempts:
            status = "failed"
            available_at = now
        else:
            status = "queued"
            available_at = now + timedelta(seconds=min(30, 2**attempts))
        await self.store.update_one(
            "jobs",
            {"jobId": job["jobId"]},
            {
                "$set": {
                    "status": status,
                    "error": error[:2_000],
                    "availableAt": available_at,
                    "lockedAt": None,
                    "updatedAt": now,
                }
            },
        )

