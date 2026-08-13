import { Ban, Check, CircleDashed, Loader2, TriangleAlert, UserCheck } from 'lucide-react'
import { INVESTIGATION_STAGES, type InvestigationState } from '../../types/events'
import { STAGE_META } from '../../lib/investigationReducer'

/**
 * §15.10 left rail: the plan, with completion and permission gates.
 * A blocked stage is visually distinct from a failed one — the agent stopping
 * at a permission boundary is correct behaviour, not an error.
 */
export function StageStepper({ state }: { state: InvestigationState }) {
  return (
    <ol className="flex flex-col">
      {INVESTIGATION_STAGES.map((stage, i) => {
        const status = state.stageStatus[stage]
        const meta = STAGE_META[stage]
        const gate = state.gates.find((g) => g.stage === stage)
        const last = i === INVESTIGATION_STAGES.length - 1

        return (
          <li key={stage} className="relative flex gap-2.5 pl-3.5">
            {/* connector */}
            {!last && (
              <span
                className="absolute top-6 bottom-0 left-[25px] w-px"
                style={{
                  background:
                    status === 'completed' ? 'var(--color-ai)' : 'var(--color-line-strong)',
                  opacity: status === 'completed' ? 0.5 : 1,
                }}
              />
            )}

            <span className="relative z-10 mt-2 shrink-0">
              <StageGlyph status={status} />
            </span>

            <span className="min-w-0 flex-1 py-1.5 pr-3">
              <span
                className={`block text-[12px] leading-4 font-medium ${
                  status === 'pending' ? 'text-(--color-ink-3)' : 'text-(--color-ink-1)'
                }`}
              >
                {meta.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-(--color-ink-3)">
                {status === 'blocked' && gate ? gate.label : meta.description}
              </span>
              {status === 'blocked' && gate && (
                <span className="mt-1 flex items-start gap-1 rounded border border-(--color-warning)/35 bg-(--color-warning-soft) px-1.5 py-1 text-[10px] text-(--color-warning)">
                  <UserCheck className="mt-px size-2.5 shrink-0" />
                  {gate.note}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StageGlyph({ status }: { status: string }) {
  const base = 'flex size-[22px] items-center justify-center rounded-full border'
  if (status === 'completed')
    return (
      <span
        className={base}
        style={{ borderColor: 'rgba(144,133,233,0.5)', background: 'var(--color-ai-soft)' }}
      >
        <Check className="size-3 text-(--color-ai)" strokeWidth={2.6} />
      </span>
    )
  if (status === 'active')
    return (
      <span
        className={base}
        style={{
          borderColor: 'var(--color-ai)',
          background: 'var(--color-ai-soft)',
          boxShadow: '0 0 0 3px rgba(144,133,233,0.13)',
        }}
      >
        <Loader2 className="size-3 animate-spin text-(--color-ai)" />
      </span>
    )
  if (status === 'blocked')
    return (
      <span
        className={base}
        style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
      >
        <UserCheck className="size-3 text-(--color-warning)" />
      </span>
    )
  if (status === 'failed')
    return (
      <span
        className={base}
        style={{ borderColor: 'var(--color-critical)', background: 'var(--color-critical-soft)' }}
      >
        <TriangleAlert className="size-3 text-(--color-critical)" />
      </span>
    )
  if (status === 'skipped')
    return (
      <span className={base} style={{ borderColor: 'var(--color-line-strong)' }}>
        <Ban className="size-3 text-(--color-ink-3)" />
      </span>
    )
  return (
    <span className={base} style={{ borderColor: 'var(--color-line-strong)' }}>
      <CircleDashed className="size-3 text-(--color-ink-3)" />
    </span>
  )
}
