import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Microscope, Rocket, TriangleAlert } from 'lucide-react'
import {
  AGENTS,
  DEPLOYMENTS,
  EVALUATION_BREAKDOWN,
  FEEDBACK_CATEGORIES,
  HEALTH_SERIES,
  INCIDENTS,
  INVESTIGATION,
  KPIS,
  VERIFICATION,
} from '../mock/dataset'
import { MetricCard } from '../components/ui/MetricCard'
import { Panel, PartialDataNote, Meter } from '../components/ui/Primitives'
import { SeverityBadge, StatusBadge, AutonomyBadge, Badge } from '../components/ui/Badge'
import { Legend, TimeSeriesChart } from '../components/charts/TimeSeriesChart'
import { BarList } from '../components/charts/Bars'
import { formatRelative, formatValue, percent } from '../lib/format'
import { STAGE_META } from '../lib/investigationReducer'

const HEALTH_SERIES_DEFS = [
  { key: 'passRate', label: 'Evaluation pass rate', color: 'var(--color-series-1)' },
  { key: 'satisfaction', label: 'User satisfaction', color: 'var(--color-series-2)' },
]

export function Overview() {
  const needsAttention = INCIDENTS.filter(
    (i) => i.status !== 'resolved' && i.status !== 'dismissed',
  ).sort((a, b) => b.affectedUserCount - a.affectedUserCount)

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        {KPIS.map((k) => (
          <MetricCard key={k.key} kpi={k} />
        ))}
      </div>

      {/* Row 2 — health + needs attention */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="Agent health"
          hint="support-copilot · production · deployments marked on the axis"
          action={<Legend series={HEALTH_SERIES_DEFS} />}
          bodyClassName="px-3 pt-2 pb-3"
        >
          <TimeSeriesChart
            data={HEALTH_SERIES as unknown as Record<string, number>[]}
            series={HEALTH_SERIES_DEFS}
            height={196}
            unit="%"
            markers={DEPLOYMENTS.filter((d) => d.atHour >= 8).map((d) => ({
              at: d.atHour,
              label: d.version,
              tone: d.deploymentId === 'dep_456' ? 'var(--color-critical)' : 'var(--color-good)',
            }))}
          />
          <p className="mt-1 px-1 text-[11px] text-(--color-ink-3)">
            Axis starts at a non-zero floor to show the change. v2.4.0 at 14:00 precedes the
            drop; v2.4.1 at 19:30 precedes the recovery.
          </p>
        </Panel>

        <Panel
          title="Needs attention"
          hint="Sorted by users affected"
          bodyClassName="divide-y divide-(--color-line)"
        >
          {needsAttention.map((inc) => (
            <Link
              key={inc.incidentId}
              to={`/incidents/${inc.incidentId}`}
              className="block px-3.5 py-2.5 transition-colors hover:bg-white/4"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{inc.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={inc.severity} size="sm" />
                    <StatusBadge status={inc.status} size="sm" />
                    <span className="tabular text-[11px] text-(--color-ink-3)">
                      {inc.affectedUserCount} users · {inc.occurrenceCount} occurrences
                    </span>
                  </div>
                </div>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-(--color-ink-3)" />
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      {/* Row 3 — evaluation breakdown, feedback, recent changes */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel
          title="Evaluation pass rate by metric"
          hint="Failures are not averaged across evaluators"
          bodyClassName="p-3.5"
        >
          <BarList
            rows={EVALUATION_BREAKDOWN.map((e) => ({
              label: e.metric,
              value: (e.pass / e.sample) * 100,
            }))}
            formatValue={(v) => `${v.toFixed(1)}%`}
            secondary={(r) => {
              const row = EVALUATION_BREAKDOWN.find((e) => e.metric === r.label)!
              return `n=${row.sample.toLocaleString()}`
            }}
          />
        </Panel>

        <Panel
          title="User feedback by category"
          hint="Last 24 hours · 148 items"
          bodyClassName="p-3.5"
        >
          <BarList
            rows={FEEDBACK_CATEGORIES.map((f) => ({ label: f.category, value: f.count }))}
            color="var(--color-series-2)"
          />
          <div className="mt-3">
            <PartialDataNote>
              Sentiment inference is not configured, so implicit signals (regeneration,
              abandonment) are not counted here.
            </PartialDataNote>
          </div>
        </Panel>

        <Panel title="Recent production changes" bodyClassName="divide-y divide-(--color-line)">
          {[...DEPLOYMENTS].reverse().map((d) => (
            <div key={d.deploymentId} className="flex items-start gap-2.5 px-3.5 py-2.5">
              <Rocket className="mt-0.5 size-3.5 shrink-0 text-(--color-ink-3)" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{d.version}</span>
                  <code className="font-mono text-[11px] text-(--color-ink-3)">
                    {d.commitSha}
                  </code>
                </div>
                <div className="mt-0.5 text-[11px] text-(--color-ink-3)">
                  {formatRelative(d.deployedAt)} by {d.actor}
                  {d.prNumber ? ` · PR #${d.prNumber}` : ''}
                </div>
              </div>
              {d.deploymentId === 'dep_456' && (
                <Badge tone="critical" icon={TriangleAlert} size="sm">
                  1 incident
                </Badge>
              )}
              {d.deploymentId === 'dep_501' && (
                <Badge tone="good" icon={BadgeCheck} size="sm">
                  1 resolved
                </Badge>
              )}
            </div>
          ))}
        </Panel>
      </div>

      {/* Row 4 — active investigations + verified fixes */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Active investigations" bodyClassName="p-3.5">
          <Link
            to="/incidents/inc_123?tab=investigation"
            className="block rounded-md border border-(--color-line) p-3 transition-colors hover:bg-white/4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Microscope className="size-3.5 text-(--color-ai)" />
                  <span className="text-[13px] font-medium">inv_789</span>
                  <AutonomyBadge mode={INVESTIGATION.autonomyMode} size="sm" />
                </div>
                <div className="mt-1 truncate text-xs text-(--color-ink-2)">
                  {INCIDENTS[0].title}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-(--color-ink-3)">
                {STAGE_META.verify_prod.label}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <BudgetRow
                label="Tokens"
                used={INVESTIGATION.budgets.tokens.used}
                limit={INVESTIGATION.budgets.tokens.limit}
                format={(n) => `${(n / 1000).toFixed(0)}k`}
              />
              <BudgetRow
                label="Cost"
                used={INVESTIGATION.budgets.cost.used}
                limit={INVESTIGATION.budgets.cost.limit}
                format={(n) => `$${n.toFixed(2)}`}
              />
            </div>
          </Link>
          <div className="mt-2 rounded-md border border-(--color-line) p-3 opacity-70">
            <div className="flex items-center gap-2">
              <Microscope className="size-3.5 text-(--color-ai)" />
              <span className="text-[13px] font-medium">inv_774</span>
              <AutonomyBadge mode="investigator" size="sm" />
            </div>
            <div className="mt-1 truncate text-xs text-(--color-ink-2)">{INCIDENTS[1].title}</div>
            <div className="mt-2 text-[11px] text-(--color-ink-3)">Reproducing in sandbox</div>
          </div>
        </Panel>

        <Panel title="Recently verified fixes" hint="Production evidence, not development tests">
          <div className="p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="good" icon={BadgeCheck} size="sm">
                Resolved
              </Badge>
              <Link
                to="/incidents/inc_123?tab=verification"
                className="truncate text-[13px] font-medium hover:underline"
              >
                {INCIDENTS[0].title}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {VERIFICATION.metrics.slice(0, 4).map((m) => {
                const improved =
                  m.goodDirection === 'down' ? m.observed < m.baseline : m.observed > m.baseline
                return (
                  <div key={m.metric} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] text-(--color-ink-3)">{m.metric}</span>
                    <span className="tabular shrink-0 text-[11px]">
                      <span className="text-(--color-ink-3) line-through">
                        {formatValue(m.baseline, m.unit)}
                      </span>
                      <span className="mx-1 text-(--color-ink-3)">→</span>
                      <span
                        className="font-medium"
                        style={{
                          color: improved ? 'var(--color-good)' : 'var(--color-ink-1)',
                        }}
                      >
                        {formatValue(m.observed, m.unit)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 text-[11px] text-(--color-ink-3)">
              Confidence {percent(VERIFICATION.confidence)} ·{' '}
              {VERIFICATION.sampleSize.observed.toLocaleString()} runs observed vs{' '}
              {VERIFICATION.sampleSize.baseline.toLocaleString()} baseline
            </div>
          </div>
        </Panel>
      </div>

      {/* Agents table */}
      <Panel title="Agents" hint={`${AGENTS.length} observed in production`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-(--color-line) text-[10px] tracking-[0.1em] text-(--color-ink-3) uppercase">
              <Th className="pl-3.5">Agent</Th>
              <Th>Version</Th>
              <Th className="text-right">Runs</Th>
              <Th className="text-right">Pass rate</Th>
              <Th className="text-right">Satisfaction</Th>
              <Th className="text-right">P95</Th>
              <Th className="text-right">Cost/run</Th>
              <Th className="text-right">Incidents</Th>
              <Th className="pr-3.5 text-right">Last seen</Th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={a.agentId} className="border-b border-(--color-line) last:border-0">
                <Td className="pl-3.5">
                  <div className="flex items-center gap-2">
                    <HealthDot health={a.health} />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-[11px] text-(--color-ink-3)">{a.owner}</span>
                  </div>
                </Td>
                <Td className="font-mono text-[11px] text-(--color-ink-2)">{a.activeVersion}</Td>
                <Td className="tabular text-right">{a.runs.toLocaleString()}</Td>
                <Td className="tabular text-right">
                  {a.passRate === null ? (
                    <span className="text-(--color-warning)" title="No evaluator configured">
                      not configured
                    </span>
                  ) : (
                    percent(a.passRate, 1)
                  )}
                </Td>
                <Td className="tabular text-right">
                  {a.satisfaction === null ? (
                    <span className="text-(--color-ink-3)">—</span>
                  ) : (
                    percent(a.satisfaction, 1)
                  )}
                </Td>
                <Td className="tabular text-right">{formatValue(a.p95LatencyMs, 'ms')}</Td>
                <Td className="tabular text-right">{formatValue(a.costPerRun, '$')}</Td>
                <Td className="tabular text-right">
                  {a.openIncidents > 0 ? (
                    <span className="text-(--color-critical)">{a.openIncidents}</span>
                  ) : (
                    <span className="text-(--color-ink-3)">0</span>
                  )}
                </Td>
                <Td className="pr-3.5 text-right text-[11px] text-(--color-ink-3)">
                  {formatRelative(a.lastSeenAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function BudgetRow({
  label,
  used,
  limit,
  format,
}: {
  label: string
  used: number
  limit: number
  format: (n: number) => string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-(--color-ink-3)">{label}</span>
        <span className="tabular text-(--color-ink-2)">
          {format(used)} / {format(limit)}
        </span>
      </div>
      <Meter value={used} max={limit} tone="ai" />
    </div>
  )
}

function HealthDot({ health }: { health: string }) {
  const color =
    health === 'failing'
      ? 'var(--color-critical)'
      : health === 'degraded'
        ? 'var(--color-warning)'
        : health === 'healthy'
          ? 'var(--color-good)'
          : 'var(--color-ink-3)'
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ background: color }}
      title={`Health: ${health}`}
    />
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 text-left font-semibold ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2.5 ${className}`}>{children}</td>
}
