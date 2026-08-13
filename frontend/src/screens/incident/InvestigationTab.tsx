import { useState } from 'react'
import {
  Ban,
  ChevronsRight,
  Database,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import { useInvestigationEngine } from '../../hooks/useInvestigationEngine'
import { StageStepper } from '../../components/investigation/StageStepper'
import { ActivityStream } from '../../components/investigation/ActivityStream'
import { Button, Meter, SectionLabel } from '../../components/ui/Primitives'
import {
  AutonomyBadge,
  Badge,
  ConfidenceBadge,
  VerifiedBadge,
} from '../../components/ui/Badge'
import { INVESTIGATION, MEMORIES, PROJECT } from '../../mock/dataset'
import { formatElapsed } from '../../lib/format'
import type { Incident } from '../../types/domain'

export function InvestigationTab({ incident }: { incident: Incident }) {
  const engine = useInvestigationEngine(incident.activeInvestigationId ?? 'inv_789')
  const { state } = engine
  const [terminalOpen, setTerminalOpen] = useState(true)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Transport — replay is the same fold as live */}
      <div className="flex shrink-0 items-center gap-3 border-b border-(--color-line) bg-(--color-surface-1) px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={engine.toggle}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-(--color-line-strong) bg-white/5 transition-colors hover:bg-white/10"
            title={engine.playing ? 'Pause replay' : 'Play replay'}
          >
            {engine.playing ? (
              <Pause className="size-3 fill-current" />
            ) : (
              <Play className="size-3 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={engine.replay}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-(--color-line-strong) bg-white/5 text-(--color-ink-2) transition-colors hover:bg-white/10"
            title="Replay from the start"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>

        <Scrubber engine={engine} />

        <span className="tabular shrink-0 font-mono text-[11px] text-(--color-ink-2)">
          {formatElapsed(engine.cursor)} / {formatElapsed(engine.duration)}
        </span>

        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-(--color-line) bg-white/4 p-0.5">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => engine.setSpeed(s)}
              className={`cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                engine.speed === s
                  ? 'bg-white/12 text-(--color-ink-1)'
                  : 'text-(--color-ink-3) hover:text-(--color-ink-2)'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[228px_minmax(0,1fr)_300px]">
        {/* Left — plan */}
        <div className="min-h-0 overflow-y-auto border-r border-(--color-line) py-2">
          <div className="px-3.5 pb-2">
            <SectionLabel>Plan</SectionLabel>
          </div>
          <StageStepper state={state} />
        </div>

        {/* Centre — narrative + terminal */}
        <div className="flex min-h-0 flex-col border-r border-(--color-line)">
          <ActivityStream state={state} />

          <div className="shrink-0 border-t border-(--color-line)">
            <button
              type="button"
              onClick={() => setTerminalOpen((o) => !o)}
              className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[11px] text-(--color-ink-3) hover:bg-white/4"
            >
              <SquareTerminal className="size-3" />
              Sandbox output
              <ChevronsRight
                className={`ml-auto size-3 transition-transform ${terminalOpen ? 'rotate-90' : ''}`}
              />
            </button>
            {terminalOpen && (
              <div className="max-h-40 overflow-y-auto border-t border-(--color-line) bg-(--color-plane) px-3.5 py-2 font-mono text-[11px]">
                {state.terminal.length === 0 ? (
                  <span className="text-(--color-ink-3)">No commands executed yet.</span>
                ) : (
                  state.terminal.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        color:
                          l.status === 'failed'
                            ? 'var(--color-critical)'
                            : l.status === 'passed'
                              ? 'var(--color-good)'
                              : 'var(--color-ink-2)',
                      }}
                    >
                      {l.line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Scoped human question */}
          <div className="flex shrink-0 items-center gap-2 border-t border-(--color-line) px-3.5 py-2">
            <input
              placeholder="Ask a scoped question or add context…"
              className="min-w-0 flex-1 rounded-md border border-(--color-line-strong) bg-white/4 px-2.5 py-1.5 text-xs outline-none placeholder:text-(--color-ink-3) focus:border-(--color-accent)/50"
            />
            <Button size="sm" icon={Send} variant="secondary">
              Send
            </Button>
          </div>
        </div>

        {/* Right — context drawer */}
        <div className="min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-3 p-3">
            <div>
              <SectionLabel>Run</SectionLabel>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <AutonomyBadge mode={state.autonomyMode} size="sm" />
                <Badge tone="neutral" icon={Wrench} size="sm">
                  {state.currentWorkMode ?? 'idle'}
                </Badge>
              </div>
              <div className="mt-2 font-mono text-[11px] text-(--color-ink-3)">
                {state.investigationId ?? '—'} · {PROJECT.repository}
              </div>
            </div>

            <div>
              <SectionLabel>Budgets</SectionLabel>
              <div className="mt-2 flex flex-col gap-2.5">
                <BudgetRow
                  label="Tokens"
                  used={state.budgets.tokens.used}
                  limit={state.budgets.tokens.limit}
                  fmt={(n) => `${(n / 1000).toFixed(0)}k`}
                />
                <BudgetRow
                  label="Cost"
                  used={state.budgets.cost.used}
                  limit={state.budgets.cost.limit}
                  fmt={(n) => `$${n.toFixed(2)}`}
                />
                <BudgetRow
                  label="Tool calls"
                  used={state.budgets.toolCalls.used}
                  limit={state.budgets.toolCalls.limit}
                  fmt={(n) => String(n)}
                />
                <BudgetRow
                  label="Wall clock"
                  used={state.budgets.wallClockMs.used}
                  limit={state.budgets.wallClockMs.limit}
                  fmt={(n) => `${Math.round(n / 60000)}m`}
                />
              </div>
            </div>

            <div>
              <SectionLabel>Permissions</SectionLabel>
              <ul className="mt-2 flex flex-col gap-1.5">
                {INVESTIGATION.permissions.map((p) => (
                  <li key={p.label} className="flex items-start gap-1.5">
                    {p.granted ? (
                      <ShieldCheck className="mt-0.5 size-3 shrink-0 text-(--color-good)" />
                    ) : (
                      <Ban className="mt-0.5 size-3 shrink-0 text-(--color-ink-3)" />
                    )}
                    <span className="min-w-0">
                      <span
                        className="block text-[11px]"
                        style={{ color: p.granted ? 'var(--color-ink-1)' : 'var(--color-ink-3)' }}
                      >
                        {p.label}
                      </span>
                      {p.note && (
                        <span className="block text-[10px] text-(--color-ink-3)">{p.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionLabel>Retrieved memory</SectionLabel>
              <div className="mt-2 flex flex-col gap-1.5">
                {MEMORIES.filter((m) => ['mem_12', 'mem_44', 'mem_51'].includes(m.memoryId)).map(
                  (m) => (
                    <div
                      key={m.memoryId}
                      className="rounded-md border border-(--color-line) p-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <Database className="size-3 shrink-0 text-(--color-ink-3)" />
                        <span className="font-mono text-[10px] text-(--color-ink-3)">
                          {m.memoryId}
                        </span>
                        <span className="tabular ml-auto text-[10px] text-(--color-ink-3)">
                          {m.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug">{m.summary}</p>
                      <div className="mt-1.5">
                        <VerifiedBadge verified={m.verified} size="sm" />
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {state.hypotheses.length > 0 && (
              <div>
                <SectionLabel>Ranked hypotheses</SectionLabel>
                <div className="mt-2 flex flex-col gap-1.5">
                  {state.hypotheses.map((h) => (
                    <div key={h.hypothesisId} className="rounded-md border border-(--color-line) p-2">
                      <p className="text-[11px] leading-snug">{h.claim}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ConfidenceBadge confidence={h.confidence} size="sm" />
                        <Badge
                          tone={
                            h.status === 'confirmed'
                              ? 'good'
                              : h.status === 'rejected'
                                ? 'neutral'
                                : 'ai'
                          }
                          icon={h.status === 'rejected' ? Ban : ShieldCheck}
                          size="sm"
                        >
                          {h.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" icon={Pause}>
                Pause
              </Button>
              <Button size="sm" variant="danger" icon={Ban}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Scrubber({ engine }: { engine: ReturnType<typeof useInvestigationEngine> }) {
  const pct = engine.duration > 0 ? (engine.cursor / engine.duration) * 100 : 0
  return (
    <div
      className="relative h-6 min-w-0 flex-1 cursor-pointer"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        engine.seek(((e.clientX - rect.left) / rect.width) * engine.duration)
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-(--color-ai)" style={{ width: `${pct}%` }} />
      </div>
      {/* Gate markers so a reviewer can jump to the approval boundary */}
      {engine.events
        .filter((e) => e.type === 'permission.required' || e.type === 'approval.requested')
        .map((e, i) => (
          <span
            key={i}
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--color-warning)"
            style={{ left: `${(e.t / engine.duration) * 100}%` }}
            title="Permission gate"
          />
        ))}
      <span
        className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--color-surface-1) bg-(--color-ink-1)"
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}

function BudgetRow({
  label,
  used,
  limit,
  fmt,
}: {
  label: string
  used: number
  limit: number
  fmt: (n: number) => string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="text-(--color-ink-3)">{label}</span>
        <span className="tabular text-(--color-ink-2)">
          {fmt(used)} / {fmt(limit)}
        </span>
      </div>
      <Meter value={used} max={limit} tone="ai" />
    </div>
  )
}
