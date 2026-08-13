/**
 * Frontend read models for Agentalize, mirroring the MongoDB collections in §10.
 * Field names follow the architecture document so the control-plane API can
 * serve these documents with minimal reshaping.
 */

export type Environment = 'production' | 'staging' | 'development'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type IncidentStatus =
  | 'detected'
  | 'triaging'
  | 'monitoring'
  | 'open'
  | 'investigating'
  | 'needs_input'
  | 'reproduced'
  | 'unreproduced'
  | 'fix_proposed'
  | 'testing'
  | 'awaiting_approval'
  | 'pr_created'
  | 'deployed'
  | 'verifying'
  | 'resolved'
  | 'inconclusive'
  | 'regressed'
  | 'dismissed'

/** §8.1 — permissions. */
export type AutonomyMode =
  | 'monitor'
  | 'advisor'
  | 'investigator'
  | 'fixer'
  | 'guarded_autopilot'

/** §8.2 — the job the agent is doing right now. */
export type WorkMode =
  | 'triage'
  | 'diagnose'
  | 'retrieve_memory'
  | 'reproduce'
  | 'remediate'
  | 'verify_development'
  | 'verify_production'
  | 'decision_support'
  | 'explain_to_user'

export type EvaluatorType =
  | 'deterministic'
  | 'application'
  | 'user_explicit'
  | 'user_implicit'
  | 'human_reviewer'
  | 'model_judge'
  | 'statistical'

export interface Agent {
  agentId: string
  name: string
  owner: string
  framework: string
  environment: Environment
  activeVersion: string
  health: 'healthy' | 'degraded' | 'failing' | 'unknown'
  runs: number
  passRate: number | null
  satisfaction: number | null
  p95LatencyMs: number
  costPerRun: number
  openIncidents: number
  lastSeenAt: string
}

export interface Deployment {
  deploymentId: string
  environment: Environment
  version: string
  commitSha: string
  prNumber?: number
  deployedAt: string
  status: 'succeeded' | 'failed' | 'rolled_back'
  actor: string
  /** Offset in hours from the window start, for chart markers. */
  atHour: number
}

/** §10.2 — one evaluator fact. Never overwritten, never averaged away. */
export interface Evaluation {
  evaluationId: string
  target: { type: 'run' | 'trace' | 'span' | 'output' | 'incident'; id: string }
  metric: string
  rubricVersion: string
  evaluator: { type: EvaluatorType; name: string; model?: string }
  score: number | null
  label: string
  pass: boolean | null
  confidence: number
  reason: string
  evidenceRefs: string[]
  triggersIncident: boolean
  createdAt: string
}

export interface Feedback {
  feedbackId: string
  target: { type: 'run'; id: string }
  rating: 'positive' | 'negative'
  category: string
  comment: string
  /** Whether the comment shown here has been redacted by policy. */
  redacted: boolean
  userRef: string
  createdAt: string
  linkedIncidentId: string | null
  responseStatus: 'none' | 'drafted' | 'sent'
}

export interface Run {
  runId: string
  traceId: string
  agentId: string
  agentVersion: string
  startedAt: string
  durationMs: number
  status: 'ok' | 'error'
  userRef: string
  sessionRef: string
  rollup: { result: 'pass' | 'fail' | 'needs_review'; failed: number; passed: number }
  hasFeedback: boolean
  model: string
  toolCount: number
  tokens: number
  cost: number
  deploymentId: string
}

export type SpanType = 'workflow' | 'model' | 'tool' | 'retrieval' | 'function'

export interface Span {
  spanId: string
  parentSpanId: string | null
  traceId: string
  name: string
  type: SpanType
  startOffsetMs: number
  durationMs: number
  status: 'ok' | 'error'
  attributes: Record<string, unknown>
  /** Redaction-aware content; null means policy withheld it. */
  input: string | null
  output: string | null
  redactionReason?: string
  tokens?: number
  cost?: number
  error?: { type: string; message: string; stackFrame: string }
}

export interface Incident {
  incidentId: string
  agentId: string
  agentName: string
  title: string
  fingerprint: string
  severity: Severity
  status: IncidentStatus
  environment: Environment
  firstSeenAt: string
  lastSeenAt: string
  occurrenceCount: number
  affectedUserCount: number
  evaluationSummary: { failed: number; passed: number; conflicting: boolean }
  feedbackCount: number
  deploymentIds: string[]
  suspectedDeploymentId: string | null
  signalRefs: string[]
  owner: { teamId: string; userId: string | null }
  activeInvestigationId: string | null
  /** Narrative fields for the summary strip (§15.9). */
  whatHappened: string
  impact: string
  whatChanged: string
  recommendedAction: string
  /** Occurrence series for the window, one point per hour. */
  series: { hour: number; occurrences: number; affectedUsers: number }[]
  version: number
}

