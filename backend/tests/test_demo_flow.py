from datetime import UTC, datetime, timedelta


def trace_payload(error: bool = False) -> dict:
    now = datetime.now(UTC)
    return {
        "trace_id": "trace-test-001",
        "run_id": "run-test-001",
        "agent_id": "python-sdk-test-agent",
        "agent_name": "Python SDK Test Agent",
        "environment": "production",
        "deployment_id": "deploy-test-001",
        "git_commit_sha": "abc123",
        "service_version": "1.0.0",
        "user_id": "user-test",
        "spans": [
            {
                "span_id": "span-root-001",
                "name": "support_agent.run",
                "start_time": (now - timedelta(seconds=1)).isoformat(),
                "end_time": now.isoformat(),
                "status": "error" if error else "ok",
                "attributes": {"llm.usage.total_tokens": 42},
                "events": [
                    {
                        "name": "exception",
                        "attributes": {"exception.message": "Article fetch timed out"},
                    }
                ]
                if error
                else [],
            }
        ],
    }


def test_health_and_auth(client, sdk_headers):
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["storage"] == "memory"
    assert client.post("/api/v1/ingest/traces", json=trace_payload()).status_code == 401
    assert (
        client.post("/api/v1/ingest/traces", headers=sdk_headers, json=trace_payload()).status_code
        == 202
    )


def test_trace_is_idempotent_and_error_creates_incident(client, sdk_headers, ui_headers):
    payload = trace_payload(error=True)
    first = client.post("/api/v1/ingest/traces", headers=sdk_headers, json=payload)
    assert first.status_code == 202
    assert first.json()["duplicate"] is False
    assert first.json()["incidentIds"]

    duplicate = client.post("/api/v1/ingest/traces", headers=sdk_headers, json=payload)
    assert duplicate.status_code == 202
    assert duplicate.json()["duplicate"] is True

    incidents = client.get("/api/v1/incidents", headers=ui_headers).json()
    assert incidents["count"] == 1
    assert incidents["items"][0]["severity"] == "high"


def test_feedback_evaluation_investigation_and_remediation(client, sdk_headers, ui_headers):
    assert (
        client.post("/api/v1/ingest/traces", headers=sdk_headers, json=trace_payload()).status_code
        == 202
    )
    evaluation = client.post(
        "/api/v1/evaluations",
        headers=sdk_headers,
        json={
            "target": {"type": "run", "id": "run-test-001"},
            "agent_id": "python-sdk-test-agent",
            "environment": "production",
            "metric": "answer_correctness",
            "evaluator_type": "application",
            "evaluator_name": "live_balance_check",
            "score": 0,
            "label": "incorrect",
            "passed": False,
            "confidence": 1,
            "reason": "The article fetch timed out before extraction completed.",
        },
    )
    assert evaluation.status_code == 201
    incident_id = evaluation.json()["incident"]["incidentId"]

    feedback = client.post(
        "/api/v1/feedback",
        headers=sdk_headers,
        json={
            "target": {"type": "run", "id": "run-test-001"},
            "agent_id": "python-sdk-test-agent",
            "rating": 1,
            "sentiment": "negative",
            "category": "article_fetch_failed",
            "comment": "The article URL could not be fetched.",
        },
    )
    assert feedback.status_code == 201
    assert feedback.json()["evaluation"]["passed"] is False
    assert feedback.json()["incident"]["incidentId"] == incident_id
    assert client.get("/api/v1/incidents", headers=ui_headers).json()["count"] == 1

    investigation = client.post(
        f"/api/v1/incidents/{incident_id}/investigations",
        headers=ui_headers,
        json={"mode": "fixer", "requested_by": "test-user"},
    )
    assert investigation.status_code == 202, investigation.text
    investigation_id = investigation.json()["investigation"]["investigationId"]
    detail = client.get(
        f"/api/v1/investigations/{investigation_id}", headers=ui_headers
    ).json()
    assert detail["status"] == "completed"
    assert detail["stage"] == "fix_proposed"
    assert detail["hypotheses"]
    assert detail["remediations"]
    assert detail["remediations"][0]["dryRun"] is True
    assert len(detail["steps"]) >= 3

    repository = client.get(
        f"/api/v1/investigations/{investigation_id}/repository", headers=ui_headers
    )
    assert repository.status_code == 200
    assert repository.json()["repositoryName"] == "repo"
    assert repository.json()["files"][0]["path"] == "python_gpt_agent/fetcher.py"
    assert {entry["path"] for entry in repository.json()["structure"]} == {
        "python_gpt_agent",
        "python_gpt_agent/fetcher.py",
    }

    source = client.get(
        f"/api/v1/investigations/{investigation_id}/repository/file",
        headers=ui_headers,
        params={"path": "python_gpt_agent/fetcher.py", "line": 4},
    )
    assert source.status_code == 200
    assert source.json()["focusLine"] == 4
    assert source.json()["lines"][3]["text"] == "    return requests.get(url, timeout=15)"

    assert client.get(
        "/api/v1/investigations",
        headers=ui_headers,
        params={"agent_id": "python-sdk-test-agent"},
    ).json()["count"] == 1
    assert client.get(
        "/api/v1/investigations",
        headers=ui_headers,
        params={"agent_id": "another-agent"},
    ).json()["count"] == 0

    traversal = client.get(
        f"/api/v1/investigations/{investigation_id}/repository/file",
        headers=ui_headers,
        params={"path": "../outside.py"},
    )
    assert traversal.status_code == 400

    run = client.get("/api/v1/runs/run-test-001", headers=ui_headers).json()
    assert run["evaluationRollup"]["failed"] == 2
    assert run["feedbackCount"] == 1


