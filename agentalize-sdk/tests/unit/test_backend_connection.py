from unittest.mock import MagicMock

import pytest

from agentalize.client import Agentalize, AgentalizeAPIError
from agentalize.config import Config
from agentalize.context import context


def client_with_mock_http() -> tuple[Agentalize, MagicMock]:
    client = Agentalize.__new__(Agentalize)
    client.config = Config(
        api_key="demo-sdk-key",
        agent_id="support-agent",
        api_url="http://localhost:8000/",
        environment="production",
    )
    client._is_shutdown = False
    response = MagicMock()
    response.json.return_value = {"ok": True}
    response.raise_for_status.return_value = None
    session = MagicMock()
    session.post.return_value = response
    client._http = session
    return client, session


def test_config_normalizes_local_backend_url():
    config = Config(
        api_key="key",
        agent_id="agent",
        api_url="http://localhost:8000/",
        environment="staging",
        service_name="support-service",
        service_version="2.1.0",
        deployment_id="deploy-1",
        git_commit_sha="abc123",
    )
    config.validate()
    assert config.api_url == "http://localhost:8000"
    assert config.environment == "staging"
    assert config.service_name == "support-service"
    assert config.service_version == "2.1.0"


def test_evaluation_uses_run_context_and_backend_contract():
    client, session = client_with_mock_http()
    with context(run_id="run-123"):
        result = client.evaluate(
            "answer_correctness",
            passed=False,
            score=0,
            reason="Wrong answer",
            evaluator_name="test",
        )
    assert result == {"ok": True}
    url = session.post.call_args.args[0]
    payload = session.post.call_args.kwargs["json"]
    assert url == "http://localhost:8000/api/v1/evaluations"
    assert payload["target"] == {"type": "run", "id": "run-123"}
    assert payload["agent_id"] == "support-agent"
    assert payload["passed"] is False


def test_feedback_uses_explicit_target_and_backend_contract():
    client, session = client_with_mock_http()
    client.feedback(
        target_id="run-456",
        rating=1,
        sentiment="negative",
        category="incorrect_answer",
        comment="This is wrong",
        source_user_id="user-1",
    )
    payload = session.post.call_args.kwargs["json"]
    assert session.post.call_args.args[0] == "http://localhost:8000/api/v1/feedback"
    assert payload["target"]["id"] == "run-456"
    assert payload["source_user_id"] == "user-1"


def test_explicit_signal_requires_target_outside_trace():
    client, _ = client_with_mock_http()
    with pytest.raises(ValueError, match="target_id is required"):
        client.evaluate("answer_correctness", passed=True)


def test_api_failure_is_wrapped():
    client, session = client_with_mock_http()
    import requests

    session.post.side_effect = requests.ConnectionError("offline")
    with pytest.raises(AgentalizeAPIError, match="request failed"):
        client.feedback(target_id="run-1", rating=1)

