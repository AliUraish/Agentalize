"""Send a real trace, evaluation, and feedback event to the local backend."""

import agentalize
from agentalize import context, evaluate, feedback, trace


agentalize.init(
    api_key="demo-sdk-key",
    agent_id="new-sdk-agent",
    api_url="http://localhost:8000",
    environment="production",
    service_name="new-sdk-demo",
    service_version="0.1.0",
    deployment_id="deploy-new-sdk-1",
    git_commit_sha="abc123demo",
)


@trace
def answer_balance_question() -> str:
    answer = "Your balance is $125."
    evaluation = evaluate(
        "answer_correctness",
        passed=False,
        score=0,
        label="stale_balance",
        reason="Live balance is $98 but the response used $125.",
        evaluator_name="live_balance_check",
    )
    user_feedback = feedback(
        rating=1,
        sentiment="negative",
        category="incorrect_answer",
        comment="The balance is wrong.",
        source_user_id="sdk-demo-user",
    )
    assert evaluation["incident"]["incidentId"] == user_feedback["incident"]["incidentId"]
    return answer


with context(
    run_id="run-from-new-sdk-001",
    user_id="sdk-demo-user",
    session_id="sdk-session-001",
):
    print(answer_balance_question())

print("Trace exported:", agentalize.flush())
agentalize.shutdown()

