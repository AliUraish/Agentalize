"""Seed the complete Agentalize demo flow through the public HTTP API."""

import asyncio
import os
from datetime import UTC, datetime, timedelta

import httpx


API_BASE = os.environ.get("AGENTALIZE_DEMO_API", "http://localhost:8000/api/v1")
SDK_HEADERS = {"x-api-key": os.environ.get("SDK_API_KEY", "demo-sdk-key")}
UI_HEADERS = {
    "x-organization-id": os.environ.get("DEMO_ORGANIZATION_ID", "org_demo"),
    "x-project-id": os.environ.get("DEMO_PROJECT_ID", "project_demo"),
    "x-actor-id": "hackathon-demo",
}


async def request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    headers: dict[str, str],
    json: dict | None = None,
) -> dict:
    response = await client.request(method, f"{API_BASE}{path}", headers=headers, json=json)
    response.raise_for_status()
    return response.json()


async def main() -> None:
    now = datetime.now(UTC)
    async with httpx.AsyncClient(timeout=60) as client:
        health = await request(client, "GET", "/health", headers=UI_HEADERS)
        print(f"Backend: {health['status']} ({health['storage']})")

        await request(
            client,
            "PUT",
            "/agents/support-agent",
            headers=UI_HEADERS,
            json={
                "agent_id": "support-agent",
                "name": "Account Support Agent",
                "description": "Answers account and balance questions.",
                "framework": "custom-python",
                "owner": "Agent Platform",
                "tags": ["demo", "support"],
                "mode": "fixer",
            },
        )

        await request(
            client,
            "POST",
            "/deployments",
            headers=SDK_HEADERS,
            json={
                "deployment_id": "deploy-demo-042",
                "environment": "production",
                "version": "2026.08.13.1",
                "git_commit_sha": "demo4c0ffee",
                "repository": "Agentalize/agent-demo",
                "status": "succeeded",
                "deployed_at": (now - timedelta(minutes=30)).isoformat(),
                "metadata": {"demo": True},
            },
        )

        trace = await request(
            client,
            "POST",
            "/ingest/traces",
            headers=SDK_HEADERS,
            json={
                "trace_id": "trace-demo-stale-balance-001",
                "run_id": "run-demo-stale-balance-001",
                "agent_id": "support-agent",
                "agent_name": "Account Support Agent",
                "environment": "production",
                "deployment_id": "deploy-demo-042",
                "git_commit_sha": "demo4c0ffee",
                "service_version": "2026.08.13.1",
                "user_id": "user_demo_17",
                "session_id": "session_demo_17",
                "spans": [
                    {
                        "span_id": "span-root-demo-001",
                        "name": "support_agent.run",
                        "start_time": (now - timedelta(seconds=3)).isoformat(),
                        "end_time": now.isoformat(),
                        "status": "ok",
                        "attributes": {"input.category": "account_balance"},
                    },
                    {
                        "span_id": "span-retrieval-demo-001",
                        "parent_span_id": "span-root-demo-001",
                        "name": "tool.account_balance_lookup",
                        "start_time": (now - timedelta(seconds=2.8)).isoformat(),
                        "end_time": (now - timedelta(seconds=2.0)).isoformat(),
                        "status": "ok",
                        "attributes": {
                            "tool.cache_age_seconds": 7200,
                            "tool.output": "balance=125.00",
                        },
                    },
                    {
                        "span_id": "span-llm-demo-001",
                        "parent_span_id": "span-root-demo-001",
                        "name": "openai.chat.completions.create",
                        "start_time": (now - timedelta(seconds=1.9)).isoformat(),
                        "end_time": now.isoformat(),
                        "status": "ok",
                        "attributes": {
                            "llm.request.model": "demo-model",
                            "llm.response.content": "Your balance is $125.00.",
                            "llm.usage.total_tokens": 87,
                        },
                    },
                ],
            },
        )
        print(f"Trace accepted: {trace['traceId']}")

        evaluation = await request(
            client,
            "POST",
            "/evaluations",
            headers=SDK_HEADERS,
            json={
                "target": {"type": "run", "id": "run-demo-stale-balance-001"},
                "agent_id": "support-agent",
                "environment": "production",
                "metric": "answer_correctness",
                "rubric_version": "account-balance-v1",
                "evaluator_type": "application",
                "evaluator_name": "live_balance_comparison",
                "score": 0,
                "label": "stale_balance",
                "passed": False,
                "confidence": 1,
                "reason": "The answer used a cached balance of $125; the live balance is $98.",
                "evidence_refs": ["span-retrieval-demo-001"],
                "triggers_incident": True,
            },
        )
        incident_id = evaluation["incident"]["incidentId"]
        print(f"Incident created: {incident_id}")

        await request(
            client,
            "POST",
            "/feedback",
            headers=SDK_HEADERS,
            json={
                "target": {"type": "run", "id": "run-demo-stale-balance-001"},
                "agent_id": "support-agent",
                "environment": "production",
                "rating": 1,
                "sentiment": "negative",
                "category": "incorrect_answer",
                "comment": "That balance is wrong. I just made a payment.",
                "source_user_id": "user_demo_17",
            },
        )
        print("User feedback linked to evaluation and incident pipeline")

        investigation = await request(
            client,
            "POST",
            f"/incidents/{incident_id}/investigations",
            headers=UI_HEADERS,
            json={
                "mode": "fixer",
                "requested_by": "hackathon-demo",
                "question": "Find why the agent returned stale account data and propose a testable fix.",
            },
        )
        inv = investigation["investigation"]
        print(f"Investigation {inv['investigationId']}: {inv['status']} / {inv['stage']}")

        incident = await request(
            client, "GET", f"/incidents/{incident_id}", headers=UI_HEADERS
        )
        print(f"Best hypothesis: {incident.get('bestHypothesis', {}).get('claim')}")
        print(f"Remediations ready: {len(incident.get('remediations', []))}")
        print(f"Open the API docs at {API_BASE.removesuffix('/api/v1')}/docs")


if __name__ == "__main__":
    asyncio.run(main())

