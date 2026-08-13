import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, CircleAlert } from 'lucide-react'
import type { Incident } from '../../types/domain'
import { DEPLOYMENTS, EVALUATIONS, MEMORIES, RUNS } from '../../mock/dataset'
import { Panel } from '../../components/ui/Primitives'
import { EvaluatorBadge, PassBadge, VerifiedBadge } from '../../components/ui/Badge'
import { OccurrenceChart, BarList } from '../../components/charts/Bars'
import { Legend } from '../../components/charts/TimeSeriesChart'
import { formatDateTime, percent } from '../../lib/format'

export function OverviewTab({ incident }: { incident: Incident }) {
  const failingRun = RUNS.find((r) => r.runId === 'run_9f21')!
  const passingRun = RUNS.find((r) => r.runId === 'run_8c02')!

  const evalDistribution = Object.entries(
    EVALUATIONS.reduce<Record<string, number>>((acc, e) => {
      if (e.pass === false) acc[e.metric] = (acc[e.metric] ?? 0) + 1
      return acc
    }, {}),
  ).map(([label, value]) => ({ label, value }))

  const similar = MEMORIES.filter((m) => m.memoryId !== 'mem_77' && m.score > 0.5)

  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel
          title="Occurrences and affected users"
          hint="Hourly · deployment markers on the axis"
          action={
            <Legend
              series={[
                { key: 'o', label: 'Occurrences', color: 'var(--color-series-1)' },
                { key: 'u', label: 'Users affected', color: 'var(--color-series-2)' },
              ]}
            />
          }
          bodyClassName="px-3 pt-2 pb-3"
        >
          <OccurrenceChart
            data={incident.series}
            height={180}
            markers={DEPLOYMENTS.filter((d) => d.atHour >= 8).map((d) => ({
              at: d.atHour,
              label: d.version,
              tone:
                d.deploymentId === incident.suspectedDeploymentId
                  ? 'var(--color-critical)'
                  : 'var(--color-good)',
            }))}
          />
        </Panel>

        <Panel title="Failing vs successful run" hint="Same question, before and after v2.4.0">
          <div className="grid grid-cols-2 divide-x divide-(--color-line)">
            <RunColumn
              title="Failing"
              tone="var(--color-critical)"
              icon={<CircleAlert className="size-3.5" />}
              run={failingRun}
              rows={[
                ['Cache', 'hit · 41m old'],
                ['Ledger read', 'not performed'],
                ['Answer', '$1,284.40'],
                ['Truth at answer time', '$1,309.40'],
              ]}
            />
            <RunColumn
              title="Successful"
              tone="var(--color-good)"
              icon={<CircleCheck className="size-3.5" />}
              run={passingRun}
              rows={[
                ['Cache', 'miss'],
                ['Ledger read', 'performed'],
                ['Answer', '$2,140.10'],
                ['Truth at answer time', '$2,140.10'],
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Evaluation failures by metric" bodyClassName="p-3.5">
          <BarList rows={evalDistribution} color="var(--color-critical)" />
          {incident.evaluationSummary.conflicting && (
            <div className="mt-3 rounded-md border border-(--color-warning)/35 bg-(--color-warning-soft) p-2.5">
              <div className="text-[11px] font-medium text-(--color-warning)">
                Conflicting evaluations — shown as needs review, not averaged
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {EVALUATIONS.filter((e) => e.target.id === 'run_9f21').map((e) => (
                  <div key={e.evaluationId} className="flex items-center gap-1.5">
                    <PassBadge pass={e.pass} size="sm" />
                    <span className="truncate font-mono text-[10px] text-(--color-ink-2)">
                      {e.metric}
                    </span>
                    <span className="ml-auto shrink-0">
                      <EvaluatorBadge type={e.evaluator.type} size="sm" />
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-(--color-ink-3)">
                The model judge scored groundedness as a pass because the answer is faithful to
                what was retrieved. It cannot see that the retrieval itself was stale — which is
                why a deterministic failure overrides it.
              </p>
            </div>
          )}
        </Panel>

        <Panel
          title="Similar historical incidents"
          hint="Atlas Vector Search, filtered to this project"
          bodyClassName="divide-y divide-(--color-line)"
        >
          {similar.map((m) => (
            <Link
              key={m.memoryId}
              to={`/memory?focus=${m.memoryId}`}
              className="block px-3.5 py-2.5 transition-colors hover:bg-white/4"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug font-medium">{m.summary}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <VerifiedBadge verified={m.verified} size="sm" />
                    <span className="tabular text-[11px] text-(--color-ink-3)">
                      similarity {m.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-(--color-ink-3)">{m.similarityReason}</p>
                </div>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-(--color-ink-3)" />
              </div>
            </Link>
          ))}
        </Panel>

        <Panel title="User feedback themes" bodyClassName="p-3.5">
          <BarList
            rows={[
              { label: 'balance is wrong / old', value: 8 },
              { label: 'transfer declined unexpectedly', value: 3 },
              { label: 'had to call support', value: 1 },
            ]}
            color="var(--color-series-2)"
          />
          <p className="mt-3 text-[11px] text-(--color-ink-3)">
            Clustered from 12 redacted comments over {percent(12 / 39, 0)} of affected users.
          </p>
        </Panel>
      </div>
    </div>
  )
}

function RunColumn({
  title,
  tone,
  icon,
  run,
  rows,
}: {
  title: string
  tone: string
  icon: React.ReactNode
  run: { runId: string; agentVersion: string; startedAt: string }
  rows: [string, string][]
}) {
  return (
    <div className="p-3.5">
      <div className="flex items-center gap-1.5" style={{ color: tone }}>
        {icon}
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-(--color-ink-3)">
        {run.runId} · {run.agentVersion} · {formatDateTime(run.startedAt)}
      </div>
      <dl className="mt-2.5 flex flex-col gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-(--color-ink-3)">{k}</dt>
            <dd className="tabular truncate text-[11px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
