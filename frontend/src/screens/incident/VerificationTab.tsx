import { ArrowDown, ArrowUp, BadgeCheck, CircleCheck, Minus, Rocket } from 'lucide-react'
import { DEPLOYMENTS, HEALTH_SERIES, VERIFICATION } from '../../mock/dataset'
import { Panel, Button, SectionLabel } from '../../components/ui/Primitives'
import { Badge } from '../../components/ui/Badge'
import { Legend, TimeSeriesChart } from '../../components/charts/TimeSeriesChart'
import { formatValue, percent } from '../../lib/format'
import type { Verification } from '../../types/domain'

const VERDICT = {
  resolved: { tone: 'good' as const, label: 'Resolved', icon: CircleCheck },
  improving: { tone: 'good' as const, label: 'Improving', icon: ArrowUp },
  inconclusive: { tone: 'warning' as const, label: 'Inconclusive', icon: Minus },
  regressed: { tone: 'critical' as const, label: 'Regressed', icon: ArrowDown },
}

export function VerificationTab() {
  const v = VERIFICATION
  const verdict = VERDICT[v.verdict]
  const deployment = DEPLOYMENTS.find((d) => d.deploymentId === v.deploymentId)!

  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Verdict" hint="Production is the final evaluator, not the test suite">
          <div className="p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={verdict.tone} icon={verdict.icon}>
                {verdict.label}
              </Badge>
              <span className="text-[12px] text-(--color-ink-2)">
                Confidence {percent(v.confidence)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat
                label="Baseline window"
                value={`${v.sampleSize.baseline.toLocaleString()} runs`}
                sub="17:30–19:30 · v2.4.0"
              />
              <Stat
                label="Observed window"
                value={`${v.sampleSize.observed.toLocaleString()} runs`}
                sub={`19:30–21:30 · ${deployment.version}`}
              />
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-md border border-(--color-line) bg-(--color-surface-2) px-2.5 py-2">
              <Rocket className="size-3.5 shrink-0 text-(--color-ink-3)" />
              <span className="text-[11px] text-(--color-ink-2)">
                Fix shipped in {deployment.version} ({deployment.commitSha}) via PR #
                {deployment.prNumber}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button variant="primary" icon={BadgeCheck}>
                Close incident as resolved
              </Button>
              <Button variant="secondary">Extend window</Button>
            </div>
          </div>
        </Panel>

        <Panel
          title="Metric comparison"
          hint="Each metric has its own unit, so each is compared on its own scale"
        >
          <div className="flex flex-col divide-y divide-(--color-line)">
            {v.metrics.map((m) => (
              <MetricRow key={m.metric} metric={m} />
            ))}
          </div>
          <div className="border-t border-(--color-line) px-3.5 py-2">
            <SectionLabel>Guardrails</SectionLabel>
            <p className="mt-1 text-[11px] text-(--color-ink-3)">
              Latency rose 60ms and cost rose $0.001 per run — the expected consequence of
              trading cache hits for correctness. Both stay inside the project's guardrail
              thresholds, so the fix is not counted as a regression.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Before and after"
        hint="Same chart as the overview, scoped to this incident's agent"
        action={
          <Legend
            series={[
              { key: 'passRate', label: 'Pass rate', color: 'var(--color-series-1)' },
              { key: 'satisfaction', label: 'Satisfaction', color: 'var(--color-series-2)' },
            ]}
          />
        }
        bodyClassName="px-3 pt-2 pb-3"
      >
        <TimeSeriesChart
          data={HEALTH_SERIES as unknown as Record<string, number>[]}
          series={[
            { key: 'passRate', label: 'Pass rate', color: 'var(--color-series-1)' },
            { key: 'satisfaction', label: 'Satisfaction', color: 'var(--color-series-2)' },
          ]}
          height={220}
          unit="%"
          markers={[
            { at: 14, label: 'v2.4.0 (cause)', tone: 'var(--color-critical)' },
            { at: 19.5, label: 'v2.4.1 (fix)', tone: 'var(--color-good)' },
          ]}
        />
        <p className="mt-2 px-1 text-[11px] text-(--color-ink-3)">
          Both series recover to above their pre-incident level within one hour of the fix
          deploying. The axis starts at a non-zero floor to make the change legible.
        </p>
      </Panel>
    </div>
  )
}

function MetricRow({ metric: m }: { metric: Verification['metrics'][number] }) {
  const improved = m.goodDirection === 'down' ? m.observed < m.baseline : m.observed > m.baseline
  const unchanged = m.observed === m.baseline
  const color = unchanged
    ? 'var(--color-ink-3)'
    : improved
      ? 'var(--color-good)'
      : 'var(--color-warning)'

  // Per-row bullet: each metric is normalised to its own max, never a shared axis.
  const max = Math.max(m.baseline, m.observed) || 1

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px]">{m.metric}</span>
        <span className="tabular flex shrink-0 items-center gap-1.5 text-[12px]">
          <span className="text-(--color-ink-3)">{formatValue(m.baseline, m.unit)}</span>
          <span className="text-(--color-ink-3)">→</span>
          <span className="font-semibold" style={{ color }}>
            {formatValue(m.observed, m.unit)}
          </span>
          {!unchanged &&
            (improved ? (
              <ArrowDown
                className="size-3"
                style={{ color, transform: m.goodDirection === 'up' ? 'rotate(180deg)' : undefined }}
              />
            ) : (
              <ArrowUp className="size-3" style={{ color }} />
            ))}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] text-(--color-ink-3)">baseline</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/6">
          <span
            className="block h-full rounded-[3px] bg-(--color-ink-3)"
            style={{ width: `${(m.baseline / max) * 100}%` }}
          />
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] text-(--color-ink-3)">observed</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/6">
          <span
            className="block h-full rounded-[3px]"
            style={{ width: `${(m.observed / max) * 100}%`, background: color }}
          />
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-(--color-line) px-2.5 py-2">
      <div className="text-[10px] tracking-wide text-(--color-ink-3) uppercase">{label}</div>
      <div className="tabular mt-1 text-[15px] font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px] text-(--color-ink-3)">{sub}</div>
    </div>
  )
}
