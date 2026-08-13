import { Bot, CircleCheck, Clock, GitBranch, Radio, Wrench } from 'lucide-react'
import { EmptyState, Panel } from '../../components/ui/Primitives'
import { useApiQuery } from '../../hooks/useApiQuery'
import type { Page } from '../../lib/api'
import { formatDateTime } from '../../lib/format'

interface TimelineItem {
  timelineType: string
  createdAt: string
  updatedAt?: string
  summary?: string
  claim?: string
  status?: string
  stage?: string
  action?: string
  incidentId?: string
  investigationId?: string
  remediationId?: string
  signalId?: string
  [key: string]: unknown
}

export function TimelineTab({ incidentId }: { incidentId: string }) {
  const query = useApiQuery<Page<TimelineItem>>(
    `/incidents/${encodeURIComponent(incidentId)}/timeline`,
    10_000,
  )

  if (query.loading && !query.data) {
    return <div className="p-4"><Panel><EmptyState icon={Clock} title="Loading timeline" detail="Reading investigation events from MongoDB…" /></Panel></div>
  }

  if (query.error && !query.data) {
    return <div className="p-4"><Panel><EmptyState icon={Clock} title="Timeline unavailable" detail={query.error.message} /></Panel></div>
  }

  const items = query.data?.items || []
  return (
    <div className="p-4">
      <Panel title="Incident timeline" hint={`${items.length} live backend records`} bodyClassName="p-4">
        {items.length === 0 ? (
          <EmptyState icon={Clock} title="No timeline events" detail="Investigation steps and remediation records will appear here." />
        ) : (
          <ol className="relative ml-2 border-l border-(--color-line-strong)">
            {items.map((item, index) => {
              const Icon = iconFor(item.timelineType)
              return (
                <li key={`${item.timelineType}-${item.createdAt}-${index}`} className="relative pb-5 pl-6 last:pb-0">
                  <span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border border-(--color-line-strong) bg-(--color-surface-2)">
                    <Icon className="size-3 text-(--color-ai)" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-medium">{labelFor(item)}</span>
                    {item.status && <span className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-(--color-ink-3)">{item.status}</span>}
                    <time className="tabular ml-auto text-[10px] text-(--color-ink-3)">{formatDateTime(item.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-(--color-ink-2)">{detailFor(item)}</p>
                </li>
              )
            })}
          </ol>
        )}
      </Panel>
    </div>
  )
}

function iconFor(type: string) {
  if (type === 'investigations' || type === 'agentSteps') return Bot
  if (type === 'remediations') return Wrench
  if (type === 'verifications') return CircleCheck
  if (type === 'approvals') return GitBranch
  return Radio
}

function labelFor(item: TimelineItem) {
  return item.summary || item.action || item.claim || item.stage || item.timelineType.replace(/([A-Z])/g, ' $1')
}

function detailFor(item: TimelineItem) {
  if (item.investigationId) return `Investigation ${item.investigationId}`
  if (item.remediationId) return `Remediation ${item.remediationId}`
  if (item.signalId) return `Signal ${item.signalId}`
  return `Stored ${item.timelineType} record`
}
