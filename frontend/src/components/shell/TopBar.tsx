import { CalendarRange, ChevronsUpDown, Command, Search, Server } from 'lucide-react'
import type { Environment } from '../../types/domain'

const ENVIRONMENTS: Environment[] = ['production', 'staging', 'development']
const RANGES = ['1h', '24h', '7d', '30d'] as const
export type TimeRange = (typeof RANGES)[number]

export function TopBar({
  breadcrumb,
  action,
  environment,
  onEnvironment,
  range,
  onRange,
  live,
}: {
  breadcrumb: { label: string; to?: string }[]
  action?: React.ReactNode
  environment: Environment
  onEnvironment: (e: Environment) => void
  range: TimeRange
  onRange: (r: TimeRange) => void
  live: boolean
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-(--color-line) bg-(--color-surface-1) px-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {breadcrumb.map((c, i) => (
          <span key={c.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-(--color-ink-3)">/</span>}
            <span
              className={
                i === breadcrumb.length - 1
                  ? 'truncate font-semibold'
                  : 'truncate text-(--color-ink-2)'
              }
            >
              {c.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Global search / command trigger */}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-md border border-(--color-line-strong) bg-white/4 px-2.5 py-1.5 text-xs text-(--color-ink-3) transition-colors hover:bg-white/8"
          title="Search incidents, traces, deployments, and repository evidence"
        >
          <Search className="size-3.5" />
          <span className="hidden lg:inline">Search or run a command</span>
          <span className="ml-2 hidden items-center gap-0.5 rounded border border-(--color-line) px-1 py-px font-mono text-[10px] lg:flex">
            <Command className="size-2.5" />K
          </span>
        </button>

        <Select
          icon={Server}
          value={environment}
          options={ENVIRONMENTS}
          onChange={(v) => onEnvironment(v as Environment)}
        />
        <Select
          icon={CalendarRange}
          value={range}
          options={[...RANGES]}
          onChange={(v) => onRange(v as TimeRange)}
        />

        <div
          className="flex items-center gap-1.5 rounded-md border border-(--color-line-strong) bg-white/4 px-2.5 py-1.5"
          title={live ? 'Streaming live updates' : 'Reconnecting'}
        >
          <span
            className={`size-1.5 rounded-full ${live ? 'breathe' : ''}`}
            style={{ background: live ? 'var(--color-good)' : 'var(--color-warning)' }}
          />
          <span className="text-xs text-(--color-ink-2)">{live ? 'Live' : 'Reconnecting'}</span>
        </div>

        {action}

        <div
          className="flex size-7 items-center justify-center rounded-full bg-(--color-ai-soft) text-[11px] font-semibold text-(--color-ai)"
          title="Local demo approver"
        >
          DU
        </div>
      </div>
    </header>
  )
}

function Select({
  icon: Icon,
  value,
  options,
  onChange,
}: {
  icon: typeof Server
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="relative flex cursor-pointer items-center gap-1.5 rounded-md border border-(--color-line-strong) bg-white/4 px-2.5 py-1.5 transition-colors hover:bg-white/8">
      <Icon className="size-3.5 shrink-0 text-(--color-ink-3)" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-xs text-(--color-ink-1) outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-(--color-surface-2)">
            {o}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 size-3 text-(--color-ink-3)" />
    </label>
  )
}
