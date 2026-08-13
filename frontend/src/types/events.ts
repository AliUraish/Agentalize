import type {
  AutonomyMode,
  EvidenceRef,
  Hypothesis,
  Investigation,
  WorkMode,
} from './domain'

/**
 * The investigation realtime channel (§11 "Realtime channel").
 *
 * Streamed over SSE from `GET /v1/investigations/:id/events`. Per §11 we stream
 * concise action / evidence / result / next-step — never hidden chain-of-thought.
 *
 * As with every timeline in this app, the UI derives all state by folding this
 * log, so a reconnect mid-investigation and a scrubbed replay are the same path.
 * `t` is ms since the investigation started.
 */

/** §6.7 orchestrator stages, in order. */
export const INVESTIGATION_STAGES = [
  'context',
  'memory',
  'inspect',
  'hypothesize',
  'reproduce',
  'test',
  'patch',
  'verify_dev',
  'report',
  'approval',
  'pull_request',
  'verify_prod',
  'memorize',
] as const

export type InvestigationStage = (typeof INVESTIGATION_STAGES)[number]

export type StageStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'blocked'
  | 'skipped'
  | 'failed'

/**
 * §15.10 — the four explicit block types. The UI never labels unverified agent
 * text as fact, so `hypothesis` always renders with its confidence and
 * `observation` always renders with its citations.
 */
export type BlockKind = 'observation' | 'hypothesis' | 'action' | 'result'

export interface ObservationBlock {
  kind: 'observation'
  text: string
  /** Required — an observation without a citation is not an observation. */
  evidence: EvidenceRef[]
}

export interface HypothesisBlock {
  kind: 'hypothesis'
  hypothesisId: string
  claim: string
  confidence: number
  supporting: EvidenceRef[]
  contradicting: EvidenceRef[]
}

export interface ActionBlock {
  kind: 'action'
  /** Human-readable summary, e.g. "Run the failing test in the sandbox". */
  text: string
  tool: string
  /** Sanitized command, when the action ran one. */
  command?: string
  /** The permission this action consumed, for the gate panel. */
  scope: string
}

export interface ResultBlock {
  kind: 'result'
  status: 'success' | 'failure' | 'partial'
  text: string
  artifacts?: { label: string; ref: string }[]
}

export type AgentBlock = (
  | ObservationBlock
  | HypothesisBlock
  | ActionBlock
  | ResultBlock
) & {
  blockId: string
  t: number
  stage: InvestigationStage
  workMode: WorkMode
}

/** Omit that distributes over a union instead of collapsing to its common keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What the wire carries: the block minus `t`, which defaults to the event's own. */
export type AgentBlockInput = DistributiveOmit<AgentBlock, 't'> & { t?: number }

export type InvestigationEvent =
  | {
      t: number
      type: 'investigation.started'
      investigationId: string
      incidentId: string
      autonomyMode: AutonomyMode
    }
  | { t: number; type: 'stage.entered'; stage: InvestigationStage; workMode: WorkMode }
  | {
      t: number
      type: 'stage.completed'
      stage: InvestigationStage
      status: Exclude<StageStatus, 'pending' | 'active'>
    }
  | { t: number; type: 'block'; block: AgentBlockInput }
  | { t: number; type: 'budget.updated'; budgets: Investigation['budgets'] }
  | {
      t: number
      type: 'permission.required'
      stage: InvestigationStage
      label: string
      note: string
    }
  | { t: number; type: 'hypothesis.ranked'; hypotheses: Hypothesis[] }
  | {
      t: number
      type: 'test.progress'
      testRunId: string
      line: string
      status: 'running' | 'passed' | 'failed'
    }
  | { t: number; type: 'approval.requested'; remediationId: string; approvers: string[] }
  | { t: number; type: 'human.message'; author: string; text: string }
  | {
      t: number
      type: 'investigation.completed'
      status: 'completed' | 'needs_input' | 'cancelled'
    }

/** Folded view of the log — what the investigation UI actually renders. */
export interface InvestigationState {
  investigationId: string | null
  incidentId: string | null
  autonomyMode: AutonomyMode
  status: Investigation['status']
  currentStage: InvestigationStage | null
  currentWorkMode: WorkMode | null
  stageStatus: Record<InvestigationStage, StageStatus>
  blocks: AgentBlock[]
  hypotheses: Hypothesis[]
  budgets: Investigation['budgets']
  gates: { stage: InvestigationStage; label: string; note: string }[]
  terminal: { line: string; status: 'running' | 'passed' | 'failed' }[]
  approvalRequested: { remediationId: string; approvers: string[] } | null
  log: InvestigationEvent[]
}
