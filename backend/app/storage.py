import asyncio
import copy
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel, ReturnDocument
from pymongo.errors import PyMongoError
from pymongo.server_api import ServerApi

from app.config import Settings
from app.core.time import utc_now

logger = logging.getLogger(__name__)


def _get_path(document: dict[str, Any], path: str) -> Any:
    value: Any = document
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def _set_path(document: dict[str, Any], path: str, value: Any) -> None:
    target = document
    parts = path.split(".")
    for part in parts[:-1]:
        nested = target.get(part)
        if not isinstance(nested, dict):
            nested = {}
            target[part] = nested
        target = nested
    target[parts[-1]] = value


def _matches_value(actual: Any, expected: Any) -> bool:
    if not isinstance(expected, dict):
        if isinstance(actual, list):
            return expected in actual
        return actual == expected
    for operator, operand in expected.items():
        if operator == "$in" and actual not in operand:
            return False
        if operator == "$nin" and actual in operand:
            return False
        if operator == "$ne" and actual == operand:
            return False
        if operator == "$exists" and (actual is not None) != bool(operand):
            return False
        if operator == "$gte" and (actual is None or actual < operand):
            return False
        if operator == "$gt" and (actual is None or actual <= operand):
            return False
        if operator == "$lte" and (actual is None or actual > operand):
            return False
        if operator == "$lt" and (actual is None or actual >= operand):
            return False
    return True


def _matches(document: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, item) for item in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, item) for item in expected):
                return False
            continue
        if not _matches_value(_get_path(document, key), expected):
            return False
    return True


def _apply_update(document: dict[str, Any], update: dict[str, Any], inserting: bool = False) -> None:
    if not any(key.startswith("$") for key in update):
        document.clear()
        document.update(copy.deepcopy(update))
        return
    if inserting:
        for key, value in update.get("$setOnInsert", {}).items():
            _set_path(document, key, copy.deepcopy(value))
    for key, value in update.get("$set", {}).items():
        _set_path(document, key, copy.deepcopy(value))
    for key, value in update.get("$inc", {}).items():
        _set_path(document, key, (_get_path(document, key) or 0) + value)
    for key, value in update.get("$max", {}).items():
        current = _get_path(document, key)
        if current is None or value > current:
            _set_path(document, key, copy.deepcopy(value))
    for key, value in update.get("$min", {}).items():
        current = _get_path(document, key)
        if current is None or value < current:
            _set_path(document, key, copy.deepcopy(value))
    for key, value in update.get("$push", {}).items():
        current = _get_path(document, key)
        if not isinstance(current, list):
            current = []
            _set_path(document, key, current)
        current.append(copy.deepcopy(value))
    for key, value in update.get("$addToSet", {}).items():
        current = _get_path(document, key)
        if not isinstance(current, list):
            current = []
            _set_path(document, key, current)
        if value not in current:
            current.append(copy.deepcopy(value))


