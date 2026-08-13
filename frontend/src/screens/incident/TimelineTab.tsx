import {
  Bot,
  CircleCheck,
  Gauge,
  GitPullRequest,
  MessageSquare,
  Rocket,
  Settings,
  User,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { INCIDENT_TIMELINE } from '../../mock/dataset'
import { Panel } from '../../components/ui/Primitives'
import { formatDateTime } from '../../lib/format'
import type { TimelineEntry } from '../../types/domain'

const KIND_ICON: Record<TimelineEntry['kind'], LucideIcon> = {
  signal: Gauge,
  agent_step: Bot,
  comment: MessageSquare,
  approval: UserCheck,
  pr: GitPullRequest,
  deployment: Rocket,
  verification: CircleCheck,
  status: Settings,
}

const ACTOR_COLOR: Record<TimelineEntry['actorType'], string> = {
  agent: 'var(--color-ai)',
  human: 'var(--color-accent)',
  system: 'var(--color-ink-3)',
}

export function TimelineTab() {
  return (
    <div className="p-4">
      <Panel
        title="Immutable history"
        hint="Every transition records actor, timestamp, reason and evidence. Entries are append-only."
      >
        <ol className="p-4">
          {INCIDENT_TIMELINE.map((e, i) => {
            const Icon = KIND_ICON[e.kind]
            const color = ACTOR_COLOR[e.actorType]
            const last = i === INCIDENT_TIMELINE.length - 1
            return (
              <li key={e.entryId} className="relative flex gap-3 pb-4 last:pb-0">
                {!last && (
                  <span className="absolute top-7 bottom-0 left-[13px] w-px bg-(--color-line-strong)" />
                )}
                <span
                  className="relative z-10 mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border bg-(--color-surface-1)"
                  style={{ borderColor: `${color}66` }}
                >
                  <Icon className="size-3.5" style={{ color }} />
                </span>

                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-medium">{e.action}</span>
                    <span
                      className="flex items-center gap-1 text-[11px]"
                      style={{ color }}
                      title={`${e.actorType} actor`}
                    >
                      {e.actorType === 'agent' ? (
                        <Bot className="size-2.5" />
                      ) : e.actorType === 'human' ? (
                        <User className="size-2.5" />
                      ) : (
                        <Settings className="size-2.5" />
                      )}
                      {e.actor}
                    </span>
                    <span
                      className="tabular ml-auto shrink-0 text-[11px] text-(--color-ink-3)"
                      title={e.at}
                    >
                      {formatDateTime(e.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-(--color-ink-2)">{e.detail}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}
