import { Activity, ArrowRight, Database, Microscope, RefreshCw, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BarList } from '../components/charts/Bars'
import { MetricCard } from '../components/ui/MetricCard'
import { AutonomyBadge, SeverityBadge, StatusBadge } from '../components/ui/Badge'
import { Button, EmptyState, Panel } from '../components/ui/Primitives'
import { useDashboardData } from '../hooks/useDashboardData'
import { formatRelative, formatValue, percent } from '../lib/format'
import type { TimeRange } from '../components/shell/TopBar'
import type { Environment } from '../types/domain'

const RANGE_HOURS: Record<TimeRange, number> = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }

export function Overview({
  environment,
  range,
}: {
  environment: Environment
  range: TimeRange
}) {
  const { data, error, loading, refresh } = useDashboardData(environment, RANGE_HOURS[range])

  if (loading && !data) {
    return <PageState title="Loading production data" detail="Reading telemetry from MongoDB…" />
  }

  if (error && !data) {
    return (
      <PageState
        title="Backend unavailable"
        detail={error.message}
        action={<Button onClick={() => void refresh()} icon={RefreshCw}>Try again</Button>}
      />
    )
  }

  if (!data) return null

  const evaluationRows = groupEvaluations(data.evaluations)
  const feedbackRows = groupFeedback(data.feedback)
  const needsAttention = data.incidents
    .filter((item) => !['resolved', 'dismissed'].includes(item.status))
    .sort((a, b) => b.affectedUserCount - a.affectedUserCount)

  return (
    <div className="flex flex-col gap-3 p-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-(--color-warning)/35 bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning)">
          <RefreshCw className="size-3" />
          Live refresh failed; showing the most recent successful response.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        {data.kpis.map((kpi) => <MetricCard key={kpi.key} kpi={kpi} />)}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel
          title="Production snapshot"
          hint={`${environment} · last ${range} · MongoDB-backed`}
          bodyClassName="p-4"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Snapshot label="Successful runs" value={`${data.overview.metrics.successfulRuns}/${data.overview.metrics.runs}`} />
            <Snapshot label="Evaluations" value={String(data.overview.metrics.evaluationSampleSize)} />
            <Snapshot label="Feedback items" value={String(data.overview.metrics.feedbackSampleSize)} />
            <Snapshot label="Total cost" value={formatValue(data.overview.metrics.totalCost, '$')} />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-md border border-(--color-line) bg-(--color-surface-2) p-3">
            <Database className="mt-0.5 size-4 text-(--color-good)" />
            <div>
              <div className="text-xs font-medium">Live control-plane data</div>
              <p className="mt-1 text-[11px] leading-relaxed text-(--color-ink-3)">
                These counts come from the FastAPI backend and the connected MongoDB Atlas database. The dashboard refreshes every 10 seconds.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Needs attention" hint="Sorted by users affected" bodyClassName="divide-y divide-(--color-line)">
          {needsAttention.length === 0 ? (
            <EmptyState icon={Activity} title="No open incidents" detail="No live production incidents currently require attention." />
          ) : needsAttention.map((incident) => (
            <Link
              key={incident.incidentId}
              to={`/incidents/${incident.incidentId}`}
              className="block px-3.5 py-2.5 transition-colors hover:bg-white/4"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{incident.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={incident.severity} size="sm" />
                    <StatusBadge status={incident.status} size="sm" />
                    <span className="tabular text-[11px] text-(--color-ink-3)">
                      {incident.affectedUserCount} user{incident.affectedUserCount === 1 ? '' : 's'} · {incident.occurrenceCount} occurrence{incident.occurrenceCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-(--color-ink-3)" />
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Evaluation pass rate by metric" hint={`${data.evaluations.length} live evaluations`} bodyClassName="p-3.5">
          {evaluationRows.length ? (
            <BarList
              rows={evaluationRows.map((row) => ({ label: row.metric, value: row.rate, note: `n=${row.sample}` }))}
              formatValue={(value) => `${value.toFixed(1)}%`}
            />
          ) : <EmptyState icon={Activity} title="No evaluations" detail="SDK evaluations will appear here after ingestion." />}
        </Panel>

        <Panel title="User feedback by category" hint={`${data.feedback.length} live feedback items`} bodyClassName="p-3.5">
          {feedbackRows.length ? (
            <BarList rows={feedbackRows.map((row) => ({ label: row.category, value: row.count }))} color="var(--color-series-2)" />
          ) : <EmptyState icon={Activity} title="No feedback" detail="Explicit user feedback will appear here." />}
        </Panel>

        <Panel title="Recent production changes" bodyClassName="divide-y divide-(--color-line)">
          {data.deployments.length ? data.deployments.map((deployment) => (
            <div key={deployment.deploymentId} className="flex items-start gap-2.5 px-3.5 py-2.5">
              <Rocket className="mt-0.5 size-3.5 shrink-0 text-(--color-ink-3)" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{deployment.version}</span>
                  <code className="font-mono text-[11px] text-(--color-ink-3)">{deployment.commitSha}</code>
                </div>
                <div className="mt-0.5 text-[11px] text-(--color-ink-3)">
                  {formatRelative(deployment.deployedAt)} · {deployment.status}
                </div>
              </div>
            </div>
          )) : <EmptyState icon={Rocket} title="No deployments" detail="Deployment telemetry will appear here." />}
        </Panel>
      </div>

      <Panel title="Investigations" hint={`${data.investigations.length} stored in MongoDB`} bodyClassName="divide-y divide-(--color-line)">
        {data.investigations.length ? data.investigations.map((investigation) => (
          <Link
            key={investigation.investigationId}
            to={`/incidents/${investigation.incidentId}?tab=investigation`}
            className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/4"
          >
            <Microscope className="size-4 text-(--color-ai)" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs">{investigation.investigationId}</div>
              <div className="mt-0.5 text-[11px] text-(--color-ink-3)">{investigation.stage} · {investigation.status}</div>
            </div>
            <AutonomyBadge mode={investigation.autonomyMode} size="sm" />
            <ArrowRight className="size-3.5 text-(--color-ink-3)" />
          </Link>
        )) : <EmptyState icon={Microscope} title="No investigations" detail="Start one from an incident to inspect the repository." />}
      </Panel>

      <Panel title="Agents" hint={`${data.agents.length} observed in production`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-(--color-line) text-[10px] tracking-[0.1em] text-(--color-ink-3) uppercase">
              <Th className="pl-3.5">Agent</Th><Th>Version</Th><Th className="text-right">Runs</Th><Th className="text-right">Pass rate</Th><Th className="text-right">Satisfaction</Th><Th className="text-right">P95</Th><Th className="text-right">Incidents</Th><Th className="pr-3.5 text-right">Last seen</Th>
            </tr></thead>
            <tbody>{data.agents.map((agent) => (
              <tr key={agent.agentId} className="border-b border-(--color-line) last:border-0">
                <Td className="pl-3.5"><div className="font-medium">{agent.name}</div><div className="text-[10px] text-(--color-ink-3)">{agent.owner} · {agent.framework}</div></Td>
                <Td className="font-mono text-[11px] text-(--color-ink-2)">{agent.activeVersion}</Td>
                <Td className="tabular text-right">{agent.runs}</Td>
                <Td className="tabular text-right">{agent.passRate === null ? '—' : percent(agent.passRate, 1)}</Td>
                <Td className="tabular text-right">{agent.satisfaction === null ? '—' : percent(agent.satisfaction, 1)}</Td>
                <Td className="tabular text-right">{formatValue(agent.p95LatencyMs, 'ms')}</Td>
                <Td className="tabular text-right">{agent.openIncidents}</Td>
                <Td className="pr-3.5 text-right text-[11px] text-(--color-ink-3)">{formatRelative(agent.lastSeenAt)}</Td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function groupEvaluations(items: { metric: string; passed: boolean | null }[]) {
  const groups = new Map<string, { pass: number; sample: number }>()
  for (const item of items) {
    if (item.passed === null) continue
    const group = groups.get(item.metric) || { pass: 0, sample: 0 }
    group.sample += 1
    if (item.passed) group.pass += 1
    groups.set(item.metric, group)
  }
  return [...groups.entries()].map(([metric, group]) => ({ metric, sample: group.sample, rate: group.sample ? group.pass / group.sample * 100 : 0 }))
}

function groupFeedback(items: { category: string }[]) {
  const groups = new Map<string, number>()
  for (const item of items) groups.set(item.category, (groups.get(item.category) || 0) + 1)
  return [...groups.entries()].map(([category, count]) => ({ category, count }))
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-(--color-line) p-3"><div className="text-[10px] tracking-wide text-(--color-ink-3) uppercase">{label}</div><div className="tabular mt-1 text-lg font-semibold">{value}</div></div>
}

function PageState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="p-4"><Panel><EmptyState icon={Database} title={title} detail={detail} action={action} /></Panel></div>
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 text-left font-semibold ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2.5 ${className}`}>{children}</td>
}
