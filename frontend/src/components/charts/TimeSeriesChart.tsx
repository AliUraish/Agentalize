import { useState } from 'react'
import { useWidth } from '../../lib/useWidth'

export interface SeriesDef {
  key: string
  label: string
  color: string
}

export interface Marker {
  at: number
  label: string
  detail?: string
  tone?: string
}

/**
 * Multi-series line chart on a SINGLE y-axis with vertical deployment markers.
 *
 * Every series here shares a unit (percent, or count) — a second scale is never
 * introduced, per the dual-axis rule. The axis floor is non-zero and explicitly
 * labelled so a compressed band can't be mistaken for a zero baseline.
 */
export function TimeSeriesChart({
  data,
  series,
  markers = [],
  xKey = 'hour',
  height = 190,
  unit = '%',
  yFloor,
}: {
  data: Record<string, number>[]
  series: SeriesDef[]
  markers?: Marker[]
  xKey?: string
  height?: number
  unit?: '%' | 'count'
  /** Explicit axis floor. Omit to derive a padded floor from the data. */
  yFloor?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const PAD = { l: 40, r: 14, t: 12, b: 26 }
  const plotW = Math.max(0, width - PAD.l - PAD.r)
  const plotH = height - PAD.t - PAD.b

  const xs = data.map((d) => d[xKey])
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)

  const allValues = data.flatMap((d) => series.map((s) => d[s.key])).filter((v) => v !== undefined)
  // Don't seed the domain with 0 — that would flatten a percentage band back
  // onto a zero baseline and make the labelled floor a lie.
  const rawMax = allValues.length ? Math.max(...allValues) : 0
  const rawMin = allValues.length ? Math.min(...allValues) : 0
  const yMax = unit === '%' ? Math.min(100, Math.ceil((rawMax + 3) / 5) * 5) : niceMax(rawMax)
  const yMin = yFloor ?? (unit === '%' ? Math.max(0, Math.floor((rawMin - 3) / 5) * 5) : 0)

  const x = (v: number) => (plotW === 0 ? 0 : PAD.l + ((v - xMin) / (xMax - xMin || 1)) * plotW)
  const y = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) / ticks) * i)

  const hovered = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="overflow-visible"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const px = e.clientX - rect.left
            const frac = (px - PAD.l) / (plotW || 1)
            const idx = Math.round(frac * (data.length - 1))
            setHover(Math.max(0, Math.min(data.length - 1, idx)))
          }}
        >
          {/* Gridlines — solid hairlines, never dashed */}
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
                x={PAD.l - 7}
                y={y(t) + 3}
                textAnchor="end"
                className="tabular fill-(--color-ink-3) text-[9px]"
              >
                {unit === '%' ? `${Math.round(t)}%` : Math.round(t)}
              </text>
            </g>
          ))}

          {/* Deployment markers — vertical rule + flag */}
          {markers.map((m) => (
            <g key={`${m.at}-${m.label}`}>
              <line
                x1={x(m.at)}
                y1={PAD.t}
                x2={x(m.at)}
                y2={PAD.t + plotH}
                stroke={m.tone ?? 'var(--color-ink-3)'}
                strokeWidth={1}
                strokeOpacity={0.75}
              />
              <rect
                x={x(m.at) - 1.5}
                y={PAD.t}
                width={3}
                height={3}
                fill={m.tone ?? 'var(--color-ink-3)'}
              />
              <text
                x={x(m.at) + 4}
                y={PAD.t + 8}
                className="fill-(--color-ink-3) text-[9px]"
              >
                {m.label}
              </text>
            </g>
          ))}

          {/* Series lines — 2px */}
          {series.map((s) => {
            const d = data
              .map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row[xKey])} ${y(row[s.key])}`)
              .join(' ')
            return (
              <path
                key={s.key}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}

          {/* Endpoint dots — direct anchor for the legend */}
          {series.map((s) => {
            const last = data[data.length - 1]
            return (
              <circle
                key={`dot-${s.key}`}
                cx={x(last[xKey])}
                cy={y(last[s.key])}
                r={3.5}
                fill={s.color}
                stroke="var(--color-surface-1)"
                strokeWidth={2}
              />
            )
          })}

          {/* Crosshair */}
          {hovered && (
            <>
              <line
                x1={x(hovered[xKey])}
                y1={PAD.t}
                x2={x(hovered[xKey])}
                y2={PAD.t + plotH}
                stroke="var(--color-ink-2)"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              {series.map((s) => (
                <circle
                  key={`h-${s.key}`}
                  cx={x(hovered[xKey])}
                  cy={y(hovered[s.key])}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-surface-1)"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {/* x labels */}
          {data.map((row, i) =>
            i % Math.ceil(data.length / 7) === 0 ? (
              <text
                key={`x-${i}`}
                x={x(row[xKey])}
                y={height - 8}
                textAnchor="middle"
                className="tabular fill-(--color-ink-3) text-[9px]"
              >
                {String(row[xKey]).padStart(2, '0')}:00
              </text>
            ) : null,
          )}
        </svg>
      )}

      {/* Tooltip */}
      {hovered && width > 0 && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-(--color-line-strong) bg-(--color-surface-2) px-2.5 py-1.5 shadow-lg"
          style={{
            left: Math.min(Math.max(x(hovered[xKey]) + 10, 0), width - 150),
            top: PAD.t,
          }}
        >
          <div className="tabular mb-1 font-mono text-[10px] text-(--color-ink-3)">
            {String(hovered[xKey]).padStart(2, '0')}:00
          </div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
              <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
              <span className="text-(--color-ink-2)">{s.label}</span>
              <span className="tabular ml-auto pl-3 font-medium text-(--color-ink-1)">
                {unit === '%' ? `${hovered[s.key].toFixed(1)}%` : hovered[s.key]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
          <span className="text-[11px] text-(--color-ink-2)">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function niceMax(v: number): number {
  if (v <= 5) return 5
  const mag = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / mag) * mag
}
