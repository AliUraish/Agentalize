import math
import re
from typing import Any

from app.config import Settings
from app.core.ids import new_id
from app.models.schemas import MemoryCreate, MemorySearch
from app.security import TenantContext
from app.storage import MongoStore, Store, new_document, tenant_query


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9_]{3,}", value.lower())
        if token not in {"the", "and", "for", "with", "from", "that", "this"}
    }


def _keyword_score(query: str, memory: dict[str, Any]) -> float:
    left = _tokens(query)
    right = _tokens(
        " ".join(
            [
                str(memory.get("title", "")),
                str(memory.get("summary", "")),
                " ".join(memory.get("tags", [])),
            ]
        )
    )
    if not left or not right:
        return 0.0
    return len(left & right) / math.sqrt(len(left) * len(right))


class MemoryService:
    def __init__(self, store: Store, settings: Settings) -> None:
        self.store = store
        self.settings = settings

    async def create(
        self, tenant: TenantContext, payload: MemoryCreate
    ) -> dict[str, Any]:
        verified = payload.outcome == "resolved"
        document = new_document(
            tenant.organization_id,
            tenant.project_id,
            memoryId=new_id("mem"),
            verified=verified,
            retrievalWeight=1.0 if verified else 0.25,
            deprecated=False,
            **payload.model_dump(),
        )
        return await self.store.insert_one("memories", document)

    async def search(
        self, tenant: TenantContext, payload: MemorySearch
    ) -> list[dict[str, Any]]:
        base_filter = tenant_query(tenant.organization_id, tenant.project_id, deprecated=False)
        if payload.agent_id:
            base_filter["agent_id"] = payload.agent_id
        if payload.outcome:
            base_filter["outcome"] = payload.outcome

        if (
            payload.query_vector
            and self.settings.atlas_vector_search_enabled
            and isinstance(self.store, MongoStore)
        ):
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": self.settings.atlas_vector_index,
                        "path": "embedding",
                        "queryVector": payload.query_vector,
                        "numCandidates": max(50, payload.limit * 10),
                        "limit": payload.limit,
                        "filter": base_filter,
                    }
                },
                {"$set": {"similarityScore": {"$meta": "vectorSearchScore"}}},
                {"$project": {"embedding": 0}},
            ]
            try:
                return await self.store.aggregate("memories", pipeline)
            except Exception:
                # The demo remains usable when an Atlas vector index has not been created yet.
                pass

        candidates = await self.store.find_many(
            "memories", base_filter, sort=[("createdAt", -1)], limit=200
        )
        for item in candidates:
            item.pop("embedding", None)
            item["similarityScore"] = _keyword_score(payload.query, item)
        candidates.sort(
            key=lambda item: (
                item.get("similarityScore", 0) * item.get("retrievalWeight", 1),
                item.get("createdAt"),
            ),
            reverse=True,
        )
        return candidates[: payload.limit]

