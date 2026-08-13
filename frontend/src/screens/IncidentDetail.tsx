import { useSearchParams, useParams, Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Ellipsis,
  Eye,
  GitPullRequest,
  Lightbulb,
  Microscope,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { Tabs, Button, CopyableId, EmptyState } from '../components/ui/Primitives'
import {
  AutonomyBadge,
  ConfidenceBadge,
  SeverityBadge,
  StatusBadge,
} from '../components/ui/Badge'
import { formatDateTime, formatRelative } from '../lib/format'
import { OverviewTab } from './incident/OverviewTab'
import { EvidenceTab } from './incident/EvidenceTab'
import { InvestigationTab } from './incident/InvestigationTab'
import { FixTab } from './incident/FixTab'
import { VerificationTab } from './incident/VerificationTab'
import { TimelineTab } from './incident/TimelineTab'
import { useApiQuery } from '../hooks/useApiQuery'
import { mapIncident, type BackendIncident } from '../lib/liveData'

type Tab = 'overview' | 'evidence' | 'investigation' | 'fix' | 'verification' | 'timeline'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'investigation', label: 'Investigation' },
  { id: 'fix', label: 'Fix' },
  { id: 'verification', label: 'Verification' },
  { id: 'timeline', label: 'Timeline' },
]

export function IncidentDetail() {
  const { incidentId } = useParams()
  // Tab lives in the URL so a link can point at the exact view (§16).
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'overview'
  const incidentQuery = useApiQuery<BackendIncident>(
    `/incidents/${encodeURIComponent(incidentId || '')}`,
    10_000,
  )

  if (incidentQuery.loading && !incidentQuery.data) {
    return <EmptyState icon={Microscope} title="Loading incident" detail="Reading the latest investigation state from MongoDB…" />
  }

  const incident = incidentQuery.data ? mapIncident(incidentQuery.data) : null

  if (!incident) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Incident not found"
        detail={incidentQuery.error?.message || 'This incident does not exist, or you do not have access to this project.'}
        action={
          <Link to="/incidents">
            <Button variant="secondary">Back to incidents</Button>
          </Link>
        }
      />
    )
  }

  const best = incidentQuery.data?.bestHypothesis || [...(incidentQuery.data?.hypotheses || [])].sort(
    (a, b) => b.confidence - a.confidence,
  )[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky header */}
      <header className="shrink-0 border-b border-(--color-line) bg-(--color-surface-1) px-4 pt-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              <CopyableId value={incident.incidentId} />
            </div>
            <h1 className="mt-2 text-[19px] leading-6 font-semibold tracking-tight">
              {incident.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--color-ink-3)">
              <span>
                {incident.agentName} · {incident.environment}
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {incident.affectedUserCount} users · {incident.occurrenceCount} occurrences
              </span>
              <span title={incident.firstSeenAt}>
                First seen {formatDateTime(incident.firstSeenAt)}
              </span>
              <span title={incident.lastSeenAt}>
                Last seen {formatRelative(incident.lastSeenAt)}
              </span>
              <span>Owner {incident.owner.teamId}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Primary action follows the lifecycle position */}
            {incident.status === 'verifying' ? (
              <Button
                variant="primary"
                icon={BadgeCheck}
                onClick={() => setParams({ tab: 'verification' })}
              >
                View verification
              </Button>
            ) : incident.status === 'awaiting_approval' ? (
              <Button variant="primary" icon={GitPullRequest}>
                Approve PR
              </Button>
            ) : incident.activeInvestigationId ? (
              <Button
                variant="primary"
                icon={Microscope}
                onClick={() => setParams({ tab: 'investigation' })}
              >
                View investigation
              </Button>
            ) : (
              <Button variant="primary" icon={Microscope}>
                Start investigation
              </Button>
            )}
            <Button variant="secondary" icon={Eye}>
              Watch
            </Button>
            <Button variant="ghost" icon={Ellipsis} title="More actions">
              {''}
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2.5 border-t border-(--color-line) py-3 lg:grid-cols-4">
          <Summary label="What happened" text={incident.whatHappened} />
          <Summary label="Impact" text={incident.impact} />
          <Summary label="What changed" text={incident.whatChanged} />
          <div>
            <div className="mb-1 text-[10px] font-semibold tracking-[0.1em] text-(--color-ink-3) uppercase">
              Best hypothesis
            </div>
            {best ? (
              <>
                <p className="text-[12px] leading-snug text-(--color-ink-1)">{best.claim}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Lightbulb className="size-3 text-(--color-ai)" />
                  <ConfidenceBadge confidence={best.confidence} size="sm" />
                </div>
              </>
            ) : (
              <p className="text-[12px] text-(--color-ink-3)">
                No hypothesis yet — start an investigation.
              </p>
            )}
          </div>
        </div>

        {/* Recommended action */}
        <div className="mb-3 flex items-center gap-2 rounded-md border border-(--color-accent)/30 bg-(--color-accent-soft) px-3 py-2">
          <ArrowRight className="size-3.5 shrink-0 text-(--color-accent)" />
          <span className="min-w-0 flex-1 text-[12px]">{incident.recommendedAction}</span>
          {incident.activeInvestigationId && (
            <AutonomyBadge mode="fixer" size="sm" />
          )}
        </div>

        <Tabs
          tabs={TABS}
          active={tab}
          onChange={(id) => setParams({ tab: id })}
        />
      </header>

      {/* Body. The investigation workspace manages its own panes, so the page
          itself must not scroll on that tab. */}
      <div
        className={`min-h-0 flex-1 ${
          tab === 'investigation' ? 'flex overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {!['overview', 'timeline'].includes(tab) ? (
          <EmptyState
            icon={Microscope}
            title="Use the live overview or timeline"
            detail="This connected build currently renders the live incident summary and complete backend timeline. The richer replay workspaces remain presentation-only until their event models are aligned with the API."
            action={
              <Link to={`/incidents/${incident.incidentId}?tab=overview`}>
                <Button variant="secondary">Open live overview</Button>
              </Link>
            }
          />
        ) : (
          <>
            {tab === 'overview' && <OverviewTab incident={incident} />}
            {tab === 'evidence' && <EvidenceTab />}
            {tab === 'investigation' && <InvestigationTab incident={incident} />}
            {tab === 'fix' && <FixTab />}
            {tab === 'verification' && <VerificationTab />}
            {tab === 'timeline' && <TimelineTab incidentId={incident.incidentId} />}
          </>
        )}
      </div>
    </div>
  )
}

function Summary({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold tracking-[0.1em] text-(--color-ink-3) uppercase">
        {label}
      </div>
      <p className="text-[12px] leading-snug text-(--color-ink-1)">{text}</p>
    </div>
  )
}
