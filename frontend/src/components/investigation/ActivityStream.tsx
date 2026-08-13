import { useEffect, useRef } from 'react'
import {
  Activity,
  Beaker,
  CircleCheck,
  CircleAlert,
  Database,
  Eye,
  Gauge,
  Lightbulb,
  MessageSquare,
  Rocket,
  Terminal,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentBlock, InvestigationState } from '../../types/events'
import type { EvidenceRef } from '../../types/domain'
import { STAGE_META } from '../../lib/investigationReducer'
import { ConfidenceBadge } from '../ui/Badge'
import { formatElapsed } from '../../lib/format'

const EVIDENCE_ICON: Record<EvidenceRef['type'], LucideIcon> = {
  trace: Activity,
  evaluation: Gauge,
  feedback: MessageSquare,
  deployment: Rocket,
  exception: TriangleAlert,
  metric: Gauge,
  code: Wrench,
  memory: Database,
}

/**
 * §15.10 centre pane. Four explicit block types so a reader always knows
 * whether they are looking at a cited fact, an uncertain claim, a bounded
 * operation, or its outcome. Unverified agent text is never styled as fact.
 */
export function ActivityStream({ state }: { state: InvestigationState }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Scroll this pane only. `scrollIntoView` would also scroll every ancestor,
  // dragging the stage rail and context drawer off screen.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.blocks.length])

  const humanMessages = state.log.filter((e) => e.type === 'human.message')

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
      {state.blocks.length === 0 && (
        <p className="py-6 text-center text-xs text-(--color-ink-3)">
          Waiting for the orchestrator…
        </p>
      )}

      {state.blocks.map((b) => (
        <BlockCard key={b.blockId} block={b} />
      ))}

      {/* Human questions appear inline in the same narrative. */}
      {humanMessages.map((m, i) =>
        m.type === 'human.message' && m.t <= (state.blocks.at(-1)?.t ?? 0) ? (
          <div
            key={`hm-${i}`}
            className="ml-8 rounded-lg border border-(--color-line-strong) bg-white/4 px-3 py-2"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-(--color-ink-3)">
              <MessageSquare className="size-3" />
              {m.author} asked
            </div>
            <p className="mt-1 text-[13px] text-(--color-ink-1)">{m.text}</p>
          </div>
        ) : null,
      )}

    </div>
  )
}

function BlockCard({ block }: { block: AgentBlock }) {
  const meta = KIND_META[block.kind]
  return (
    <article
      className="rounded-lg border bg-(--color-surface-2)"
      style={{ borderColor: meta.border }}
    >
      <header className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: meta.border }}>
        <meta.icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
        <span
          className="text-[10px] font-semibold tracking-[0.1em] uppercase"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-(--color-ink-3)">
          <span>{STAGE_META[block.stage].label}</span>
          <span className="tabular font-mono">{formatElapsed(block.t)}</span>
        </span>
      </header>

      <div className="px-3 py-2.5">
        {block.kind === 'observation' && (
          <>
            <p className="text-[13px] leading-relaxed">{block.text}</p>
            <EvidenceList refs={block.evidence} label="Cited" />
          </>
        )}

        {block.kind === 'hypothesis' && (
          <>
            <p className="text-[13px] leading-relaxed">{block.claim}</p>
            <div className="mt-2">
              <ConfidenceBadge confidence={block.confidence} size="sm" />
            </div>
            <EvidenceList refs={block.supporting} label="Supporting" />
            <EvidenceList refs={block.contradicting} label="Contradicting" tone="critical" />
          </>
        )}

        {block.kind === 'action' && (
          <>
            <p className="text-[13px] leading-relaxed">{block.text}</p>
            {block.command && (
              <pre className="mt-2 overflow-x-auto rounded border border-(--color-line) bg-(--color-plane) px-2.5 py-1.5 font-mono text-[11px] text-(--color-ink-2)">
                {block.command}
              </pre>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-(--color-ink-3)">
              <Terminal className="size-3" />
              <span className="font-mono">{block.tool}</span>
              <span>·</span>
              <span>permission: {block.scope}</span>
            </div>
          </>
        )}

        {block.kind === 'result' && (
          <>
            <div className="flex items-start gap-2">
              {block.status === 'success' ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-(--color-good)" />
              ) : block.status === 'failure' ? (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-(--color-critical)" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-(--color-warning)" />
              )}
              <p className="text-[13px] leading-relaxed">{block.text}</p>
            </div>
            {block.artifacts && block.artifacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {block.artifacts.map((a) => (
                  <span
                    key={a.label}
                    className="rounded border border-(--color-line-strong) bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-(--color-ink-2)"
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  )
}

function EvidenceList({
  refs,
  label,
  tone,
}: {
  refs: EvidenceRef[]
  label: string
  tone?: 'critical'
}) {
  if (!refs || refs.length === 0) return null
  const color = tone === 'critical' ? 'var(--color-critical)' : 'var(--color-ink-3)'
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase" style={{ color }}>
        {label}
      </div>
      <ul className="flex flex-col gap-1">
        {refs.map((r) => {
          const Icon = EVIDENCE_ICON[r.type] ?? Activity
          return (
            <li key={r.id} className="flex items-start gap-1.5">
              <Icon className="mt-0.5 size-3 shrink-0 text-(--color-ink-3)" />
              <span className="min-w-0">
                <span className="font-mono text-[11px] text-(--color-accent)">{r.label}</span>
                {r.detail && (
                  <span className="ml-1.5 text-[11px] text-(--color-ink-3)">{r.detail}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const KIND_META = {
  observation: {
    label: 'Observation',
    icon: Eye,
    color: 'var(--color-accent)',
    border: 'rgba(76,141,246,0.28)',
  },
  hypothesis: {
    label: 'Hypothesis',
    icon: Lightbulb,
    color: 'var(--color-ai)',
    border: 'rgba(144,133,233,0.3)',
  },
  action: {
    label: 'Action',
    icon: Beaker,
    color: 'var(--color-ink-2)',
    border: 'var(--color-line-strong)',
  },
  result: {
    label: 'Result',
    icon: CircleCheck,
    color: 'var(--color-good)',
    border: 'rgba(12,163,12,0.28)',
  },
} as const
