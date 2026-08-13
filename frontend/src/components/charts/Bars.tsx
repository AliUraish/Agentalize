import { useState } from 'react'
import { useWidth } from '../../lib/useWidth'

/**
 * Horizontal magnitude bars — one hue, zero baseline, value direct-labelled.
 * Categories here are nominal, so no value-ramp: every bar is the same colour
 * and length alone encodes magnitude.
 */
export function BarList({
  rows,
  color = 'var(--color-series-1)',
  formatValue = (v: number) => v.toLocaleString(),
  secondary,
}: {
  rows: { label: string; value: number; note?: string }[]
  color?: string
  formatValue?: (v: number) => string
  /** Optional right-hand column, e.g. sample size. */
  secondary?: (row: { label: string; value: number; note?: string }) => string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-(--color-ink-2)">
              {r.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="tabular text-[11px] font-medium">{formatValue(r.value)}</span>
              {secondary && (
                <span className="tabular text-[10px] text-(--color-ink-3)">{secondary(r)}</span>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-white/6">
            <div
              className="h-full rounded-[3px] transition-[width] duration-500"
              style={{ width: `${(r.value / max) * 100}%`, background: color }}
              title={`${r.label}: ${formatValue(r.value)}`}
            />
          </div>
          {r.note && <div className="mt-1 text-[10px] text-(--color-ink-3)">{r.note}</div>}
        </div>
      ))}
    </div>
  )
}

/**
 * Occurrences (bars) with affected users (line) on ONE shared count axis.
 * Both series are counts, so a single scale is honest here.
 */
export function OccurrenceChart({
  data,
  markers = [],
  height = 170,
}: {
  data: { hour: number; occurrences: number; affectedUsers: number }[]
  markers?: { at: number; label: string; tone?: string }[]
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const PAD = { l: 34, r: 12, t: 12, b: 24 }
  const plotW = Math.max(0, width - PAD.l - PAD.r)
  const plotH = height - PAD.t - PAD.b

  const max = Math.max(...data.map((d) => Math.max(d.occurrences, d.affectedUsers)), 1)
  const yMax = Math.ceil(max / 5) * 5 || 5
  const band = data.length > 0 ? plotW / data.length : 0
  const barW = Math.min(24, band * 0.55)

  const cx = (i: number) => PAD.l + band * (i + 0.5)
  const y = (v: number) => PAD.t + plotH - (v / yMax) * plotH

  const yTicks = [0, yMax / 2, yMax]
  const hovered = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const idx = Math.floor((e.clientX - rect.left - PAD.l) / (band || 1))
            setHover(idx >= 0 && idx < data.length ? idx : null)
          }}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.l}
                y1={y(t)}
                x2={width - PAD.r}
                y2={y(t)}
                stroke="var(--color-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="tabular fill-(--color-ink-3) text-[9px]"
              >
                {Math.round(t)}
              </text>
            </g>
          ))}

          {markers.map((m) => {
            const i = data.findIndex((d) => d.hour >= m.at)
            const px = i < 0 ? PAD.l : cx(Math.max(0, i)) - band / 2
            return (
              <g key={m.label}>
                <line
                  x1={px}
                  y1={PAD.t}
                  x2={px}
                  y2={PAD.t + plotH}
                  stroke={m.tone ?? 'var(--color-ink-3)'}
                  strokeWidth={1}
                />
                <text x={px + 4} y={PAD.t + 8} className="fill-(--color-ink-3) text-[9px]">
                  {m.label}
                </text>
              </g>
            )
          })}

          {/* Bars — square at the baseline, 3px rounded data-end */}
          {data.map((d, i) => (
            <rect
              key={`b-${d.hour}`}
              x={cx(i) - barW / 2}
              y={y(d.occurrences)}
              width={barW}
              height={Math.max(0, PAD.t + plotH - y(d.occurrences))}
              rx={3}
              fill="var(--color-series-1)"
              opacity={hover === null || hover === i ? 1 : 0.5}
            />
          ))}

          {/* Affected users line */}
          <path
            d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${cx(i)} ${y(d.affectedUsers)}`).join(' ')}
            fill="none"
            stroke="var(--color-series-2)"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {hovered && hover !== null && (
            <line
              x1={cx(hover)}
              y1={PAD.t}
              x2={cx(hover)}
              y2={PAD.t + plotH}
              stroke="var(--color-ink-2)"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          )}

          {data.map((d, i) =>
            i % 2 === 0 ? (
              <text
                key={`x-${d.hour}`}
                x={cx(i)}
                y={height - 7}
                textAnchor="middle"
                className="tabular fill-(--color-ink-3) text-[9px]"
              >
                {String(d.hour).padStart(2, '0')}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hovered && hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-(--color-line-strong) bg-(--color-surface-2) px-2.5 py-1.5 shadow-lg"
          style={{ left: Math.min(cx(hover) + 8, width - 140), top: PAD.t }}
        >
          <div className="tabular mb-1 font-mono text-[10px] text-(--color-ink-3)">
            {String(hovered.hour).padStart(2, '0')}:00
          </div>
          <Row color="var(--color-series-1)" label="Occurrences" value={hovered.occurrences} />
          <Row color="var(--color-series-2)" label="Users affected" value={hovered.affectedUsers} />
        </div>
      )}
    </div>
  )
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      <span className="text-(--color-ink-2)">{label}</span>
      <span className="tabular ml-auto pl-3 font-medium">{value}</span>
    </div>
  )
}

/** Compact trend line for stat tiles. No axes, no legend — the tile names it. */
export function Sparkline({
  values,
  color = 'var(--color-series-1)',
  width = 84,
  height = 24,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 4) + 2
    const y = height - 3 - ((v - min) / span) * (height - 6)
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2} fill={color} />
    </svg>
  )
}
