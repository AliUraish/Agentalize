import re
from typing import Any


SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
]


def redact_text(value: str, max_length: int = 20_000) -> str:
    result = value[:max_length]
    for pattern in SECRET_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if key.lower() in {"authorization", "api_key", "apikey", "password", "secret", "token"}:
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = redact_value(item)
        return redacted
    return value
