# Agentalize Demo Backend

A local, modular FastAPI backend for the Agentalize hackathon demo. It receives production-agent telemetry from the Python SDK, stores evaluations and user feedback, correlates incidents, searches historical memory, and runs a bounded repository investigation that can produce a dry-run remediation proposal.

Docker and deployment infrastructure are intentionally excluded.

## What is implemented

- OTLP/HTTP protobuf ingestion at the endpoint already used by the Python SDK.
- A simple JSON trace endpoint for demo scripts and debugging.
- Runs, traces, spans, agents, evaluations, feedback, deployments, incidents, investigations, hypotheses, remediations, approvals, memories, jobs, and audit events.
- User feedback automatically becomes an evaluation and can trigger an incident.
- Failing evaluations and exceptions are fingerprinted and correlated into incidents.
- MongoDB Atlas/local MongoDB using the official async PyMongo API.
- Zero-setup in-memory storage when no MongoDB connection string is set.
- Atlas Vector Search support when configured, with keyword-memory fallback.
- Read-only repository inspection and optional OpenAI-compatible diagnosis.
- Fixer-mode dry-run test and remediation proposals. Repository writes are disabled by default.
- REST APIs for the frontend and Server-Sent Events for live updates.
- A complete seeded demo flow and automated tests.

## Local setup

Requirements:

- Python 3.11+
- `uv`
- MongoDB Atlas is optional. In-memory mode works without MongoDB.

```bash
cd /Users/aliuraishmirani/Agentalize/backend
cp .env.example .env
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000
```

Open:

- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

The default SDK key is `demo-sdk-key`. This is local demo authentication, not a production auth system.

## Storage modes

### Zero-setup demo

Leave `MONGODB_URI` empty. The API uses in-memory storage. Data disappears when the backend restarts.

### MongoDB Atlas or local MongoDB

Set:

```dotenv
STORAGE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/
MONGODB_DATABASE=agentalize_demo
```

The backend creates normal indexes automatically. To use Atlas Vector Search, create a vector index on `memories.embedding`, then set:

```dotenv
ATLAS_VECTOR_SEARCH_ENABLED=true
ATLAS_VECTOR_INDEX=memory_vector_index
```

Without a vector index, memory search uses a deterministic keyword similarity fallback.

## Run the complete demo

Keep the backend running, then use another terminal:

```bash
cd /Users/aliuraishmirani/Agentalize/backend
cd /Users/aliuraishmirani/Python_gpt_gemini
uv run python scripts/seed_agentalize_demo.py
```

The script:

1. Registers the Python SDK Test Agent and its `Python_gpt_gemini` deployment.
2. Sends article-fetch traces for a successful fetch, CORS rejection, and timeout.
3. Sends a failing correctness evaluation.
4. Sends negative user feedback attached to the same run.
5. Creates an incident.
6. Starts a Fixer-mode repository investigation.
7. Retrieves memory, inspects the configured repository, creates a hypothesis, and stores a dry-run remediation proposal.

Run it once per backend session because the trace ID is intentionally stable to demonstrate idempotency.

## Connect the Python SDK

Use the local API URL before initializing the current SDK:

```bash
export AGENTALIZE_API_URL=http://localhost:8000
export AGENTALIZE_API_KEY=demo-sdk-key
export AGENTALIZE_AGENT_ID=python-sdk-test-agent
```

The SDK sends OTLP protobuf to `http://localhost:8000/api/v1/traces`.

## Frontend connection

Base URL:

```text
http://localhost:8000/api/v1
```

Demo frontend headers are optional because the backend supplies the default tenant. Sending them makes the contract explicit:

```text
x-organization-id: org_demo
x-project-id: project_demo
x-actor-id: frontend-user
```

Subscribe to live updates with:

```text
GET /api/v1/events
```

Important frontend endpoints:

- `GET /overview`
- `GET /agents`
- `GET /runs`
- `GET /runs/{runId}`
- `GET /traces/{traceId}`
- `GET /evaluations`
- `GET /feedback`
- `GET /incidents`
- `GET /incidents/{incidentId}`
- `GET /incidents/{incidentId}/timeline`
- `POST /incidents/{incidentId}/investigations`
- `GET /investigations/{investigationId}`
- `GET /remediations/{remediationId}`
- `POST /remediations/{remediationId}/approvals`
- `GET /memories/search`
- `GET /deployments`
- `GET /audit-events`

The OpenAPI document at `/openapi.json` is the exact frontend contract.

## Worker modes

The simplest demo runs investigation jobs immediately inside the API process:

```dotenv
RUN_WORKER_INLINE=true
```

For a separate backend worker process, both processes must use MongoDB:

```dotenv
RUN_WORKER_INLINE=false
STORAGE_BACKEND=mongodb
MONGODB_URI=...
```

Then run:

```bash
# Terminal 1
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2
uv run python -m app.worker
```

Do not use a separate worker with in-memory storage because the processes would not share data.

## Optional AI provider

Without an AI provider, the investigation uses deterministic, evidence-based demo analysis. To use an OpenAI-compatible chat-completions API:

```dotenv
AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=...
AI_MODEL=...
```

The model receives only a bounded incident summary, redacted repository evidence, and selected memories. Its output is treated as a hypothesis, never as a verified fact.

## Repository safety

The investigator is read-only by default:

```dotenv
DEMO_REPOSITORY_PATH=/Users/aliuraishmirani/Python_gpt_gemini
ALLOW_REPOSITORY_WRITES=false
```

Fixer mode currently creates a stored dry-run remediation proposal rather than editing the repository. This keeps the hackathon demo safe and makes the approval UI meaningful.

## Tests

```bash
uv run pytest -q
```

Tests cover authentication, JSON and OTLP ingestion, idempotency, exception incidents, evaluation/feedback correlation, investigation/remediation flow, and memory retrieval.

## Demo limitations

- Frontend authentication is a fixed local tenant context.
- In-process SSE does not fan out across multiple API replicas.
- Incident correlation is deterministic fingerprinting; semantic incident clustering can be added later.
- Production deployment verification and real Git pull requests remain represented in the architecture but are not required for the local demo.
- Repository modifications and test command execution remain disabled until sandboxing is implemented.
