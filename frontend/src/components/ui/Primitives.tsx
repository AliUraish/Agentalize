import { useState } from 'react'
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export function Panel({
  title,
  hint,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      {title && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-line) px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[13px] leading-5 font-semibold">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-(--color-ink-3)">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.1em] text-(--color-ink-3) uppercase">
      {children}
    </div>
  )
}

/** IDs are only copyable through an explicit control (§16 interaction rules). */
export function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-xs text-(--color-ink-2)">{label ?? value}</code>
      <button
        type="button"
        aria-label={`Copy ${value}`}
        title={`Copy ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="cursor-pointer rounded p-0.5 text-(--color-ink-3) transition-colors hover:bg-white/8 hover:text-(--color-ink-1)"
      >
        {copied ? <Check className="size-3 text-(--color-good)" /> : <Copy className="size-3" />}
      </button>
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon: Icon,
  disabled,
  title,
  size = 'md',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: LucideIcon
  disabled?: boolean
  title?: string
  size?: 'sm' | 'md'
}) {
  const base =
    'inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45'
  const sizing = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-[13px]'
  const variants = {
    primary:
      'border-transparent bg-(--color-accent) text-white hover:bg-[#3d7ee8] cursor-pointer',
    secondary:
      'border-(--color-line-strong) bg-white/5 text-(--color-ink-1) hover:bg-white/10 cursor-pointer',
    ghost: 'border-transparent text-(--color-ink-2) hover:bg-white/6 cursor-pointer',
    danger:
      'border-(--color-critical)/45 bg-(--color-critical)/12 text-(--color-critical) hover:bg-(--color-critical)/20 cursor-pointer',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizing} ${variants[variant]}`}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} />}
      {children}
    </button>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center gap-0.5 border-b border-(--color-line)"
    >
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative cursor-pointer px-3 py-2 text-[13px] font-medium transition-colors ${
              on ? 'text-(--color-ink-1)' : 'text-(--color-ink-3) hover:text-(--color-ink-2)'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && (
                <span className="tabular rounded bg-white/8 px-1 font-mono text-[10px] text-(--color-ink-2)">
                  {t.count}
                </span>
              )}
            </span>
            {on && (
              <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-(--color-accent)" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/** §20 — empty, partial and loading states are designed, not accidental. */
export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: LucideIcon
  title: string
  detail: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 rounded-lg border border-(--color-line) bg-white/4 p-2.5">
        <Icon className="size-4 text-(--color-ink-3)" />
      </div>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-(--color-ink-3)">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/**
 * Says which source is missing rather than implying a zero (§15.2:
 * distinguish "no failures" from "evaluator not configured").
 */
export function PartialDataNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-(--color-warning)">
      <span className="mt-1 size-1 shrink-0 rounded-full bg-(--color-warning)" />
      <span>{children}</span>
    </div>
  )
}

export function ExternalLinkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-(--color-line-strong) bg-white/5 px-2 py-1 text-xs text-(--color-ink-1) transition-colors hover:bg-white/10"
    >
      {children}
      <ExternalLink className="size-3 text-(--color-ink-3)" />
    </a>
  )
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border border-(--color-line)">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs text-(--color-ink-2) hover:bg-white/4"
      >
        <ChevronDown
          className={`size-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {summary}
      </button>
      {open && <div className="border-t border-(--color-line) p-2.5">{children}</div>}
    </div>
  )
}

/** Progress meter for budgets — always paired with used/limit text. */
export function Meter({
  value,
  max,
  tone = 'accent',
}: {
  value: number
  max: number
  tone?: 'accent' | 'ai' | 'warning'
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color =
    pct > 85 ? 'var(--color-warning)' : tone === 'ai' ? 'var(--color-ai)' : 'var(--color-accent)'
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
