import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bot,
  ChevronDown,
  CircleHelp,
  Gauge,
  LayoutGrid,
  MessageSquare,
  Microscope,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  TriangleAlert,
  Wifi,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useApiQuery } from '../../hooks/useApiQuery'
import type { HealthResponse, Page } from '../../lib/api'
import { DEMO_AGENT_ID, DEMO_AGENT_NAME } from '../../lib/demoScope'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Count badges appear only for actionable items (§14). */
  badge?: number
  badgeTone?: 'critical' | 'warning'
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Observe',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutGrid },
      { to: '/agents', label: 'Agents', icon: Bot },
      { to: '/runs', label: 'Runs & Traces', icon: Activity },
      { to: '/evaluations', label: 'Evaluations', icon: Gauge },
      { to: '/feedback', label: 'Feedback', icon: MessageSquare, badgeTone: 'warning' },
    ],
  },
  {
    label: 'Improve',
    items: [
      { to: '/incidents', label: 'Incidents', icon: TriangleAlert, badgeTone: 'critical' },
      { to: '/investigations', label: 'Investigations', icon: Microscope, badgeTone: 'warning' },
      { to: '/deployments', label: 'Deployments', icon: Rocket },
    ],
  },
  {
    label: 'Manage',
    items: [{ to: '/settings/autonomy', label: 'Settings', icon: Settings }],
  },
]

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const feedback = useApiQuery<Page<unknown>>(`/feedback?limit=1&agent_id=${DEMO_AGENT_ID}&workflow=article_fetch`, 10_000)
  const incidents = useApiQuery<Page<{ status?: string }>>(`/incidents?limit=200&agent_id=${DEMO_AGENT_ID}`, 10_000)
  const investigations = useApiQuery<Page<unknown>>(`/investigations?limit=1&agent_id=${DEMO_AGENT_ID}`, 10_000)
  const health = useApiQuery<HealthResponse>('/health', 5_000)
  const badges: Record<string, number | undefined> = {
    '/feedback': feedback.data?.count,
    '/incidents': incidents.data?.items.filter((item) => !['resolved', 'dismissed'].includes(item.status || '')).length,
    '/investigations': investigations.data?.count,
  }
  const connected = health.data?.status === 'ok' && health.data.database === 'connected'

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-(--color-line) bg-(--color-surface-1) transition-[width] duration-200"
      style={{ width: collapsed ? 72 : 240 }}
    >
      {/* Org / project selector */}
      <div className="border-b border-(--color-line) p-3">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-white/5"
          title={`${DEMO_AGENT_NAME} · MongoDB Atlas`}
        >
          <Mark />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-4 font-semibold">
                  {DEMO_AGENT_NAME}
                </span>
                <span className="block truncate text-[11px] text-(--color-ink-3)">
                  MongoDB Atlas
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-(--color-ink-3)" />
            </>
          )}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="mb-1 px-2 text-[10px] font-semibold tracking-[0.12em] text-(--color-ink-3) uppercase">
                {group.label}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const badge = badges[item.to]
                return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors ${
                        isActive
                          ? 'bg-(--color-accent-soft) font-medium text-(--color-ink-1)'
                          : 'text-(--color-ink-2) hover:bg-white/5 hover:text-(--color-ink-1)'
                      } ${collapsed ? 'justify-center' : ''}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active state uses an indicator, not colour alone */}
                        {isActive && (
                          <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-(--color-accent)" />
                        )}
                        <item.icon className="size-4 shrink-0" />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && badge !== undefined && badge > 0 && (
                          <span
                            className="tabular rounded px-1 py-px text-[10px] font-semibold"
                            style={{
                              color:
                                item.badgeTone === 'critical'
                                  ? 'var(--color-critical)'
                                  : 'var(--color-warning)',
                              background:
                                item.badgeTone === 'critical'
                                  ? 'var(--color-critical-soft)'
                                  : 'var(--color-warning-soft)',
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-(--color-line) p-2">
        <div
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}
          title={connected ? 'Backend and MongoDB connected' : 'Backend reconnecting'}
        >
          <Wifi className={`size-3.5 shrink-0 ${connected ? 'text-(--color-good)' : 'text-(--color-warning)'}`} />
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-(--color-ink-2)">
              {connected ? 'Backend + MongoDB healthy' : 'Backend reconnecting'}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-(--color-ink-3) transition-colors hover:bg-white/5 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <CircleHelp className="size-3.5 shrink-0" />
          {!collapsed && <span>Documentation</span>}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-(--color-ink-3) transition-colors hover:bg-white/5 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <>
              <PanelLeftClose className="size-3.5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--color-accent)" fillOpacity="0.16" />
      {/* A loop that closes — observe, fix, verify, remember. */}
      <path
        d="M9 19 C9 11.5, 23 11.5, 23 18 C23 22, 17.5 23.5, 15 20"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="15" cy="20" r="2.4" fill="var(--color-accent)" />
    </svg>
  )
}