def test_memory_search_prefers_verified_match(client, ui_headers):
    resolved = {
        "incident_id": "inc-old",
        "title": "Article fetch timeout",
        "summary": "The source URL exceeded the extraction timeout.",
        "outcome": "resolved",
        "agent_id": "python-sdk-test-agent",
        "tags": ["fetch", "timeout"],
    }
    unrelated = {
        "incident_id": "inc-other",
        "title": "Email tool timeout",
        "summary": "SMTP timed out.",
        "outcome": "resolved",
        "agent_id": "python-sdk-test-agent",
        "tags": ["email"],
    }
    assert client.post("/api/v1/memories", headers=ui_headers, json=resolved).status_code == 201
    assert client.post("/api/v1/memories", headers=ui_headers, json=unrelated).status_code == 201
    results = client.get(
        "/api/v1/memories/search",
        headers=ui_headers,
        params={"query": "article fetch timeout", "agent_id": "python-sdk-test-agent"},
    ).json()
    assert results["items"][0]["title"] == "Article fetch timeout"
    assert results["items"][0]["verified"] is True


def test_signals_arriving_before_trace_are_reconciled(client, sdk_headers, ui_headers):
    evaluation = client.post(
        "/api/v1/evaluations",
        headers=sdk_headers,
        json={
            "target": {"type": "run", "id": "run-test-001"},
            "agent_id": "python-sdk-test-agent",
            "metric": "answer_correctness",
            "evaluator_type": "application",
            "evaluator_name": "inline_sdk_evaluator",
            "passed": False,
            "score": 0,
            "reason": "Evaluation completed before the trace exporter flushed.",
        },
    )
    assert evaluation.status_code == 201
    feedback = client.post(
        "/api/v1/feedback",
        headers=sdk_headers,
        json={
            "target": {"type": "run", "id": "run-test-001"},
            "agent_id": "python-sdk-test-agent",
            "rating": 1,
            "sentiment": "negative",
            "category": "article_fetch_failed",
        },
    )
    assert feedback.status_code == 201
    assert client.post(
        "/api/v1/ingest/traces", headers=sdk_headers, json=trace_payload()
    ).status_code == 202

    run = client.get("/api/v1/runs/run-test-001", headers=ui_headers).json()
    assert run["evaluationRollup"] == {"status": "failed", "passed": 0, "failed": 2}
    assert run["feedbackCount"] == 1
