from datetime import UTC, date, datetime
from enum import Enum
from typing import Any

from bson import ObjectId


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, datetime):
        # MongoDB stores UTC datetimes but PyMongo returns them as naive values
        # by default. Always include the UTC offset in API responses so browsers
        # do not reinterpret trace timestamps as local wall-clock time.
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    return value
