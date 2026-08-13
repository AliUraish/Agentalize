import {
  INVESTIGATION_STAGES,
  type AgentBlock,
  type InvestigationEvent,
  type InvestigationStage,
  type InvestigationState,
  type StageStatus,
} from '../types/events'

function emptyStageStatus(): Record<InvestigationStage, StageStatus> {
  const out = {} as Record<InvestigationStage, StageStatus>
  for (const s of INVESTIGATION_STAGES) out[s] = 'pending'
  return out
}

export function emptyInvestigation(): InvestigationState {
  return {
    investigationId: null,
    incidentId: null,
    autonomyMode: 'fixer',
    status: 'queued',
    currentStage: null,
    currentWorkMode: null,
    stageStatus: emptyStageStatus(),
    blocks: [],
    hypotheses: [],
    budgets: {
      tokens: { used: 0, limit: 400_000 },
      cost: { used: 0, limit: 12 },
      wallClockMs: { used: 0, limit: 900_000 },
      toolCalls: { used: 0, limit: 120 },
    },
    gates: [],
    terminal: [],
    approvalRequested: null,
    log: [],
  }
}

/** Pure and total — a malformed frame must never blank the screen. */
export function applyInvestigationEvent(
  state: InvestigationState,
  ev: InvestigationEvent,
): InvestigationState {
  const next: InvestigationState = {
    ...state,
    stageStatus: { ...state.stageStatus },
    log: [...state.log, ev],
  }

  switch (ev.type) {
    case 'investigation.started':
      next.investigationId = ev.investigationId
      next.incidentId = ev.incidentId
      next.autonomyMode = ev.autonomyMode
      next.status = 'running'
      break

    case 'stage.entered':
      next.currentStage = ev.stage
      next.currentWorkMode = ev.workMode
      next.stageStatus[ev.stage] = 'active'
      break

    case 'stage.completed':
      next.stageStatus[ev.stage] = ev.status
      break

    case 'block': {
      const block = { ...ev.block, t: ev.block.t ?? ev.t } as AgentBlock
      next.blocks = [...state.blocks, block]
      break
    }

    case 'budget.updated':
      next.budgets = ev.budgets
      break

    case 'permission.required':
      next.stageStatus[ev.stage] = 'blocked'
      next.status = 'needs_input'
      next.gates = [...state.gates, { stage: ev.stage, label: ev.label, note: ev.note }]
      break

    case 'hypothesis.ranked':
      next.hypotheses = ev.hypotheses
      break

    case 'test.progress':
      next.terminal = [...state.terminal, { line: ev.line, status: ev.status }]
      break

    case 'approval.requested':
      next.approvalRequested = {
        remediationId: ev.remediationId,
        approvers: ev.approvers,
      }
      break

    case 'human.message':
      break

    case 'investigation.completed':
      next.status = ev.status
      next.currentStage = null
      next.currentWorkMode = null
      break
  }

  return next
}

export function foldInvestigation(
  events: InvestigationEvent[],
  cursor: number,
): InvestigationState {
  let state = emptyInvestigation()
  for (const ev of events) {
    if (ev.t > cursor) break
    state = applyInvestigationEvent(state, ev)
  }
  return state
}

export const STAGE_META: Record<
  InvestigationStage,
  { label: string; description: string }
> = {
  context: { label: 'Scope context', description: 'Build the incident context bundle' },
  memory: { label: 'Retrieve memory', description: 'Vector search over verified outcomes' },
  inspect: { label: 'Inspect repository', description: 'Read-only code inspection' },
  hypothesize: { label: 'Rank hypotheses', description: 'Evidence-backed root causes' },
  reproduce: { label: 'Reproduce', description: 'Isolated sandbox reproduction' },
  test: { label: 'Add regression test', description: 'Failing test that pins the bug' },
  patch: { label: 'Propose patch', description: 'Smallest safe change' },
  verify_dev: { label: 'Verify (dev)', description: 'Targeted then broader checks' },
  report: { label: 'Remediation report', description: 'Diff, risk, and evidence' },
  approval: { label: 'Human approval', description: 'Gate before any external action' },
  pull_request: { label: 'Open pull request', description: 'Through the Git provider' },
  verify_prod: { label: 'Verify (production)', description: 'Baseline vs post-deploy' },
  memorize: { label: 'Write memory', description: 'Persist the verified outcome' },
}
