/** All timestamps display in local time; callers pass the ISO string as the title for UTC on hover (§16). */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

/** Elapsed replay clock, mm:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export type Unit = '%' | 'ms' | '$' | 'count'

export function formatValue(value: number | null, unit: Unit): string {
  if (value === null) return '—'
  switch (unit) {
    case '%':
      return `${value.toFixed(1)}%`
    case 'ms':
      return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`
    case '$':
      return `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`
    case 'count':
      return value.toLocaleString()
  }
}

export function formatDelta(delta: number | null, unit: Unit): string {
  if (delta === null) return '—'
  const sign = delta > 0 ? '+' : ''
  if (unit === '%') return `${sign}${delta.toFixed(1)} pts`
  if (unit === '$') return `${sign}$${Math.abs(delta) < 1 ? delta.toFixed(3) : delta.toFixed(2)}`
  if (unit === 'ms') return `${sign}${Math.round(delta)}ms`
  return `${sign}${delta.toLocaleString()}`
}

/** Is a change in this metric an improvement? Drives the delta colour + arrow. */
export function deltaIsGood(delta: number | null, goodDirection: 'up' | 'down'): boolean | null {
  if (delta === null || delta === 0) return null
  return goodDirection === 'up' ? delta > 0 : delta < 0
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`
}