export interface Hypothesis {
  hypothesisId: string
  incidentId: string
  claim: string
  confidence: number
  status: 'proposed' | 'supported' | 'confirmed' | 'rejected'
  rationale: string
  supporting: EvidenceRef[]
  contradicting: EvidenceRef[]
}

export interface EvidenceRef {
  id: string
  type: 'trace' | 'evaluation' | 'feedback' | 'deployment' | 'exception' | 'metric' | 'code' | 'memory'
  label: string
  detail?: string
  /** Where clicking this evidence should take the user. */
  href?: string
}

export interface IncidentSignal {
  signalId: string
  type: EvidenceRef['type']
  label: string
  detail: string
  stance: 'supporting' | 'contradicting' | 'unreviewed'
  addedReason: string
  createdAt: string
  pinned: boolean
}

export interface Investigation {
  investigationId: string
  incidentId: string
  autonomyMode: AutonomyMode
  stage: string
  status: 'queued' | 'running' | 'needs_input' | 'paused' | 'completed' | 'cancelled'
  startedAt: string
  budgets: {
    tokens: { used: number; limit: number }
    cost: { used: number; limit: number }
    wallClockMs: { used: number; limit: number }
    toolCalls: { used: number; limit: number }
  }
  permissions: { label: string; granted: boolean; note?: string }[]
}

export interface DiffFile {
  path: string
  kind: 'test' | 'source' | 'config'
  additions: number
  deletions: number
  hunks: { header: string; lines: { kind: 'add' | 'del' | 'ctx'; text: string }[] }[]
}

export interface Remediation {
  remediationId: string
  incidentId: string
  branch: string
  baseSha: string
  summary: string
  reproduction: {
    status: 'reproduced' | 'not_reproduced' | 'pending'
    steps: string[]
    note: string
  }
  files: DiffFile[]
  risk: {
    label: string
    level: 'low' | 'medium' | 'high'
    detail: string
  }[]
  approval: {
    status: 'not_requested' | 'pending' | 'approved' | 'changes_requested'
    requiredApprovers: number
    approvers: { name: string; decidedAt: string | null; decision: string | null }[]
  }
  pullRequest: { number: number; url: string; status: string } | null
}

export interface TestRun {
  testRunId: string
  remediationId: string
  command: string
  suite: string
  status: 'passed' | 'failed' | 'skipped' | 'running'
  durationMs: number
  passed: number
  failed: number
  skipped: number
  /** Sanitized console output for the terminal panel. */
  output: string[]
}

export interface Verification {
  verificationId: string
  incidentId: string
  deploymentId: string
  windowHours: number
  verdict: 'improving' | 'resolved' | 'inconclusive' | 'regressed'
  sampleSize: { baseline: number; observed: number }
  confidence: number
  metrics: {
    metric: string
    baseline: number
    observed: number
    unit: '%' | 'ms' | '$' | 'count'
    /** Which direction counts as an improvement. */
    goodDirection: 'up' | 'down'
  }[]
}

export interface Memory {
  memoryId: string
  summary: string
  detail: string
  outcome: 'resolved' | 'ineffective' | 'rolled_back' | 'regressed'
  verified: boolean
  /** Why vector search returned this, in words a human can check. */
  similarityReason: string
  score: number
  agentId: string
  tags: string[]
  repositoryPaths: string[]
  regressionTest: string | null
  productionOutcome: string
  createdAt: string
  excludedFromRetrieval: boolean
}

/** §21 — in-app inbox. */
export interface AppNotification {
  notificationId: string
  type: string
  severity: Severity | 'info'
  title: string
  detail: string
  createdAt: string
  readAt: string | null
  deepLink: string
}

export interface TimelineEntry {
  entryId: string
  at: string
  actorType: 'agent' | 'human' | 'system'
  actor: string
  action: string
  detail: string
  kind: 'signal' | 'agent_step' | 'comment' | 'approval' | 'pr' | 'deployment' | 'verification' | 'status'
}

export interface OverviewKpi {
  key: string
  label: string
  value: number | null
  unit: '%' | 'ms' | '$' | 'count'
  /** Change vs the previous window, in the same unit. */
  delta: number | null
  sampleSize: number
  goodDirection: 'up' | 'down'
  /** Set when the number can't be trusted yet (§20 partial state). */
  dataQuality?: string
  series: number[]
}
