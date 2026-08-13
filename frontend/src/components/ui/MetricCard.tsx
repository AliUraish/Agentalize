import { ArrowDown, ArrowUp, Minus, TriangleAlert } from 'lucide-react'
import type { OverviewKpi } from '../../types/domain'
import { deltaIsGood, formatDelta, formatValue } from '../../lib/format'
import { Sparkline } from '../charts/Bars'

/**
 * KPI tile: value, change vs the previous window, sample size, and a
 * data-quality warning when the number can't yet be trusted (§15.2).
 * Direction is carried by an arrow as well as colour.
 */
export function MetricCard({ kpi }: { kpi: OverviewKpi }) {
  const good = deltaIsGood(kpi.delta, kpi.goodDirection)
  const tone =
    good === null ? 'var(--color-ink-3)' : good ? 'var(--color-good)' : 'var(--color-critical)'
  const DeltaIcon = kpi.delta === null || kpi.delta === 0 ? Minus : kpi.delta > 0 ? ArrowUp : ArrowDown

  return (
    <div className="panel flex flex-col justify-between gap-2.5 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs leading-4 text-(--color-ink-2)">{kpi.label}</span>
        {kpi.dataQuality && (
          <span title={kpi.dataQuality} className="shrink-0">
            <TriangleAlert className="size-3 text-(--color-warning)" />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[26px] leading-7 font-semibold tracking-tight">
            {formatValue(kpi.value, kpi.unit)}
          </div>
          <div
            className="mt-1 flex items-center gap-1 whitespace-nowrap"
            style={{ color: tone }}
          >
            <DeltaIcon className="size-3 shrink-0" strokeWidth={2.4} />
            <span className="tabular text-[11px] font-medium">
              {formatDelta(kpi.delta, kpi.unit)}
            </span>
            <span className="text-[11px] text-(--color-ink-3)">vs prev</span>
          </div>
        </div>
        <div className="shrink-0 pb-0.5">
          <Sparkline
            width={64}
            values={kpi.series}
            color={good === false ? 'var(--color-critical)' : 'var(--color-series-1)'}
          />
        </div>
      </div>

      <div className="tabular text-[10px] text-(--color-ink-3)">
        n = {kpi.sampleSize.toLocaleString()}
        {kpi.dataQuality && (
          <span className="ml-1.5 text-(--color-warning)">· {kpi.dataQuality}</span>
        )}
      </div>
    </div>
  )
}
