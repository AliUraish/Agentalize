# Agentalize Python SDK

OpenTelemetry tracing for Python AI agents with OpenAI, Anthropic, and LangChain integrations.

## Install

```bash
pip install -e .
```

## Connect

Set the backend connection values:

```bash
export AGENTALIZE_API_KEY="your-api-key"
export AGENTALIZE_AGENT_ID="your-agent-id"
export AGENTALIZE_API_URL="https://your-backend.example.com"
export AGENTALIZE_ENVIRONMENT="production"
export AGENTALIZE_SERVICE_NAME="my-support-agent"
export AGENTALIZE_SERVICE_VERSION="1.0.0"
export AGENTALIZE_DEPLOYMENT_ID="deploy-123"
export AGENTALIZE_GIT_COMMIT_SHA="abc123"
```

Initialize Agentalize before running your agent:

```python
import agentalize

agentalize.init()
```

The SDK sends OTLP traces to:

```text
${AGENTALIZE_API_URL}/api/v1/traces
```

The API key is sent in the `x-api-key` header.

You can also provide the API key and agent ID directly:

```python
agentalize.init(
    api_key="your-api-key",
    agent_id="your-agent-id",
    api_url="http://localhost:8000",
    environment="production",
    service_name="my-support-agent",
    service_version="1.0.0",
    deployment_id="deploy-123",
    git_commit_sha="abc123",
)
```

For the local Agentalize demo backend:

```bash
export AGENTALIZE_API_URL="http://localhost:8000"
export AGENTALIZE_API_KEY="demo-sdk-key"
export AGENTALIZE_AGENT_ID="support-agent"
```

## Trace a Function

```python
from agentalize import trace

@trace
def run_agent(prompt):
    return f"Response to: {prompt}"
```

## OpenAI

```python
import agentalize
from agentalize.llms.openai import instrument

agentalize.init()
instrument()

from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Anthropic

```python
import agentalize
from agentalize.llms.anthropic import instrument

agentalize.init()
instrument()

from anthropic import Anthropic

client = Anthropic()
response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
```

## LangChain

```python
import agentalize
from agentalize.frameworks.langchain import get_callback_handler
from langchain_openai import ChatOpenAI

agentalize.init()
handler = get_callback_handler()

llm = ChatOpenAI(model="gpt-4")
response = llm.invoke("Hello", config={"callbacks": [handler]})
```

## Context

```python
import agentalize

agentalize.set_user("user-123")
agentalize.set_session("session-123")
agentalize.set_conversation("conversation-123")
```

Or scope context to one block:

```python
from agentalize import context

with context(user_id="user-123", session_id="session-123"):
    run_agent("Hello")
```

Give a run a stable application ID so traces, evaluations, and feedback are correlated:

```python
import agentalize
from agentalize import context, evaluate, feedback, trace

@trace
def run_agent(prompt):
    answer = "Your balance is $125."

    evaluate(
        "answer_correctness",
        passed=False,
        score=0,
        label="stale_balance",
        reason="The live account balance did not match the answer.",
        evaluator_name="live_balance_check",
    )

    feedback(
        rating=1,
        sentiment="negative",
        category="incorrect_answer",
        comment="The shown balance is wrong.",
        source_user_id="user-123",
    )
    return answer

with context(run_id="run-account-123", user_id="user-123"):
    run_agent("What is my balance?")

agentalize.flush()
```

`evaluate()` and `feedback()` infer the active `run_id`. Outside an active trace or run context, provide `target_id` explicitly.

With the local backend running, execute the included end-to-end example:

```bash
cd /Users/aliuraishmirani/Agentalize/agentalize-sdk
uv sync --dev
uv run python examples/backend_demo.py
```

Call `agentalize.flush()` when traces must be sent immediately and `agentalize.shutdown()` before an early process exit.
