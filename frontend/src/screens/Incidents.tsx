import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Microscope, TriangleAlert } from 'lucide-react'
import { Panel, EmptyState } from '../components/ui/Primitives'
import { SeverityBadge, StatusBadge } from '../components/ui/Badge'
import { formatRelative } from '../lib/format'
import type { IncidentStatus } from '../types/domain'
import { useApiQuery } from '../hooks/useApiQuery'
import type { Page } from '../lib/api'
import { mapIncident, type BackendAgent, type BackendIncident } from '../lib/liveData'

type View = 'attention' | 'investigating' | 'approval' | 'verifying' | 'resolved' | 'regressed'

const VIEWS: { id: View; label: string; match: (s: IncidentStatus) => boolean }[] = [
  {
    id: 'attention',
    label: 'Needs attention',
    match: (s) => !['resolved', 'dismissed'].includes(s),
  },
  { id: 'investigating', label: 'Investigating', match: (s) => s === 'investigating' },
  { id: 'approval', label: 'Waiting for approval', match: (s) => s === 'awaiting_approval' },
  { id: 'verifying', label: 'Verifying', match: (s) => s === 'verifying' },
  { id: 'resolved', label: 'Resolved recently', match: (s) => s === 'resolved' },
  { id: 'regressed', label: 'Regressed', match: (s) => s === 'regressed' },
]

export function Incidents() {
  const [view, setView] = useState<View>('attention')
  const incidentsQuery = useApiQuery<Page<BackendIncident>>('/incidents?limit=200', 10_000)
  const agentsQuery = useApiQuery<Page<BackendAgent>>('/agents?limit=200', 10_000)
  const incidents = useMemo(
    () => (incidentsQuery.data?.items || []).map((item) => mapIncident(item, agentsQuery.data?.items)),
    [incidentsQuery.data, agentsQuery.data],
  )
  const active = VIEWS.find((v) => v.id === view)!
  const rows = incidents.filter((i) => active.match(i.status))

  if (incidentsQuery.loading && !incidentsQuery.data) {
    return <div className="p-4"><Panel><EmptyState icon={Microscope} title="Loading incidents" detail="Reading correlated production incidents from MongoDB…" /></Panel></div>
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => {
          const count = incidents.filter((i) => v.match(i.status)).length
          const on = v.id === view
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                on
                  ? 'border-(--color-accent)/45 bg-(--color-accent-soft) text-(--color-ink-1)'
                  : 'border-(--color-line) text-(--color-ink-2) hover:bg-white/5'
              }`}
            >
              {v.label}
              <span className="tabular rounded bg-white/8 px-1 font-mono text-[10px]">
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <Panel>
        {incidentsQuery.error && !incidentsQuery.data ? (
          <EmptyState
            icon={TriangleAlert}
            title="Could not load incidents"
            detail={incidentsQuery.error.message}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TriangleAlert}
            title="No incidents in this view"
            detail="Nothing currently matches this filter. Try another view or widen the time range."
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-(--color-line) text-[10px] tracking-[0.1em] text-(--color-ink-3) uppercase">
                <Th className="pl-3.5">Severity / status</Th>
                <Th>Incident</Th>
                <Th>Agent</Th>
                <Th className="text-right">Occurrences</Th>
                <Th className="text-right">Users</Th>
                <Th className="text-right">Signals</Th>
                <Th>Suspected deploy</Th>
                <Th>Agent stage</Th>
                <Th className="pr-3.5 text-right">Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.incidentId}
                  className="border-b border-(--color-line) transition-colors last:border-0 hover:bg-white/4"
                >
                  <Td className="pl-3.5">
                    <div className="flex flex-col items-start gap-1">
                      <SeverityBadge severity={i.severity} size="sm" />
                      <StatusBadge status={i.status} size="sm" />
                    </div>
                  </Td>
                  <Td>
                    <Link
                      to={`/incidents/${i.incidentId}`}
                      className="font-medium hover:underline"
                    >
                      {i.title}
                    </Link>
                    <div className="mt-0.5 font-mono text-[10px] text-(--color-ink-3)">
                      {i.incidentId} · {i.fingerprint}
                    </div>
                  </Td>
                  <Td>
                    <div>{i.agentName}</div>
                    <div className="text-[11px] text-(--color-ink-3)">{i.environment}</div>
                  </Td>
                  <Td className="tabular text-right">{i.occurrenceCount}</Td>
                  <Td className="tabular text-right">{i.affectedUserCount}</Td>
                  <Td className="tabular text-right text-[11px]">
                    <span className="text-(--color-critical)">
                      {i.evaluationSummary.failed} eval
                    </span>
                    <span className="text-(--color-ink-3)"> · </span>
                    <span className="text-(--color-serious)">{i.feedbackCount} fb</span>
                    {i.evaluationSummary.conflicting && (
                      <div className="text-[10px] text-(--color-warning)">conflicting</div>
                    )}
                  </Td>
                  <Td className="font-mono text-[11px] text-(--color-ink-2)">
                    {i.suspectedDeploymentId ?? '—'}
                  </Td>
                  <Td>
                    {i.activeInvestigationId ? (
                      <div className="flex items-center gap-1.5">
                        <Microscope className="size-3 text-(--color-ai)" />
                        <span className="text-[11px] text-(--color-ink-2)">
                          {i.activeInvestigationId}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-(--color-ink-3)">none</span>
                    )}
                  </Td>
                  <Td className="pr-3.5 text-right text-[11px] text-(--color-ink-3)">
                    {formatRelative(i.lastSeenAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <p className="text-[11px] text-(--color-ink-3)">
        Bulk actions are limited to assign, tag, mute, and change severity. Code-changing
        investigations are never started in bulk.
      </p>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 text-left font-semibold ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-3 align-top ${className}`}>{children}</td>
}
