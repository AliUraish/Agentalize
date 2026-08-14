import type {
  Agent,
  Deployment,
  Incident,
  Investigation,
  OverviewKpi,
} from '../types/domain'
import { DEMO_AGENT_ID, DEMO_AGENT_NAME } from './demoScope'

export interface BackendOverview {
  windowHours: number
  environment: string | null
  metrics: {
    runs: number
    successfulRuns: number
    successRate: number | null
    evaluationPassRate: number | null
    evaluationSampleSize: number
    negativeFeedbackRate: number | null
    feedbackSampleSize: number
    p95LatencyMs: number | null
    totalCost: number
    openIncidents: number
  }
  needsAttention: BackendIncident[]
  activeInvestigations: BackendInvestigation[]
}

export interface BackendAgent {
  agentId: string
  name: string
  description?: string
  framework?: string | null
  owner?: string | null
  mode?: string
  activeVersion?: string | null
  lastSeenAt?: string
}

export interface BackendIncident {
  incidentId: string
  agentId: string
  title: string
  summary?: string
  fingerprint: string
  severity: Incident['severity']
  status: Incident['status']
  environment: Incident['environment']
  firstSeenAt: string
  lastSeenAt: string
  occurrenceCount: number
  affectedUserCount: number
  deploymentIds?: string[]
  suspectedDeploymentId?: string | null
  signalRefs?: string[]
  signalTypes?: string[]
  owner?: string | { teamId?: string; userId?: string | null } | null
  activeInvestigationId?: string | null
  bestHypothesis?: { hypothesisId: string; claim: string; confidence: number } | null
  hypotheses?: { hypothesisId: string; claim: string; confidence: number; status?: string }[]
  signals?: Record<string, unknown>[]
  investigations?: BackendInvestigation[]
  remediations?: Record<string, unknown>[]
  version?: number
}

export interface BackendDeployment {
  deploymentId?: string
  deployment_id?: string
  environment: Deployment['environment']
  version?: string | null
  git_commit_sha?: string
  deployed_at?: string
  createdAt?: string
  status: Deployment['status']
  repository?: string | null
}

export interface BackendEvaluation {
  evaluationId: string
  metric: string
  passed: boolean | null
  createdAt: string
}

export interface BackendFeedback {
  feedbackId: string
  category: string
  sentiment?: string | null
  rating?: number | null
  createdAt: string
}

export interface BackendInvestigation {
  investigationId: string
  incidentId: string
  mode: Investigation['autonomyMode']
  stage: string
  status: Investigation['status']
  createdAt: string
  completedAt?: string
  permissions?: Record<string, boolean>
  budgets?: { maxFiles?: number; maxSteps?: number }
}

export function mapIncident(raw: BackendIncident, agents: BackendAgent[] = []): Incident {
  const agent = agents.find((item) => item.agentId === raw.agentId)
  const failedEvaluations = raw.signalTypes?.filter((type) => type === 'evaluation').length ?? 0
  const feedbackCount = raw.signalTypes?.filter((type) => type === 'user_feedback').length ?? 0
  const owner = typeof raw.owner === 'string' ? raw.owner : raw.owner?.teamId
  const summary = raw.summary || 'Production signals were correlated into this incident.'

  return {
    incidentId: raw.incidentId,
    agentId: raw.agentId,
    agentName: raw.agentId === DEMO_AGENT_ID ? DEMO_AGENT_NAME : agent?.name || raw.agentId,
    title: raw.title,
    fingerprint: raw.fingerprint,
    severity: raw.severity,
    status: raw.status,
    environment: raw.environment,
    firstSeenAt: raw.firstSeenAt,
    lastSeenAt: raw.lastSeenAt,
    occurrenceCount: raw.occurrenceCount,
    affectedUserCount: raw.affectedUserCount,
    evaluationSummary: { failed: failedEvaluations, passed: 0, conflicting: false },
    feedbackCount,
    deploymentIds: raw.deploymentIds || [],
    suspectedDeploymentId: raw.suspectedDeploymentId || null,
    signalRefs: raw.signalRefs || [],
    owner: { teamId: owner || 'unassigned', userId: null },
    activeInvestigationId: raw.activeInvestigationId || null,
    whatHappened: summary,
    impact: `${raw.affectedUserCount} user${raw.affectedUserCount === 1 ? '' : 's'} affected across ${raw.occurrenceCount} correlated occurrence${raw.occurrenceCount === 1 ? '' : 's'}.`,
    whatChanged: raw.suspectedDeploymentId
      ? `${raw.suspectedDeploymentId} is correlated with the first failing production signal.`
      : 'No deployment has been confirmed as the cause yet.',
    recommendedAction: raw.bestHypothesis?.claim ||
      (raw.activeInvestigationId
        ? 'Review the active investigation and its proposed remediation.'
        : 'Start a repository investigation using the attached production evidence.'),
    series: [
      {
        hour: new Date(raw.lastSeenAt).getHours(),
        occurrences: raw.occurrenceCount,
        affectedUsers: raw.affectedUserCount,
      },
    ],
    version: raw.version || 1,
  }
}

