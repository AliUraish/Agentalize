from datetime import UTC, date, datetime, timedelta, timezone

from app.core.serialization import json_safe


def test_naive_mongodb_datetime_is_serialized_as_utc() -> None:
    value = datetime(2026, 8, 13, 23, 13, 20, 865000)

    assert json_safe(value) == "2026-08-13T23:13:20.865000+00:00"


def test_aware_datetime_is_normalized_to_utc() -> None:
    pacific = timezone(-timedelta(hours=7))
    value = datetime(2026, 8, 13, 16, 13, 20, tzinfo=pacific)

    assert json_safe(value) == "2026-08-13T23:13:20+00:00"


def test_date_remains_a_date() -> None:
    assert json_safe(date(2026, 8, 13)) == "2026-08-13"


def test_utc_datetime_keeps_utc_offset() -> None:
    value = datetime(2026, 8, 13, 23, 13, 20, tzinfo=UTC)

    assert json_safe(value) == "2026-08-13T23:13:20+00:00"
