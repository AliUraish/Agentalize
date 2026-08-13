import { useDeferredValue, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CircleCheck, Database, FlaskConical, Search, TriangleAlert } from 'lucide-react'
import { Panel, Button, EmptyState, SectionLabel } from '../components/ui/Primitives'
import { Badge, VerifiedBadge } from '../components/ui/Badge'
import { formatDateTime } from '../lib/format'
import type { Memory } from '../types/domain'
import { useApiQuery } from '../hooks/useApiQuery'
import type { Page } from '../lib/api'
import { mapMemory, type BackendMemory } from '../lib/liveData'

const OUTCOME_TONE = {
  resolved: 'good',
  ineffective: 'warning',
  rolled_back: 'warning',
  regressed: 'critical',
} as const

const OUTCOME_ICON = {
  resolved: CircleCheck,
  ineffective: TriangleAlert,
  rolled_back: Ban,
  regressed: TriangleAlert,
} as const

export function MemoryExplorer() {
  const [params, setParams] = useSearchParams()
  const focus = params.get('focus')
  const [query, setQuery] = useState('stale cached tool result after a refactor')
  const [outcome, setOutcome] = useState<string>('all')
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const deferredQuery = useDeferredValue(query)
  const searchPath = `/memories/search?query=${encodeURIComponent(deferredQuery)}&limit=50${outcome === 'all' ? '' : `&outcome=${encodeURIComponent(outcome)}`}`
  const memoryQuery = useApiQuery<Page<BackendMemory>>(searchPath, 10_000)
  const memories = useMemo(
    () => (memoryQuery.data?.items || []).map(mapMemory),
    [memoryQuery.data],
  )

  const results = useMemo(() => {
    return memories.filter((m) => {
      if (verifiedOnly && !m.verified) return false
      return true
    }).sort((a, b) => b.score - a.score)
  }, [memories, verifiedOnly])

  const selected = memories.find((m) => m.memoryId === focus) ?? results[0] ?? null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <Panel bodyClassName="p-3.5">
          <label className="flex items-center gap-2 rounded-md border border-(--color-line-strong) bg-white/4 px-2.5 py-2 focus-within:border-(--color-accent)/50">
            <Search className="size-3.5 shrink-0 text-(--color-ink-3)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe the failure in your own words…"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-(--color-ink-3)"
            />
          </label>
          <p className="mt-2 text-[11px] text-(--color-ink-3)">
            Natural language runs an Atlas Vector Search over redacted incident summaries,
            pre-filtered by organization, project and access policy — never a raw history dump.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SectionLabel>Filters</SectionLabel>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="cursor-pointer rounded-md border border-(--color-line-strong) bg-white/4 px-2 py-1 text-[11px] outline-none"
            >
              {['all', 'resolved', 'rolled_back', 'ineffective', 'regressed'].map((o) => (
                <option key={o} value={o} className="bg-(--color-surface-2)">
                  {o}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors ${
                verifiedOnly
                  ? 'border-(--color-good)/45 bg-(--color-good-soft) text-(--color-good)'
                  : 'border-(--color-line) text-(--color-ink-3) hover:bg-white/5'
              }`}
            >
              Verified outcomes only
            </button>
          </div>
        </Panel>

        <Panel
          title="Results"
          hint={memoryQuery.loading ? 'Searching MongoDB…' : `${results.length} live memories · ranked by similarity, recency and verified outcome`}
          bodyClassName="divide-y divide-(--color-line) overflow-y-auto"
        >
          {memoryQuery.error && !memoryQuery.data ? (
            <EmptyState
              icon={TriangleAlert}
              title="Memory search unavailable"
              detail={memoryQuery.error.message}
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No memories match"
              detail="No stored production memory matches this search and filter yet."
              action={
                <Button variant="secondary" onClick={() => setVerifiedOnly(false)}>
                  Include unverified
                </Button>
              }
            />
          ) : (
            results.map((m) => (
              <button
                key={m.memoryId}
                type="button"
                onClick={() => setParams({ focus: m.memoryId })}
                className={`block w-full cursor-pointer px-3.5 py-3 text-left transition-colors ${
                  selected?.memoryId === m.memoryId ? 'bg-(--color-accent-soft)' : 'hover:bg-white/4'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] leading-snug font-medium">{m.summary}</span>
                  <span className="tabular shrink-0 font-mono text-[11px] text-(--color-ink-3)">
                    {m.score.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <VerifiedBadge verified={m.verified} size="sm" />
                  <Badge
                    tone={OUTCOME_TONE[m.outcome]}
                    icon={OUTCOME_ICON[m.outcome]}
                    size="sm"
                  >
                    {m.outcome.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] text-(--color-ink-3)">
                    {formatDateTime(m.createdAt)}
                  </span>
                </div>
                {/* Similarity is explained, not asserted */}
                <p className="mt-1.5 text-[11px] leading-snug text-(--color-ink-3)">
                  <span className="text-(--color-ink-2)">Why this matched: </span>
                  {m.similarityReason}
                </p>
              </button>
            ))
          )}
        </Panel>
      </div>

      {selected ? (
        <MemoryDetail memory={selected} />
      ) : (
        <Panel>
          <EmptyState
            icon={Database}
            title="Select a memory"
            detail="Pick a result to see what happened, what was tried, and how production responded."
          />
        </Panel>
      )}
    </div>
  )
}

