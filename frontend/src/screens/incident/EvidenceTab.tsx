import { useState } from 'react'
import {
  Activity,
  Bot,
  Database,
  EyeOff,
  Gauge,
  MessageSquare,
  Pin,
  Rocket,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FAILING_TRACE_SPANS, INCIDENT_SIGNALS } from '../../mock/dataset'
import { Panel, Button, SectionLabel, CopyableId } from '../../components/ui/Primitives'
import { Badge } from '../../components/ui/Badge'
import type { EvidenceRef, IncidentSignal, Span } from '../../types/domain'
import { formatTime } from '../../lib/format'

const TYPE_ICON: Record<EvidenceRef['type'], LucideIcon> = {
  trace: Activity,
  evaluation: Gauge,
  feedback: MessageSquare,
  deployment: Rocket,
  exception: TriangleAlert,
  metric: Gauge,
  code: Wrench,
  memory: Database,
}

type Stance = 'all' | IncidentSignal['stance']

export function EvidenceTab() {
  const [stance, setStance] = useState<Stance>('all')
  const [selected, setSelected] = useState<string>('span_retrieval')

  const rows = INCIDENT_SIGNALS.filter((s) => stance === 'all' || s.stance === stance)
  const span = FAILING_TRACE_SPANS.find((s) => s.spanId === selected) ?? FAILING_TRACE_SPANS[0]

  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        title="Signals"
        hint="Every item links to its source. Nothing here is the agent's opinion."
        action={
          <div className="flex gap-1">
            {(['all', 'supporting', 'contradicting', 'unreviewed'] as Stance[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStance(s)}
                className={`cursor-pointer rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
                  stance === s
                    ? 'border-(--color-accent)/45 bg-(--color-accent-soft) text-(--color-ink-1)'
                    : 'border-(--color-line) text-(--color-ink-3) hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        }
        bodyClassName="divide-y divide-(--color-line) overflow-y-auto"
      >
        {rows.map((s) => {
          const Icon = TYPE_ICON[s.type]
          return (
            <div key={s.signalId} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-(--color-ink-3)" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug font-medium">{s.label}</div>
                  <div className="mt-0.5 font-mono text-[11px] break-all text-(--color-ink-2)">
                    {s.detail}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StanceBadge stance={s.stance} />
                    {s.pinned && (
                      <Badge tone="accent" icon={Pin} size="sm" title="Pinned into agent context">
                        Pinned
                      </Badge>
                    )}
                    <span className="text-[10px] text-(--color-ink-3)">
                      {formatTime(s.createdAt)} · {s.addedReason}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </Panel>

      <div className="flex min-h-0 flex-col gap-3">
        <Panel
          title="Representative failing trace"
          hint="trace_9f21 · support-copilot v2.4.0"
          action={<CopyableId value="trace_9f21" />}
        >
          <div className="flex flex-col divide-y divide-(--color-line)">
            {FAILING_TRACE_SPANS.map((s) => (
              <SpanRow
                key={s.spanId}
                span={s}
                selected={s.spanId === selected}
                onSelect={() => setSelected(s.spanId)}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Span detail" hint={span.name}>
          <div className="p-3.5">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge tone="neutral" icon={TYPE_ICON.trace} size="sm">
                {span.type}
              </Badge>
              <Badge tone={span.status === 'ok' ? 'good' : 'critical'} icon={Activity} size="sm">
                {span.status}
              </Badge>
              <span className="tabular text-[11px] text-(--color-ink-3)">
                +{span.startOffsetMs}ms · {span.durationMs}ms
                {span.tokens ? ` · ${span.tokens.toLocaleString()} tok` : ''}
              </span>
            </div>

            <SectionLabel>Input</SectionLabel>
            <Content value={span.input} reason={span.redactionReason} />

            <div className="mt-3">
              <SectionLabel>Output</SectionLabel>
              <Content value={span.output} reason={undefined} />
            </div>

            <div className="mt-3">
              <SectionLabel>Attributes</SectionLabel>
              <div className="mt-1.5 overflow-x-auto rounded-md border border-(--color-line) bg-(--color-surface-2)">
                <table className="w-full font-mono text-[11px]">
                  <tbody>
                    {Object.entries(span.attributes).map(([k, v]) => {
                      const damning =
                        k === 'cache.hit' || k === 'cache.age_ms' || k === 'ledger.read_performed'
                      return (
                        <tr key={k} className="border-b border-(--color-line) last:border-0">
                          <td className="px-2.5 py-1.5 whitespace-nowrap text-(--color-ink-3)">
                            {k}
                          </td>
                          <td
                            className="px-2.5 py-1.5 text-right whitespace-nowrap"
                            style={{ color: damning ? 'var(--color-critical)' : undefined }}
                          >
                            {String(v)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" icon={Pin}>
                Pin to investigation
              </Button>
              <Button size="sm" icon={Gauge}>
                Run evaluation
              </Button>
              <Button size="sm" icon={Bot}>
                Compare trace
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SpanRow({
  span,
  selected,
  onSelect,
}: {
  span: Span
  selected: boolean
  onSelect: () => void
}) {
  const total = 2410
  const depth = span.parentSpanId ? 1 : 0
  const damning = span.spanId === 'span_retrieval' || span.spanId === 'span_tool_balance'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
        selected ? 'bg-(--color-accent-soft)' : 'hover:bg-white/4'
      }`}
    >
      <span style={{ paddingLeft: depth * 14 }} className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px]">
          {span.name}
          {damning && <span className="ml-1.5 text-(--color-critical)">●</span>}
        </span>
      </span>
      {/* Duration bar — one shared scale across the trace */}
      <span className="relative h-1.5 w-28 shrink-0 overflow-hidden rounded-[3px] bg-white/6">
        <span
          className="absolute h-full rounded-[3px]"
          style={{
            left: `${(span.startOffsetMs / total) * 100}%`,
            width: `${Math.max(1.5, (span.durationMs / total) * 100)}%`,
            background: damning ? 'var(--color-critical)' : 'var(--color-series-1)',
          }}
        />
      </span>
      <span className="tabular w-12 shrink-0 text-right font-mono text-[10px] text-(--color-ink-3)">
        {span.durationMs}ms
      </span>
    </button>
  )
}

/** §20 redacted state — say why it is unavailable and which policy applied. */
function Content({ value, reason }: { value: string | null; reason?: string }) {
  if (value === null) {
    return (
      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-(--color-line) bg-(--color-surface-2) px-2.5 py-2">
        <EyeOff className="mt-0.5 size-3 shrink-0 text-(--color-ink-3)" />
        <div>
          <div className="text-[11px] text-(--color-ink-2)">Content not captured</div>
          <div className="mt-0.5 text-[10px] text-(--color-ink-3)">{reason}</div>
        </div>
      </div>
    )
  }
  return (
    <pre className="mt-1.5 overflow-x-auto rounded-md border border-(--color-line) bg-(--color-surface-2) px-2.5 py-2 font-mono text-[11px] whitespace-pre-wrap text-(--color-ink-1)">
      {value}
    </pre>
  )
}

function StanceBadge({ stance }: { stance: IncidentSignal['stance'] }) {
  if (stance === 'supporting')
    return (
      <Badge tone="critical" icon={TriangleAlert} size="sm">
        Supporting
      </Badge>
    )
  if (stance === 'contradicting')
    return (
      <Badge tone="accent" icon={Activity} size="sm">
        Contradicting
      </Badge>
    )
  return (
    <Badge tone="neutral" icon={Activity} size="sm">
      Unreviewed
    </Badge>
  )
}
