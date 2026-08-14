from unittest.mock import AsyncMock, patch

import pytest
from pymongo.errors import ServerSelectionTimeoutError

from app.config import Settings
from app.storage import InMemoryStore, create_store


def _timeout() -> ServerSelectionTimeoutError:
    return ServerSelectionTimeoutError("No replica set members found yet")


@pytest.mark.asyncio
async def test_create_store_falls_back_to_memory_when_mongo_unreachable():
    settings = Settings(storage_backend="auto", mongodb_uri="mongodb://localhost:27017")
    with patch("app.storage.MongoStore.connect", AsyncMock(side_effect=_timeout())):
        store = await create_store(settings)
    assert isinstance(store, InMemoryStore)
    await store.close()


@pytest.mark.asyncio
async def test_create_store_raises_when_mongodb_is_required():
    settings = Settings(storage_backend="mongodb", mongodb_uri="mongodb://localhost:27017")
    with patch("app.storage.MongoStore.connect", AsyncMock(side_effect=_timeout())):
        with pytest.raises(RuntimeError, match="STORAGE_BACKEND=mongodb"):
            await create_store(settings)