class Store(ABC):
    backend_name: str

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    async def ping(self) -> bool: ...

    @abstractmethod
    async def ensure_indexes(self) -> None: ...

    @abstractmethod
    async def insert_one(self, collection: str, document: dict[str, Any]) -> dict[str, Any]: ...

    @abstractmethod
    async def find_one(self, collection: str, query: dict[str, Any]) -> dict[str, Any] | None: ...

    @abstractmethod
    async def find_many(
        self,
        collection: str,
        query: dict[str, Any],
        *,
        sort: list[tuple[str, int]] | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def count(self, collection: str, query: dict[str, Any]) -> int: ...

    @abstractmethod
    async def update_one(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
    ) -> dict[str, Any] | None: ...

    @abstractmethod
    async def find_one_and_update(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
        sort: list[tuple[str, int]] | None = None,
    ) -> dict[str, Any] | None: ...

    @abstractmethod
    async def aggregate(self, collection: str, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def clear(self) -> None: ...


class InMemoryStore(Store):
    backend_name = "memory"

    def __init__(self) -> None:
        self._collections: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def ping(self) -> bool:
        return True

    async def ensure_indexes(self) -> None:
        return None

    async def insert_one(self, collection: str, document: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            stored = copy.deepcopy(document)
            self._collections[collection].append(stored)
            return copy.deepcopy(stored)

    async def find_one(self, collection: str, query: dict[str, Any]) -> dict[str, Any] | None:
        async with self._lock:
            for document in self._collections[collection]:
                if _matches(document, query):
                    return copy.deepcopy(document)
        return None

    async def find_many(
        self,
        collection: str,
        query: dict[str, Any],
        *,
        sort: list[tuple[str, int]] | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict[str, Any]]:
        async with self._lock:
            documents = [
                copy.deepcopy(item) for item in self._collections[collection] if _matches(item, query)
            ]
        if sort:
            for key, direction in reversed(sort):
                documents.sort(
                    key=lambda item: (_get_path(item, key) is not None, _get_path(item, key)),
                    reverse=direction < 0,
                )
        return documents[skip : skip + limit]

    async def count(self, collection: str, query: dict[str, Any]) -> int:
        async with self._lock:
            return sum(1 for item in self._collections[collection] if _matches(item, query))

    async def update_one(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
    ) -> dict[str, Any] | None:
        async with self._lock:
            for document in self._collections[collection]:
                if _matches(document, query):
                    _apply_update(document, update)
                    return copy.deepcopy(document)
            if not upsert:
                return None
            document = {key: copy.deepcopy(value) for key, value in query.items() if not key.startswith("$")}
            _apply_update(document, update, inserting=True)
            self._collections[collection].append(document)
            return copy.deepcopy(document)

    async def find_one_and_update(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
        sort: list[tuple[str, int]] | None = None,
    ) -> dict[str, Any] | None:
        async with self._lock:
            candidates = [item for item in self._collections[collection] if _matches(item, query)]
            if sort:
                for key, direction in reversed(sort):
                    candidates.sort(key=lambda item: _get_path(item, key), reverse=direction < 0)
            if candidates:
                document = candidates[0]
                _apply_update(document, update)
                return copy.deepcopy(document)
            if not upsert:
                return None
            document = {key: copy.deepcopy(value) for key, value in query.items() if not key.startswith("$")}
            _apply_update(document, update, inserting=True)
            self._collections[collection].append(document)
            return copy.deepcopy(document)

    async def aggregate(self, collection: str, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # The memory backend intentionally supports only the small subset used by the demo.
        documents = await self.find_many(collection, {}, limit=100_000)
        for stage in pipeline:
            if "$match" in stage:
                documents = [item for item in documents if _matches(item, stage["$match"])]
            elif "$sort" in stage:
                for key, direction in reversed(list(stage["$sort"].items())):
                    documents.sort(key=lambda item: _get_path(item, key), reverse=direction < 0)
            elif "$limit" in stage:
                documents = documents[: stage["$limit"]]
            else:
                raise NotImplementedError(f"Memory aggregation stage is unsupported: {stage}")
        return documents

    async def clear(self) -> None:
        async with self._lock:
            self._collections.clear()


class MongoStore(Store):
    backend_name = "mongodb"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: AsyncMongoClient | None = None
        self.database: Any = None

    async def connect(self) -> None:
        self.client = AsyncMongoClient(
            self.settings.mongodb_uri,
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=5_000,
            retryReads=True,
            retryWrites=True,
        )
        self.database = self.client[self.settings.mongodb_database]
        await self.client.admin.command("ping")

    async def close(self) -> None:
        if self.client is not None:
            await self.client.close()

    async def ping(self) -> bool:
        if self.client is None:
            return False
        await self.client.admin.command("ping")
        return True

    async def ensure_indexes(self) -> None:
        indexes: dict[str, list[IndexModel]] = {
            "agents": [
                IndexModel(
                    [("organizationId", ASCENDING), ("projectId", ASCENDING), ("agentId", ASCENDING)],
                    unique=True,
                )
            ],
            "runs": [
                IndexModel(
                    [("organizationId", ASCENDING), ("projectId", ASCENDING), ("runId", ASCENDING)],
                    unique=True,
                ),
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("agentId", ASCENDING),
                        ("startedAt", DESCENDING),
                    ]
                ),
            ],
            "traces": [
                IndexModel(
                    [("organizationId", ASCENDING), ("projectId", ASCENDING), ("traceId", ASCENDING)],
                    unique=True,
                )
            ],
            "spans": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("traceId", ASCENDING),
                        ("spanId", ASCENDING),
                    ],
                    unique=True,
                )
            ],
            "evaluations": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("target.id", ASCENDING),
                        ("createdAt", DESCENDING),
                    ]
                )
            ],
            "feedback": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("target.id", ASCENDING),
                        ("createdAt", DESCENDING),
                    ]
                )
            ],
            "incidents": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("fingerprint", ASCENDING),
                        ("status", ASCENDING),
                    ]
                ),
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("severity", ASCENDING),
                        ("lastSeenAt", DESCENDING),
                    ]
                ),
            ],
            "investigations": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("incidentId", ASCENDING),
                        ("createdAt", DESCENDING),
                    ]
                )
            ],
            "jobs": [
                IndexModel([("status", ASCENDING), ("availableAt", ASCENDING), ("createdAt", ASCENDING)])
            ],
            "auditEvents": [
                IndexModel(
                    [
                        ("organizationId", ASCENDING),
                        ("projectId", ASCENDING),
                        ("createdAt", DESCENDING),
                    ]
                )
            ],
        }
        for collection, collection_indexes in indexes.items():
            await self.database[collection].create_indexes(collection_indexes)

    async def insert_one(self, collection: str, document: dict[str, Any]) -> dict[str, Any]:
        stored = copy.deepcopy(document)
        await self.database[collection].insert_one(stored)
        stored.pop("_id", None)
        return stored

    async def find_one(self, collection: str, query: dict[str, Any]) -> dict[str, Any] | None:
        document = await self.database[collection].find_one(query, {"_id": 0})
        return document

    async def find_many(
        self,
        collection: str,
        query: dict[str, Any],
        *,
        sort: list[tuple[str, int]] | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict[str, Any]]:
        cursor = self.database[collection].find(query, {"_id": 0})
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        return await cursor.limit(limit).to_list(length=limit)

    async def count(self, collection: str, query: dict[str, Any]) -> int:
        return await self.database[collection].count_documents(query)

    async def update_one(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
    ) -> dict[str, Any] | None:
        document = await self.database[collection].find_one_and_update(
            query,
            update,
            upsert=upsert,
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0},
        )
        return document

    async def find_one_and_update(
        self,
        collection: str,
        query: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
        sort: list[tuple[str, int]] | None = None,
    ) -> dict[str, Any] | None:
        return await self.database[collection].find_one_and_update(
            query,
            update,
            upsert=upsert,
            sort=sort,
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0},
        )

    async def aggregate(self, collection: str, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cursor = await self.database[collection].aggregate(pipeline)
        documents = await cursor.to_list(length=None)
        for document in documents:
            document.pop("_id", None)
        return documents

    async def clear(self) -> None:
        for name in await self.database.list_collection_names():
            await self.database[name].delete_many({})


def _mongodb_startup_error(exc: Exception) -> RuntimeError:
    return RuntimeError(
        "MongoDB is required (STORAGE_BACKEND=mongodb) but the cluster is unreachable. "
        "Atlas Network Access must allow this machine's IP, outbound TCP 27017 must not "
        "be blocked, and the cluster must not be paused. "
        f"Original error: {exc}"
    )


async def create_store(settings: Settings) -> Store:
    if settings.resolved_storage_backend == "mongodb":
        store: Store = MongoStore(settings)
        try:
            await store.connect()
            await store.ensure_indexes()
            logger.info("Connected to MongoDB database %s", settings.mongodb_database)
            return store
        except (PyMongoError, OSError) as exc:
            await store.close()
            if settings.storage_backend == "mongodb":
                raise _mongodb_startup_error(exc) from exc
            logger.warning(
                "MongoDB is unreachable; falling back to in-memory storage. "
                "Data will be lost on restart. %s",
                exc,
            )
    store = InMemoryStore()
    await store.connect()
    await store.ensure_indexes()
    return store


def tenant_query(organization_id: str, project_id: str, **extra: Any) -> dict[str, Any]:
    return {"organizationId": organization_id, "projectId": project_id, **extra}


def new_document(organization_id: str, project_id: str, **fields: Any) -> dict[str, Any]:
    now = utc_now()
    return {
        "organizationId": organization_id,
        "projectId": project_id,
        "createdAt": now,
        "updatedAt": now,
        "schemaVersion": 1,
        **fields,
    }
