from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")


class AgentMode(str, Enum):
    monitor = "monitor"
    advisor = "advisor"
    investigator = "investigator"
    fixer = "fixer"
    guarded_autopilot = "guarded_autopilot"


class IncidentStatus(str, Enum):
    detected = "detected"
    triaging = "triaging"
    open = "open"
    investigating = "investigating"
    needs_input = "needs_input"
    reproduced = "reproduced"
    unreproduced = "unreproduced"
    fix_proposed = "fix_proposed"
    testing = "testing"
    awaiting_approval = "awaiting_approval"
    pr_created = "pr_created"
    deployed = "deployed"
    verifying = "verifying"
    resolved = "resolved"
    inconclusive = "inconclusive"
    regressed = "regressed"
    monitoring = "monitoring"
    dismissed = "dismissed"


class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Pagination(APIModel):
    limit: int = Field(default=50, ge=1, le=200)
    cursor: str | None = None


class Page(APIModel):
    items: list[dict[str, Any]]
    next_cursor: str | None = None
    count: int


class SpanInput(APIModel):
    span_id: str
    parent_span_id: str | None = None
    name: str
    kind: str = "internal"
    start_time: datetime
    end_time: datetime
    status: Literal["ok", "error", "unset"] = "unset"
    attributes: dict[str, Any] = Field(default_factory=dict)
    events: list[dict[str, Any]] = Field(default_factory=list)


class TraceInput(APIModel):
    trace_id: str
    run_id: str | None = None
    agent_id: str
    agent_name: str | None = None
    environment: str = "production"
    deployment_id: str | None = None
    git_commit_sha: str | None = None
    service_version: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    conversation_id: str | None = None
    spans: list[SpanInput] = Field(min_length=1)


class EvaluationTarget(APIModel):
    type: Literal["run", "trace", "span", "output", "incident", "deployment", "remediation"]
    id: str


class EvaluationCreate(APIModel):
    target: EvaluationTarget
    agent_id: str
    environment: str = "production"
    metric: str
    rubric_version: str = "v1"
    evaluator_type: Literal[
        "deterministic", "application", "user_feedback", "human", "model_judge", "statistical"
    ]
    evaluator_name: str
    score: float | None = Field(default=None, ge=0, le=1)
    label: str | None = None
    passed: bool | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)
    reason: str = ""
    evidence_refs: list[str] = Field(default_factory=list)
    triggers_incident: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metric", "evaluator_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "_")


class FeedbackTarget(APIModel):
    type: Literal["run", "trace", "span", "output"]
    id: str


class FeedbackCreate(APIModel):
    target: FeedbackTarget
    agent_id: str
    environment: str = "production"
    rating: int | None = Field(default=None, ge=1, le=5)
    sentiment: Literal["positive", "neutral", "negative"] | None = None
    category: str = "general"
    comment: str = ""
    source_user_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "_")


class AgentUpsert(APIModel):
    agent_id: str
    name: str
    description: str = ""
    framework: str | None = None
    owner: str | None = None
    tags: list[str] = Field(default_factory=list)
    mode: AgentMode = AgentMode.monitor


class DeploymentCreate(APIModel):
    deployment_id: str
    environment: str
    version: str | None = None
    git_commit_sha: str
    repository: str | None = None
    status: Literal["started", "succeeded", "failed", "rolled_back"] = "succeeded"
    deployed_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class IncidentPatch(APIModel):
    status: IncidentStatus | None = None
    severity: Severity | None = None
    owner: str | None = None
    title: str | None = None
    reason: str = ""


class InvestigationCreate(APIModel):
    mode: AgentMode = AgentMode.investigator
    repository_path: str | None = None
    requested_by: str = "demo-user"
    question: str | None = None


class InvestigationMessage(APIModel):
    message: str = Field(min_length=1, max_length=5000)
    author: str = "demo-user"


class ApprovalCreate(APIModel):
    decision: Literal["approved", "rejected", "changes_requested"]
    reason: str = Field(min_length=1, max_length=2000)
    actor: str = "demo-user"


class MemoryCreate(APIModel):
    incident_id: str
    title: str
    summary: str
    outcome: Literal["resolved", "ineffective", "rolled_back", "regressed", "unknown"]
    agent_id: str
    tags: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    remediation_id: str | None = None
    embedding: list[float] | None = None


class MemorySearch(APIModel):
    query: str = ""
    agent_id: str | None = None
    outcome: str | None = None
    limit: int = Field(default=10, ge=1, le=50)
    query_vector: list[float] | None = None


class ErrorResponse(APIModel):
    detail: str

