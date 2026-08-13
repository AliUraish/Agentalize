from app.core.redaction import redact_text, redact_value


def test_preserves_hex_identifiers_used_for_trace_linkage() -> None:
    run_id = "run-article-a18f551a8fac4edeb9e6a9035b9bcaa0"

    assert redact_text(run_id) == run_id
    assert redact_value({"target": {"id": run_id}}) == {"target": {"id": run_id}}


def test_redacts_explicit_secret_values() -> None:
    assert redact_text("api_key=super-secret-value") == "[REDACTED]"
    assert redact_text("sk-exampleprojectkey123456") == "[REDACTED]"
    assert redact_value({"password": "visible", "runId": "abc123"}) == {
        "password": "[REDACTED]",
        "runId": "abc123",
    }
