import asyncio
import json
from collections import defaultdict
from typing import Any, AsyncIterator

from app.core.serialization import json_safe
from app.core.time import utc_now


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: defaultdict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    @staticmethod
    def channel(organization_id: str, project_id: str) -> str:
        return f"{organization_id}:{project_id}"

    async def publish(
        self,
        organization_id: str,
        project_id: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        payload = {
            "type": event_type,
            "occurredAt": utc_now(),
            "data": data,
        }
        channel = self.channel(organization_id, project_id)
        async with self._lock:
            subscribers = list(self._subscribers[channel])
        for queue in subscribers:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(payload)

    async def subscribe(self, organization_id: str, project_id: str) -> AsyncIterator[str]:
        channel = self.channel(organization_id, project_id)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers[channel].add(queue)
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    body = json.dumps(json_safe(event), separators=(",", ":"))
                    yield f"event: {event['type']}\ndata: {body}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            async with self._lock:
                self._subscribers[channel].discard(queue)