function MemoryDetail({ memory: m }: { memory: Memory }) {
  return (
    <Panel
      title={m.memoryId}
      hint="What the agent is allowed to reuse from this incident"
      action={<VerifiedBadge verified={m.verified} size="sm" />}
      bodyClassName="overflow-y-auto"
    >
      <div className="flex flex-col gap-3.5 p-4">
        <div>
          <h3 className="text-[15px] leading-snug font-semibold">{m.summary}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-(--color-ink-2)">{m.detail}</p>
        </div>

        <Field label="Production outcome">
          <div className="flex items-start gap-2 rounded-md border border-(--color-good)/30 bg-(--color-good-soft) px-2.5 py-2">
            <Database className="mt-0.5 size-3 shrink-0 text-(--color-good)" />
            <span className="text-[12px] text-(--color-ink-1)">{m.productionOutcome}</span>
          </div>
        </Field>

        {m.regressionTest ? (
          <Field label="Regression test">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-3 shrink-0 text-(--color-good)" />
              <code className="font-mono text-[11px] text-(--color-ink-2)">
                {m.regressionTest}
              </code>
            </div>
          </Field>
        ) : (
          <Field label="Regression test">
            <div className="flex items-center gap-2 text-[12px] text-(--color-warning)">
              <TriangleAlert className="size-3 shrink-0" />
              None — this attempt was rolled back before a test landed.
            </div>
          </Field>
        )}

        <Field label="Repository paths">
          <div className="flex flex-wrap gap-1.5">
            {m.repositoryPaths.map((p) => (
              <code
                key={p}
                className="rounded border border-(--color-line) bg-(--color-surface-2) px-1.5 py-0.5 font-mono text-[10px] text-(--color-ink-2)"
              >
                {p}
              </code>
            ))}
          </div>
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {m.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-(--color-ink-3)"
              >
                {t}
              </span>
            ))}
          </div>
        </Field>

        <div className="border-t border-(--color-line) pt-3">
          <SectionLabel>Retrieval control</SectionLabel>
          <p className="mt-1.5 text-[11px] text-(--color-ink-3)">
            {m.excludedFromRetrieval
              ? 'Excluded from agent retrieval.'
              : 'This memory is eligible for agent retrieval. Correct it, deprecate it, or exclude it with a reason — a wrong memory is worse than no memory.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary">
              Correct
            </Button>
            <Button size="sm" variant="secondary">
              Deprecate
            </Button>
            <Button size="sm" variant="danger" icon={Ban}>
              Exclude from retrieval
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
