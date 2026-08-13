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
)
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

Call `agentalize.flush()` when traces must be sent immediately and `agentalize.shutdown()` before an early process exit.
