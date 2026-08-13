import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Global banner (§14). Every banner states the impact and offers exactly one
 * corrective action — never a bare warning the user can't act on.
 */
export function Banner({
  icon: Icon,
  tone,
  message,
  actionLabel,
  onAction,
  dismissible = true,
}: {
  icon: LucideIcon
  tone: 'warning' | 'critical' | 'accent'
  message: string
  actionLabel: string
  onAction?: () => void
  dismissible?: boolean
}) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  const color =
    tone === 'critical'
      ? 'var(--color-critical)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-accent)'

  return (
    <div
      className="flex shrink-0 items-center gap-2.5 border-b px-4 py-2"
      style={{ borderColor: `${color}38`, background: `${color}14` }}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1 text-xs text-(--color-ink-1)">{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 cursor-pointer rounded border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/8"
        style={{ borderColor: `${color}55`, color }}
      >
        {actionLabel}
      </button>
      {dismissible && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer rounded p-0.5 text-(--color-ink-3) hover:bg-white/8"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

export function ContentCaptureBanner() {
  return (
    <Banner
      icon={Eye}
      tone="accent"
      message="Production content capture is on for support-copilot. Prompts are redacted at the SDK; tool inputs and outputs are stored encrypted for 7 days."
      actionLabel="Review capture policy"
    />
  )
}
