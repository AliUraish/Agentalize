import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Code2,
  FileCode2,
  Files,
  FolderClosed,
  FolderGit2,
  GitBranch,
  Lightbulb,
  Microscope,
  ShieldCheck,
  TestTube2,
  TriangleAlert,
} from 'lucide-react'
import { Badge, ConfidenceBadge } from '../components/ui/Badge'
import { EmptyState, Panel, SectionLabel } from '../components/ui/Primitives'
import { useApiQuery } from '../hooks/useApiQuery'
import type { Page } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { DEMO_AGENT_ID, DEMO_AGENT_NAME } from '../lib/demoScope'

interface InvestigationSummary {
  investigationId: string
  incidentId: string
  repositoryPath: string
  question?: string
  mode: string
  stage: string
  status: string
  createdAt: string
}

interface RepositoryEvidence {
  path: string
  line: number
  preview: string
  score: number
}

interface InvestigationStep {
  agentStepId: string
  summary: string
  details?: { repositoryEvidence?: RepositoryEvidence[] }
}

interface Hypothesis {
  hypothesisId: string
  claim: string
  confidence: number
  reasoningSummary: string
  status: string
}

interface Remediation {
  remediationId: string
  status: string
  proposedFiles: string[]
  regressionTest: string
  recommendedChange: string
  risk: string
  suggestedDiff: string
}

interface InvestigationDetail extends InvestigationSummary {
  completedAt?: string
  permissions: Record<string, boolean>
  steps: InvestigationStep[]
  hypotheses: Hypothesis[]
  remediations: Remediation[]
}

interface IncidentRecord {
  incidentId: string
  title: string
  summary: string
  severity: string
  environment: string
  agentId: string
}

interface RepositoryIndex {
  repositoryName: string
  repositoryPath: string
  files: { path: string; sizeBytes: number }[]
  structure?: { path: string; type: 'directory' | 'file'; sizeBytes?: number }[]
  fileCount?: number
  directoryCount?: number
}

interface RepositoryFile {
  path: string
  focusLine: number
  startLine: number
  endLine: number
  totalLines: number
  lines: { number: number; text: string }[]
}