export function mapAgent(
  raw: BackendAgent,
  overview: BackendOverview,
  incidents: Incident[],
): Agent {
  const openIncidents = incidents.filter(
    (item) => item.agentId === raw.agentId && !['resolved', 'dismissed'].includes(item.status),
  ).length
  const metrics = overview.metrics

  return {
    agentId: raw.agentId,
    name: raw.agentId === DEMO_AGENT_ID ? DEMO_AGENT_NAME : raw.name,
    owner: raw.owner || 'unassigned',
    framework: raw.framework || 'custom',
    environment: (overview.environment || 'production') as Agent['environment'],
    activeVersion: raw.activeVersion || 'unknown',
    health: openIncidents > 0 ? 'degraded' : 'healthy',
    runs: metrics.runs,
    passRate: metrics.evaluationPassRate,
    satisfaction:
      metrics.negativeFeedbackRate === null ? null : 1 - metrics.negativeFeedbackRate,
    p95LatencyMs: metrics.p95LatencyMs || 0,
    costPerRun: metrics.runs ? metrics.totalCost / metrics.runs : 0,
    openIncidents,
    lastSeenAt: raw.lastSeenAt || new Date().toISOString(),
  }
}

export function mapDeployment(raw: BackendDeployment): Deployment {
  const deployedAt = raw.deployed_at || raw.createdAt || new Date().toISOString()
  const date = new Date(deployedAt)
  return {
    deploymentId: raw.deploymentId || raw.deployment_id || 'unknown-deployment',
    environment: raw.environment,
    version: raw.version || 'unknown',
    commitSha: raw.git_commit_sha || 'unknown',
    deployedAt,
    status: raw.status,
    actor: 'deployment telemetry',
    atHour: date.getHours() + date.getMinutes() / 60,
  }
}

export function mapInvestigation(raw: BackendInvestigation): Investigation {
  return {
    investigationId: raw.investigationId,
    incidentId: raw.incidentId,
    autonomyMode: raw.mode,
    stage: raw.stage,
    status: raw.status,
    startedAt: raw.createdAt,
    budgets: {
      tokens: { used: 0, limit: 0 },
      cost: { used: 0, limit: 0 },
      wallClockMs: { used: 0, limit: 0 },
      toolCalls: { used: 0, limit: raw.budgets?.maxSteps || 0 },
    },
    permissions: Object.entries(raw.permissions || {}).map(([label, granted]) => ({
      label: label.replace(/([A-Z])/g, ' $1').toLowerCase(),
      granted,
    })),
  }
}

export function overviewKpis(overview: BackendOverview): OverviewKpi[] {
  const metrics = overview.metrics
  return [
    kpi('runs', 'Production runs', metrics.runs, 'count', metrics.runs, 'up'),
    kpi('success', 'Run success', rate(metrics.successRate), '%', metrics.runs, 'up'),
    kpi(
      'evaluation',
      'Evaluation pass rate',
      rate(metrics.evaluationPassRate),
      '%',
      metrics.evaluationSampleSize,
      'up',
      metrics.evaluationSampleSize ? undefined : 'No evaluations in this window',
    ),
    kpi(
      'feedback',
      'Negative feedback',
      rate(metrics.negativeFeedbackRate),
      '%',
      metrics.feedbackSampleSize,
      'down',
      metrics.feedbackSampleSize ? undefined : 'No feedback in this window',
    ),
    kpi('latency', 'P95 latency', metrics.p95LatencyMs, 'ms', metrics.runs, 'down'),
    kpi('incidents', 'Open incidents', metrics.openIncidents, 'count', metrics.openIncidents, 'down'),
  ]
}

function rate(value: number | null) {
  return value === null ? null : value * 100
}

function kpi(
  key: string,
  label: string,
  value: number | null,
  unit: OverviewKpi['unit'],
  sampleSize: number,
  goodDirection: OverviewKpi['goodDirection'],
  dataQuality?: string,
): OverviewKpi {
  return {
    key,
    label,
    value,
    unit,
    delta: null,
    sampleSize,
    goodDirection,
    dataQuality,
    series: value === null ? [] : [value],
  }
}
