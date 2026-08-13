import { Activity, Database, Radio, Rocket, Users } from 'lucide-react'
import { OccurrenceChart } from '../../components/charts/Bars'
import { Badge } from '../../components/ui/Badge'
import { EmptyState, Panel, SectionLabel } from '../../components/ui/Primitives'
import { formatDateTime } from '../../lib/format'
import type { Incident } from '../../types/domain'

export function OverviewTab({ incident }: { incident: Incident }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Production evidence" hint="Live values from the incident document" bodyClassName="p-3.5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Activity} label="Occurrences" value={incident.occurrenceCount.toLocaleString()} />
            <Stat icon={Users} label="Affected users" value={incident.affectedUserCount.toLocaleString()} />
            <Stat icon={Radio} label="Evaluations" value={incident.evaluationSummary.failed.toLocaleString()} />
            <Stat icon={Database} label="Feedback" value={incident.feedbackCount.toLocaleString()} />
          </div>
        </Panel>

        <Panel title="Observed impact" hint="Current correlated production window" bodyClassName="p-3.5">
          <OccurrenceChart data={incident.series} height={190} />
          <p className="mt-2 text-[11px] text-(--color-ink-3)">
            The API currently stores the incident aggregate. Additional time buckets will render automatically when the backend exposes historical series.
          </p>
        </Panel>

        <Panel title="Incident narrative" bodyClassName="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="What happened" text={incident.whatHappened} />
            <Field label="Impact" text={incident.impact} />
            <Field label="What changed" text={incident.whatChanged} />
            <Field label="Recommended action" text={incident.recommendedAction} />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Signal references" hint={`${incident.signalRefs.length} linked records`} bodyClassName="divide-y divide-(--color-line)">
          {incident.signalRefs.length ? incident.signalRefs.map((reference) => (
            <div key={reference} className="flex items-center gap-2 px-3.5 py-2.5">
              <Radio className="size-3.5 text-(--color-ai)" />
              <code className="min-w-0 truncate font-mono text-[11px] text-(--color-ink-2)">{reference}</code>
            </div>
          )) : <EmptyState icon={Radio} title="No linked signals" detail="Evaluation and feedback references will appear here." />}
        </Panel>

        <Panel title="Deployments" hint="Production changes linked to this incident" bodyClassName="p-3.5">
          {incident.deploymentIds.length ? (
            <div className="flex flex-col gap-2">
              {incident.deploymentIds.map((deployment) => (
                <div key={deployment} className="flex items-center gap-2 rounded-md border border-(--color-line) p-2.5">
                  <Rocket className="size-3.5 text-(--color-ink-3)" />
                  <code className="font-mono text-[11px]">{deployment}</code>
                  {deployment === incident.suspectedDeploymentId && <Badge tone="warning" icon={Rocket} size="sm">suspected</Badge>}
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Rocket} title="No deployment linked" detail="The investigator has not confirmed a causal deployment." />}
        </Panel>

        <Panel title="Record metadata" bodyClassName="p-3.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[11px]">
            <Meta label="Agent" value={incident.agentName} />
            <Meta label="Environment" value={incident.environment} />
            <Meta label="First seen" value={formatDateTime(incident.firstSeenAt)} />
            <Meta label="Last seen" value={formatDateTime(incident.lastSeenAt)} />
            <Meta label="Owner" value={incident.owner.teamId} />
            <Meta label="Version" value={String(incident.version)} />
          </dl>
        </Panel>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="rounded-md border border-(--color-line) p-3"><Icon className="size-3.5 text-(--color-ink-3)" /><div className="tabular mt-2 text-xl font-semibold">{value}</div><div className="mt-1 text-[10px] tracking-wide text-(--color-ink-3) uppercase">{label}</div></div>
}

function Field({ label, text }: { label: string; text: string }) {
  return <div><SectionLabel>{label}</SectionLabel><p className="mt-1.5 text-[12px] leading-relaxed text-(--color-ink-2)">{text}</p></div>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <><dt className="text-(--color-ink-3)">{label}</dt><dd className="min-w-0 truncate text-right font-mono text-(--color-ink-2)">{value}</dd></>
}