export function InvestigationsScreen() {
  const [params, setParams] = useSearchParams()
  const investigations = useApiQuery<Page<InvestigationSummary>>(`/investigations?limit=200&agent_id=${DEMO_AGENT_ID}`, 5_000)
  const requested = params.get('focus')
  const selected = investigations.data?.items.find((item) => item.investigationId === requested)
    ?? investigations.data?.items[0]
    ?? null

  return (
    <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 gap-3 p-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel
        title="Investigations"
        hint={`${DEMO_AGENT_NAME} · fetching issues only`}
        bodyClassName="divide-y divide-(--color-line) overflow-y-auto"
      >
        {investigations.loading && !investigations.data ? (
          <EmptyState icon={Microscope} title="Loading investigations" detail="Reading agent investigations from MongoDB…" />
        ) : investigations.error && !investigations.data ? (
          <EmptyState icon={TriangleAlert} title="Could not load investigations" detail={investigations.error.message} />
        ) : !selected ? (
          <EmptyState icon={Microscope} title="No investigations yet" detail="Start one from an incident to let the agent inspect its repository." />
        ) : (
          investigations.data?.items.map((item) => {
            const active = item.investigationId === selected.investigationId
            return (
              <button
                key={item.investigationId}
                type="button"
                onClick={() => setParams({ focus: item.investigationId })}
                className={`block w-full cursor-pointer px-3.5 py-3 text-left transition-colors ${active ? 'bg-(--color-accent-soft)' : 'hover:bg-white/4'}`}
              >
                <div className="flex items-start gap-2">
                  <FolderGit2 className="mt-0.5 size-3.5 shrink-0 text-(--color-accent)" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{repositoryName(item.repositoryPath)}</div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-(--color-ink-3)">{item.question || 'Repository incident investigation'}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Status value={item.status} />
                      <span className="text-[10px] text-(--color-ink-3)">{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-3 shrink-0 text-(--color-ink-3)" />
                </div>
              </button>
            )
          })
        )}
      </Panel>

      {selected ? (
        <RepositoryInvestigationWorkspace key={selected.investigationId} investigationId={selected.investigationId} />
      ) : (
        <Panel><EmptyState icon={Code2} title="Select an investigation" detail="The repository, suspected issue, and supporting code will appear here." /></Panel>
      )}
    </div>
  )
}

export function RepositoryInvestigationWorkspace({ investigationId }: { investigationId: string }) {
  const detailQuery = useApiQuery<InvestigationDetail>(`/investigations/${encodeURIComponent(investigationId)}`, 5_000)
  const repositoryQuery = useApiQuery<RepositoryIndex>(`/investigations/${encodeURIComponent(investigationId)}/repository`, 10_000)
  const incidentsQuery = useApiQuery<Page<IncidentRecord>>(`/incidents?limit=200&agent_id=${DEMO_AGENT_ID}`, 10_000)
  const [selectedEvidence, setSelectedEvidence] = useState<RepositoryEvidence | null>(null)

  const detail = detailQuery.data
  const incident = incidentsQuery.data?.items.find((item) => item.incidentId === detail?.incidentId)
  const evidence = useMemo(
    () => detail?.steps.flatMap((step) => step.details?.repositoryEvidence ?? []) ?? [],
    [detail],
  )
  const activeEvidence = selectedEvidence ?? evidence[0] ?? null
  const hypothesis = detail?.hypotheses.toSorted((a, b) => b.confidence - a.confidence)[0]
  const remediation = detail?.remediations[0]
  const repositoryStructure = repositoryQuery.data?.structure
    ?? repositoryQuery.data?.files.map((file) => ({ ...file, type: 'file' as const }))
    ?? []

  if (detailQuery.loading && !detail) {
    return <Panel><EmptyState icon={Microscope} title="Loading repository analysis" detail="Reading the agent’s evidence and diagnosis…" /></Panel>
  }
  if (!detail) {
    return <Panel><EmptyState icon={TriangleAlert} title="Investigation unavailable" detail={detailQuery.error?.message || 'The investigation could not be loaded.'} /></Panel>
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Panel bodyClassName="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FolderGit2 className="size-4 text-(--color-accent)" />
              <h1 className="text-[15px] font-semibold">{repositoryQuery.data?.repositoryName || repositoryName(detail.repositoryPath)}</h1>
              <Status value={detail.status} />
            </div>
            <div className="mt-1.5 break-all font-mono text-[11px] text-(--color-ink-3)">{repositoryQuery.data?.repositoryPath || detail.repositoryPath}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone="ai" icon={Microscope} size="sm">{detail.mode}</Badge>
            <Badge tone="neutral" icon={GitBranch} size="sm">read-only</Badge>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Production issue" hint="What the SDK and evaluators observed" bodyClassName="p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-(--color-critical)" />
            <div>
              <h2 className="text-[13px] font-semibold">{incident?.title || detail.question || 'Production behavior needs investigation'}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-(--color-ink-2)">{incident?.summary || detail.question}</p>
              <div className="mt-2 text-[10px] text-(--color-ink-3)">{DEMO_AGENT_NAME} · {incident?.environment} · {incident?.severity} severity</div>
            </div>
          </div>
        </Panel>

        <Panel title="Why it happened" hint="Agent hypothesis grounded in repository evidence" bodyClassName="p-4">
          {hypothesis ? (
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-(--color-ai)" />
              <div>
                <p className="text-[13px] leading-relaxed">{hypothesis.claim}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-(--color-ink-3)">{hypothesis.reasoningSummary}</p>
                <div className="mt-2"><ConfidenceBadge confidence={hypothesis.confidence} size="sm" /></div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-(--color-ink-3)">The agent has not produced a hypothesis yet.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Repository evidence"
        hint={activeEvidence ? `Suspected issue at ${activeEvidence.path}:${activeEvidence.line}` : 'No matching code location found'}
        bodyClassName="grid min-h-[430px] grid-cols-[240px_minmax(0,1fr)] overflow-hidden"
      >
        <div className="min-h-0 overflow-y-auto border-r border-(--color-line)">
          <div className="border-b border-(--color-line) px-3 py-2">
            <SectionLabel>Candidate locations</SectionLabel>
          </div>
          {evidence.length === 0 ? (
            <div className="p-3 text-xs text-(--color-ink-3)">No repository matches yet.</div>
          ) : evidence.map((item) => {
            const active = activeEvidence?.path === item.path && activeEvidence.line === item.line
            return (
              <button key={`${item.path}:${item.line}`} type="button" onClick={() => setSelectedEvidence(item)} className={`block w-full cursor-pointer border-b border-(--color-line) px-3 py-2.5 text-left ${active ? 'bg-(--color-accent-soft)' : 'hover:bg-white/4'}`}>
                <div className="flex items-start gap-1.5">
                  <FileCode2 className="mt-0.5 size-3 shrink-0 text-(--color-accent)" />
                  <div className="min-w-0"><div className="truncate font-mono text-[11px]">{item.path}</div><div className="mt-0.5 text-[10px] text-(--color-ink-3)">line {item.line} · match score {item.score}</div></div>
                </div>
              </button>
            )
          })}

          {repositoryQuery.data && (
            <div>
              <div className="border-y border-(--color-line) px-3 py-2"><SectionLabel>Full architecture · {repositoryQuery.data.directoryCount ?? 0} folders · {repositoryQuery.data.fileCount ?? repositoryQuery.data.files.length} files</SectionLabel></div>
              {repositoryStructure.map((entry) => {
                const depth = entry.path.split('/').length - 1
                if (entry.type === 'directory') {
                  return <div key={`dir:${entry.path}`} className="flex items-center gap-1.5 px-3 py-1.5" style={{ paddingLeft: 12 + depth * 12 }}><FolderClosed className="size-3 shrink-0 text-(--color-accent)" /><span className="truncate font-mono text-[10px] text-(--color-ink-2)">{entry.path.split('/').at(-1)}</span></div>
                }
                return <button key={`file:${entry.path}`} type="button" onClick={() => setSelectedEvidence({ path: entry.path, line: 1, preview: '', score: 0 })} className="flex w-full cursor-pointer items-center gap-1.5 py-1.5 pr-3 text-left hover:bg-white/4" style={{ paddingLeft: 12 + depth * 12 }}><Files className="size-3 shrink-0 text-(--color-ink-3)" /><span className="truncate font-mono text-[10px] text-(--color-ink-2)">{entry.path.split('/').at(-1)}</span></button>
              })}
            </div>
          )}
        </div>

        {activeEvidence ? <SourceViewer investigationId={investigationId} evidence={activeEvidence} /> : (
          <EmptyState icon={Code2} title="No code selected" detail="Choose a candidate file to inspect the exact repository context." />
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Recommended change" hint="Proposed action; no repository write has occurred" bodyClassName="p-4">
          {remediation ? <><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-(--color-good)" /><p className="text-xs leading-relaxed">{remediation.recommendedChange}</p></div><div className="mt-3 flex flex-wrap gap-1.5">{remediation.proposedFiles.map((path) => <code key={path} className="rounded border border-(--color-line) bg-white/4 px-1.5 py-1 font-mono text-[10px]">{path}</code>)}</div></> : <p className="text-xs text-(--color-ink-3)">No change has been proposed.</p>}
        </Panel>
        <Panel title="How to prove the fix" hint="Regression test requested before approval" bodyClassName="p-4">
          {remediation ? <div className="flex items-start gap-2"><TestTube2 className="mt-0.5 size-4 shrink-0 text-(--color-ai)" /><div><p className="text-xs leading-relaxed">{remediation.regressionTest}</p><div className="mt-2"><Badge tone="warning" icon={CircleDashed} size="sm">not run</Badge></div></div></div> : <p className="text-xs text-(--color-ink-3)">No regression test has been proposed.</p>}
        </Panel>
      </div>
    </div>
  )
}

function SourceViewer({ investigationId, evidence }: { investigationId: string; evidence: RepositoryEvidence }) {
  const path = `/investigations/${encodeURIComponent(investigationId)}/repository/file?path=${encodeURIComponent(evidence.path)}&line=${evidence.line}&context=18`
  const source = useApiQuery<RepositoryFile>(path)
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-(--color-plane)">
      <div className="flex items-center gap-2 border-b border-(--color-line) px-3 py-2">
        <FileCode2 className="size-3.5 text-(--color-accent)" />
        <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{evidence.path}</code>
        <span className="font-mono text-[10px] text-(--color-ink-3)">line {evidence.line}</span>
      </div>
      {source.loading && !source.data ? (
        <EmptyState icon={Code2} title="Loading source" detail="Reading a safe window from the repository…" />
      ) : source.data ? (
        <div className="min-h-0 overflow-auto py-2 font-mono text-[11px] leading-5">
          {source.data.lines.map((line) => {
            const focused = line.number === source.data?.focusLine
            return <div key={line.number} className={`grid grid-cols-[54px_minmax(max-content,1fr)] px-2 ${focused ? 'bg-(--color-critical-soft)' : ''}`}><span className={`select-none pr-3 text-right ${focused ? 'text-(--color-critical)' : 'text-(--color-ink-3)'}`}>{line.number}</span><pre className={`whitespace-pre pr-4 ${focused ? 'text-(--color-ink-1)' : 'text-(--color-ink-2)'}`}>{line.text || ' '}</pre></div>
          })}
        </div>
      ) : (
        <div className="p-4"><div className="rounded-md border border-(--color-warning)/35 bg-(--color-warning-soft) p-3"><div className="text-[11px] font-semibold text-(--color-warning)">Source window unavailable</div><code className="mt-2 block whitespace-pre-wrap font-mono text-[11px] text-(--color-ink-2)">{evidence.preview || source.error?.message}</code></div></div>
      )}
    </div>
  )
}

function Status({ value }: { value: string }) {
  const complete = ['completed', 'resolved', 'passed', 'succeeded'].includes(value)
  return <Badge tone={complete ? 'good' : value === 'failed' ? 'critical' : 'ai'} icon={complete ? CheckCircle2 : value === 'failed' ? TriangleAlert : CircleDashed} size="sm">{value.replaceAll('_', ' ')}</Badge>
}

function repositoryName(path: string) {
  return path.split('/').filter(Boolean).at(-1) || 'Repository'
}
