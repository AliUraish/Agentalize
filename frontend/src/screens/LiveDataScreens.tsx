import type { ReactNode } from 'react'
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDashed,
  Database,
  Gauge,
  MessageSquare,
  Rocket,
  Settings,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, type Tone } from '../components/ui/Badge'
import { EmptyState, Panel } from '../components/ui/Primitives'
import { useApiQuery } from '../hooks/useApiQuery'
import type { HealthResponse, Page } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { DEMO_AGENT_ID, DEMO_AGENT_NAME, DEMO_REPOSITORY } from '../lib/demoScope'

type Document = Record<string, unknown>

interface Column {
  label: string
  render: (item: Document) => ReactNode
  align?: 'left' | 'right'
  width?: string
}

function text(item: Document, key: string, fallback = '—') {
  const value = item[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function number(item: Document, key: string) {
  const value = item[key]
  return typeof value === 'number' ? value : 0
}

function nested(item: Document, parent: string, child: string): unknown {
  const value = item[parent]
  return value && typeof value === 'object' ? (value as Document)[child] : undefined
}

function date(item: Document, ...keys: string[]) {
  const value = keys.map((key) => item[key]).find((candidate) => typeof candidate === 'string')
  return typeof value === 'string' ? formatDateTime(value) : '—'
}

function compactId(value: string) {
  return value.length > 30 ? `${value.slice(0, 18)}…${value.slice(-7)}` : value
}

function Status({ value }: { value: unknown }) {
  const status = typeof value === 'string' ? value : 'unknown'
  const good = ['ok', 'passed', 'completed', 'succeeded', 'healthy', 'positive'].includes(status)
  const bad = ['error', 'failed', 'cancelled', 'rolled_back', 'failing', 'negative'].includes(status)
  const tone: Tone = good ? 'good' : bad ? 'critical' : status === 'running' ? 'ai' : 'neutral'
  const Icon = good ? CheckCircle2 : bad ? XCircle : CircleDashed
  return <Badge tone={tone} icon={Icon} size="sm">{status.replaceAll('_', ' ')}</Badge>
}

function Id({ value }: { value: string }) {
  return <code title={value} className="font-mono text-[11px] text-(--color-ink-2)">{compactId(value)}</code>
}

function LiveCollectionPage({
  title,
  description,
  path,
  noun,
  icon,
  columns,
}: {
  title: string
  description: string
  path: string
  noun: string
  icon: LucideIcon
  columns: Column[]
}) {
  const query = useApiQuery<Page<Document>>(path, 5_000)
  const rows = query.data?.items ?? []
  const Icon = icon

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-(--color-accent)" />
          <h1 className="text-[15px] font-semibold">{title}</h1>
          {query.data && (
            <span className="rounded bg-white/7 px-1.5 py-0.5 font-mono text-[10px] text-(--color-ink-3)">
              {query.data.count}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-(--color-ink-3)">{description}</p>
      </div>

      <Panel>
        {query.loading && !query.data ? (
          <EmptyState icon={Database} title={`Loading ${noun}`} detail="Reading live records from MongoDB…" />
        ) : query.error && !query.data ? (
          <EmptyState icon={TriangleAlert} title={`Could not load ${noun}`} detail={query.error.message} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={icon}
            title={`No ${noun} yet`}
            detail="Run the article agent or seed the demo, then this page will update automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-(--color-line) text-[10px] tracking-[0.1em] text-(--color-ink-3) uppercase">
                  {columns.map((column) => (
                    <th
                      key={column.label}
                      className={`px-3 py-2 font-semibold ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row._id ?? row.runId ?? row.evaluationId ?? row.feedbackId ?? row.investigationId ?? row.deploymentId ?? row.agentId ?? index)} className="border-b border-(--color-line) last:border-0 hover:bg-white/4">
                    {columns.map((column) => (
                      <td key={column.label} className={`px-3 py-3 align-top ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[11px] text-(--color-ink-3)">Live MongoDB data · refreshes every 5 seconds</p>
    </div>
  )
}

export function AgentsScreen() {
  return <LiveCollectionPage title="Agent" description="The single Python SDK test agent connected to this demo." path={`/agents?limit=200&agent_id=${DEMO_AGENT_ID}`} noun="agent" icon={Bot} columns={[
    { label: 'Agent', render: (r) => <><div className="font-medium">{DEMO_AGENT_NAME}</div><Id value={text(r, 'agentId')} /></> },
    { label: 'Mode', render: (r) => <Status value={r.mode} /> },
    { label: 'Framework', render: (r) => text(r, 'framework') },
    { label: 'Owner', render: (r) => text(r, 'owner') },
    { label: 'Tags', render: (r) => Array.isArray(r.tags) ? r.tags.join(', ') || '—' : '—' },
    { label: 'Last seen', align: 'right', render: (r) => date(r, 'lastSeenAt', 'updatedAt', 'createdAt') },
  ]} />
}

export function RunsScreen() {
  return <LiveCollectionPage title="Runs & Traces" description="Python SDK Test Agent executions captured by the SDK." path={`/runs?limit=200&agent_id=${DEMO_AGENT_ID}`} noun="runs" icon={Activity} columns={[
    { label: 'Run', render: (r) => <><Id value={text(r, 'runId')} /><div className="mt-1 text-[10px] text-(--color-ink-3)">trace {compactId(text(r, 'traceId'))}</div></> },
    { label: 'Agent', render: (r) => <><div>{DEMO_AGENT_NAME}</div><span className="text-[11px] text-(--color-ink-3)">{text(r, 'environment')}</span></> },
    { label: 'Status', render: (r) => <Status value={r.status} /> },
    { label: 'Evaluation', render: (r) => <><Status value={nested(r, 'evaluationRollup', 'status')} /><div className="mt-1 text-[10px] text-(--color-ink-3)">{String(nested(r, 'evaluationRollup', 'passed') ?? 0)} passed · {String(nested(r, 'evaluationRollup', 'failed') ?? 0)} failed</div></> },
    { label: 'Latency', align: 'right', render: (r) => `${number(r, 'durationMs').toLocaleString()} ms` },
    { label: 'Tokens', align: 'right', render: (r) => number(r, 'totalTokens').toLocaleString() },
    { label: 'Started', align: 'right', render: (r) => date(r, 'startedAt') },
  ]} />
}

export function EvaluationsScreen() {
  return <LiveCollectionPage title="Fetch Evaluations" description="Fetching success, timeout, extraction, and readable-content checks for the Python SDK Test Agent." path={`/evaluations?limit=200&agent_id=${DEMO_AGENT_ID}&workflow=article_fetch`} noun="fetch evaluations" icon={Gauge} columns={[
    { label: 'Result', render: (r) => <Status value={r.passed === true ? 'passed' : r.passed === false ? 'failed' : 'unknown'} /> },
    { label: 'Metric', render: (r) => <><div className="font-medium">{text(r, 'metric').replaceAll('_', ' ')}</div><span className="text-[10px] text-(--color-ink-3)">{text(r, 'evaluator_name')}</span></> },
    { label: 'Target', render: (r) => <><span className="text-[10px] text-(--color-ink-3)">{String(nested(r, 'target', 'type') ?? 'run')}</span><br/><Id value={String(nested(r, 'target', 'id') ?? '—')} /></> },
    { label: 'Score', align: 'right', render: (r) => typeof r.score === 'number' ? `${Math.round(r.score * 100)}%` : '—' },
    { label: 'Reason', width: '34%', render: (r) => <span className="text-xs leading-relaxed text-(--color-ink-2)">{text(r, 'reason')}</span> },
    { label: 'Created', align: 'right', render: (r) => date(r, 'createdAt') },
  ]} />
}

export function FeedbackScreen() {
  return <LiveCollectionPage title="Fetch Feedback" description="User reports linked to failed article-fetch runs." path={`/feedback?limit=200&agent_id=${DEMO_AGENT_ID}&workflow=article_fetch`} noun="fetch feedback items" icon={MessageSquare} columns={[
    { label: 'Sentiment', render: (r) => <><Status value={r.sentiment ?? 'neutral'} /><div className="mt-1 text-[10px] text-(--color-ink-3)">rating {String(r.rating ?? '—')} / 5</div></> },
    { label: 'Category', render: (r) => text(r, 'category').replaceAll('_', ' ') },
    { label: 'Comment', width: '40%', render: (r) => <span className="text-xs leading-relaxed">{text(r, 'comment', 'No written comment')}</span> },
    { label: 'Run', render: (r) => <Id value={String(nested(r, 'target', 'id') ?? '—')} /> },
    { label: 'Incident', render: (r) => r.linkedIncidentId ? <Id value={String(r.linkedIncidentId)} /> : <span className="text-(--color-ink-3)">none</span> },
    { label: 'Created', align: 'right', render: (r) => date(r, 'createdAt') },
  ]} />
}

export function DeploymentsScreen() {
  return <LiveCollectionPage title="Deployments" description="Python_gpt_gemini versions correlated with article-fetch behavior." path={`/deployments?limit=200&repository=${DEMO_REPOSITORY}`} noun="deployments" icon={Rocket} columns={[
    { label: 'Deployment', render: (r) => <Id value={text(r, 'deploymentId')} /> },
    { label: 'Environment', render: (r) => text(r, 'environment') },
    { label: 'Version', render: (r) => text(r, 'version') },
    { label: 'Commit', render: (r) => <Id value={text(r, 'gitCommitSha', text(r, 'git_commit_sha'))} /> },
    { label: 'Status', render: (r) => <Status value={r.status} /> },
    { label: 'Repository', render: (r) => text(r, 'repository') },
    { label: 'Deployed', align: 'right', render: (r) => date(r, 'deployedAt', 'deployed_at', 'createdAt') },
  ]} />
}

export function SettingsScreen() {
  const health = useApiQuery<HealthResponse>('/health', 5_000)
  const agents = useApiQuery<Page<Document>>(`/agents?limit=200&agent_id=${DEMO_AGENT_ID}`, 5_000)
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-2">
      <Panel title="Connection" hint="Current local control-plane status" bodyClassName="p-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Setting label="API"><Status value={health.data?.status ?? (health.loading ? 'connecting' : 'unavailable')} /></Setting>
          <Setting label="MongoDB"><Status value={health.data?.database ?? 'unavailable'} /></Setting>
          <Setting label="Storage">{health.data?.storage ?? '—'}</Setting>
          <Setting label="Worker mode">{health.data?.workerMode ?? '—'}</Setting>
          <Setting label="Service">{health.data?.service ?? '—'}</Setting>
          <Setting label="Version">{health.data?.version ?? '—'}</Setting>
        </div>
      </Panel>
      <Panel title="Autonomy" hint="Permissions currently assigned to each registered agent" bodyClassName="divide-y divide-(--color-line)">
        {(agents.data?.items ?? []).length === 0 ? (
          <EmptyState icon={Settings} title="No agents configured" detail="Agents appear here after SDK telemetry or configuration is received." />
        ) : (agents.data?.items ?? []).map((agent) => (
          <div key={text(agent, 'agentId')} className="flex items-center justify-between gap-3 px-4 py-3">
            <div><div className="text-[13px] font-medium">{DEMO_AGENT_NAME}</div><Id value={text(agent, 'agentId')} /></div>
            <Status value={agent.mode ?? 'monitor'} />
          </div>
        ))}
      </Panel>
      <Panel title="Demo integration" hint="The values used by the three local services" bodyClassName="p-4 lg:col-span-2">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <Setting label="Dashboard API">http://127.0.0.1:8000/api/v1</Setting>
          <Setting label="Article agent API">http://127.0.0.1:8001</Setting>
          <Setting label="Tenant">org_demo / project_demo</Setting>
        </div>
        <p className="mt-4 flex items-start gap-2 text-[11px] text-(--color-ink-3)"><Database className="mt-0.5 size-3 shrink-0" />Secrets remain server-side in .env files and are never returned to this frontend.</p>
      </Panel>
    </div>
  )
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-md border border-(--color-line) bg-white/3 p-3"><div className="mb-1 text-[10px] font-semibold tracking-[0.1em] text-(--color-ink-3) uppercase">{label}</div><div className="break-all text-(--color-ink-1)">{children}</div></div>
}
