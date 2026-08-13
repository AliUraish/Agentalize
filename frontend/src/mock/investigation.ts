import type { InvestigationEvent } from '../types/events'
import { HYPOTHESES, INVESTIGATION } from './dataset'

/**
 * The scripted investigation stream for inv_789.
 *
 * Emits exactly what `GET /v1/investigations/:id/events` will emit, so the UI
 * cannot tell the mock from the real orchestrator. `t` is the replay clock in
 * ms; the real run took just over two hours.
 */

let seq = 0
const id = () => `blk_${++seq}`

export const INVESTIGATION_EVENTS: InvestigationEvent[] = [
  {
    t: 0,
    type: 'investigation.started',
    investigationId: 'inv_789',
    incidentId: 'inc_123',
    autonomyMode: 'fixer',
  },

  // ── 1. Scope the context bundle ──────────────────────────────────────────
  { t: 200, type: 'stage.entered', stage: 'context', workMode: 'triage' },
  {
    t: 700,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'context',
      workMode: 'triage',
      kind: 'observation',
      text: 'Incident inc_123 groups 74 occurrences affecting 39 users, all on support-copilot v2.4.0 in production. 68 of 74 correlated evaluations failed.',
      evidence: [
        { id: 'inc_123', type: 'evaluation', label: '68 failing evaluations', detail: 'answer_correctness, tool_result_freshness' },
        { id: 'feedback_123', type: 'feedback', label: '12 negative feedback items', detail: 'category incorrect_information' },
      ],
    },
  },
  {
    t: 1600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'context',
      workMode: 'triage',
      kind: 'observation',
      text: 'One evaluator disagrees: the groundedness model judge passed the same run that the deterministic freshness check failed. Surfacing the conflict rather than averaging it.',
      evidence: [
        { id: 'eval_125', type: 'evaluation', label: 'groundedness = pass', detail: 'model judge · confidence 0.61' },
        { id: 'eval_124', type: 'evaluation', label: 'tool_result_freshness = fail', detail: 'deterministic · confidence 1.00' },
      ],
    },
  },
  { t: 2400, type: 'stage.completed', stage: 'context', status: 'completed' },

  // ── 2. Retrieve memory — the warm start ──────────────────────────────────
  { t: 2600, type: 'stage.entered', stage: 'memory', workMode: 'retrieve_memory' },
  {
    t: 3000,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'memory',
      workMode: 'retrieve_memory',
      kind: 'action',
      text: 'Search verified incident memory for this failure signature',
      tool: 'memory.search',
      command: '$vectorSearch · filter { projectId, agentId, outcome: "resolved", verified: true } · k=12',
      scope: 'Read project memory',
    },
  },
  {
    t: 4200,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'memory',
      workMode: 'retrieve_memory',
      kind: 'result',
      status: 'success',
      text: '3 verified memories retrieved. The top match is the same failure mode in the same module: a cache key that stopped including a version component after a refactor.',
      artifacts: [
        { label: 'mem_12 · 0.94 · verified', ref: '/memory/mem_12' },
        { label: 'mem_44 · 0.79 · verified', ref: '/memory/mem_44' },
        { label: 'mem_51 · 0.71 · rolled back', ref: '/memory/mem_51' },
      ],
    },
  },
  {
    t: 5200,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'memory',
      workMode: 'retrieve_memory',
      kind: 'observation',
      text: 'mem_51 records that cache-busting on every lookup was tried for this exact problem in February and rolled back within the hour — ledger load doubled. That option is off the table.',
      evidence: [
        { id: 'mem_51', type: 'memory', label: 'mem_51 — rolled back', detail: 'Ledger load doubled; p95 +40%' },
      ],
    },
  },
  { t: 6000, type: 'stage.completed', stage: 'memory', status: 'completed' },

  // ── 3. Inspect the repository ────────────────────────────────────────────
  { t: 6200, type: 'stage.entered', stage: 'inspect', workMode: 'diagnose' },
  {
    t: 6600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'inspect',
      workMode: 'diagnose',
      kind: 'action',
      text: 'Read the retrieval cache module at the deployed commit',
      tool: 'repo.read',
      command: 'git show a91c33f:services/retrieval/cache.py',
      scope: 'Read repository (read-only)',
    },
  },
  {
    t: 7900,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'inspect',
      workMode: 'diagnose',
      kind: 'observation',
      text: 'build_key() at cache.py:48 returns "{namespace}:{account.id}". The diff for a91c33f removed the account.version component with the comment "dropped for a shorter key".',
      evidence: [
        { id: 'code_cache', type: 'code', label: 'services/retrieval/cache.py:48', detail: 'build_key() omits account.version' },
        { id: 'dep_456', type: 'deployment', label: 'a91c33f', detail: 'Cache key refactor in v2.4.0' },
      ],
    },
  },
  {
    t: 9100,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'inspect',
      workMode: 'diagnose',
      kind: 'observation',
      text: 'The balance namespace TTL is 15 minutes in config.py:14. A ledger write inside that window cannot invalidate the entry, because nothing in the key changes.',
      evidence: [
        { id: 'code_config', type: 'code', label: 'services/retrieval/config.py:14', detail: 'TTL_BY_NAMESPACE["balance"] = 15 minutes' },
        { id: 'span_tool_balance', type: 'trace', label: 'cache.age_ms 2,461,000', detail: 'ledger.read_performed=false' },
      ],
    },
  },
  { t: 10000, type: 'stage.completed', stage: 'inspect', status: 'completed' },

  // ── 4. Rank hypotheses ───────────────────────────────────────────────────
  { t: 10200, type: 'stage.entered', stage: 'hypothesize', workMode: 'diagnose' },
  {
    t: 10800,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'hypothesize',
      workMode: 'diagnose',
      kind: 'hypothesis',
      hypothesisId: 'hyp_1',
      claim: HYPOTHESES[0].claim,
      confidence: 0.72,
      supporting: HYPOTHESES[0].supporting,
      contradicting: [],
    },
  },
  {
    t: 11600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'hypothesize',
      workMode: 'diagnose',
      kind: 'action',
      text: 'Check whether the upstream ledger was simply lagging',
      tool: 'metrics.query',
      command: 'ledger.read_latency p95 · window 14:00–20:00',
      scope: 'Read production telemetry',
    },
  },
  {
    t: 12400,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'hypothesize',
      workMode: 'diagnose',
      kind: 'result',
      status: 'success',
      text: 'Ledger p95 is 84ms across the window with no replication lag. On failing runs the ledger was never called at all — ruling out upstream lag.',
    },
  },
  { t: 13200, type: 'hypothesis.ranked', hypotheses: HYPOTHESES },
  { t: 13600, type: 'stage.completed', stage: 'hypothesize', status: 'completed' },

  // ── 5. Reproduce ─────────────────────────────────────────────────────────
  { t: 13800, type: 'stage.entered', stage: 'reproduce', workMode: 'reproduce' },
  {
    t: 14200,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'reproduce',
      workMode: 'reproduce',
      kind: 'action',
      text: 'Reproduce in an isolated sandbox at the deployed commit',
      tool: 'sandbox.run',
      command: 'seed cache(version=100) → ledger.write → balance.get',
      scope: 'Run sandbox tests · network disabled',
    },
  },
  { t: 14600, type: 'test.progress', testRunId: 'tr_0', line: '$ sandbox up --commit a91c33f --network none', status: 'running' },
  { t: 15100, type: 'test.progress', testRunId: 'tr_0', line: 'seeded balance:acct_test → version 100', status: 'running' },
  { t: 15600, type: 'test.progress', testRunId: 'tr_0', line: 'ledger.write(+25.00) → account version 101', status: 'running' },
  { t: 16100, type: 'test.progress', testRunId: 'tr_0', line: 'balance.get() → version 100  served_from_cache=True', status: 'failed' },
  {
    t: 16600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'reproduce',
      workMode: 'reproduce',
      kind: 'result',
      status: 'success',
      text: 'Reproduced deterministically, 5 of 5 attempts. The stale value is returned until the 15-minute TTL expires, exactly as hypothesised.',
      artifacts: [{ label: 'Reproduction log', ref: '#repro' }],
    },
  },
  { t: 17400, type: 'stage.completed', stage: 'reproduce', status: 'completed' },

  // ── 6. Failing regression test ───────────────────────────────────────────
  { t: 17600, type: 'stage.entered', stage: 'test', workMode: 'remediate' },
  {
    t: 18000,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'test',
      workMode: 'remediate',
      kind: 'action',
      text: 'Add a regression test that pins the invariant, and confirm it fails before any fix',
      tool: 'repo.write',
      command: 'uv run pytest tests/retrieval/test_cache_key.py -q  # at a91c33f',
      scope: 'Write isolated branch',
    },
  },
  { t: 18500, type: 'test.progress', testRunId: 'tr_0', line: '$ uv run pytest tests/retrieval/test_cache_key.py -q', status: 'running' },
  { t: 19000, type: 'test.progress', testRunId: 'tr_0', line: 'F [100%]', status: 'running' },
  { t: 19400, type: 'test.progress', testRunId: 'tr_0', line: 'E   assert 100 == 101', status: 'failed' },
  {
    t: 19900,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'test',
      workMode: 'remediate',
      kind: 'result',
      status: 'success',
      text: 'The new test fails at the base commit for the right reason. It is now a real regression test rather than an assertion written to match the patch.',
      artifacts: [{ label: 'tests/retrieval/test_cache_key.py', ref: '#diff' }],
    },
  },
  { t: 20600, type: 'stage.completed', stage: 'test', status: 'completed' },

  // ── 7. Patch ─────────────────────────────────────────────────────────────
  { t: 20800, type: 'stage.entered', stage: 'patch', workMode: 'remediate' },
  {
    t: 21400,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'patch',
      workMode: 'remediate',
      kind: 'action',
      text: 'Restore account_version for versioned namespaces and shorten the balance TTL to 30s',
      tool: 'repo.write',
      command: 'edit services/retrieval/cache.py services/retrieval/config.py',
      scope: 'Write isolated branch',
    },
  },
  {
    t: 22600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'patch',
      workMode: 'remediate',
      kind: 'observation',
      text: 'Scoped the key change to a VERSIONED_NAMESPACES allowlist so the other five namespaces keep their current behaviour. mem_44 records that a global TTL change caused its own incident.',
      evidence: [
        { id: 'mem_44', type: 'memory', label: 'mem_44 — verified', detail: 'Global TTL change degraded correctness; per-namespace was the accepted fix' },
      ],
    },
  },
  { t: 23600, type: 'stage.completed', stage: 'patch', status: 'completed' },

  // ── 8. Verify in development ─────────────────────────────────────────────
  { t: 23800, type: 'stage.entered', stage: 'verify_dev', workMode: 'verify_development' },
  { t: 24200, type: 'test.progress', testRunId: 'tr_1', line: '$ uv run pytest tests/retrieval -q', status: 'running' },
  { t: 24900, type: 'test.progress', testRunId: 'tr_1', line: '.................. [100%]  19 passed in 4.20s', status: 'passed' },
  { t: 25400, type: 'test.progress', testRunId: 'tr_2', line: '$ uv run pytest tests/agents/support -q', status: 'running' },
  { t: 26200, type: 'test.progress', testRunId: 'tr_2', line: '34 passed, 1 skipped in 18.60s', status: 'passed' },
  { t: 26700, type: 'test.progress', testRunId: 'tr_3', line: '$ uv run ruff check . && uv run mypy services', status: 'running' },
  { t: 27300, type: 'test.progress', testRunId: 'tr_3', line: 'All checks passed! · Success: no issues found in 214 source files', status: 'passed' },
  { t: 27800, type: 'test.progress', testRunId: 'tr_4', line: '$ uv run pytest -q', status: 'running' },
  { t: 28900, type: 'test.progress', testRunId: 'tr_4', line: '412 passed, 3 skipped in 214.02s', status: 'passed' },
  {
    t: 29400,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'verify_dev',
      workMode: 'verify_development',
      kind: 'result',
      status: 'success',
      text: 'All four required check groups pass, including the previously failing regression test. Cache hit rate for the balance namespace drops from 74% to 18% in the sandbox benchmark — within the ledger read quota.',
    },
  },
  { t: 30200, type: 'stage.completed', stage: 'verify_dev', status: 'completed' },

  // ── 9. Report ────────────────────────────────────────────────────────────
  { t: 30400, type: 'stage.entered', stage: 'report', workMode: 'decision_support' },
  {
    t: 31000,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'report',
      workMode: 'decision_support',
      kind: 'result',
      status: 'success',
      text: 'Remediation report ready: 3 files, +32 −4, one new regression test, four risk findings (two medium, two low).',
      artifacts: [{ label: 'Diff and risk analysis', ref: '#fix' }],
    },
  },
  {
    t: 31800,
    type: 'budget.updated',
    budgets: INVESTIGATION.budgets,
  },
  { t: 32200, type: 'stage.completed', stage: 'report', status: 'completed' },

  // ── 10. Approval gate — the agent stops here ─────────────────────────────
  { t: 32400, type: 'stage.entered', stage: 'approval', workMode: 'decision_support' },
  {
    t: 32900,
    type: 'permission.required',
    stage: 'approval',
    label: 'Open a pull request',
    note: 'Fixer mode cannot open a PR without approval. High severity requires 2 approvers.',
  },
  { t: 33300, type: 'approval.requested', remediationId: 'rem_301', approvers: ['D. Marsh', 'R. Kachroo'] },
  {
    t: 34000,
    type: 'human.message',
    author: 'D. Marsh',
    text: 'Hit rate dropping to 18% is the part I care about — is ledger read volume within quota?',
  },
  {
    t: 34800,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'approval',
      workMode: 'decision_support',
      kind: 'observation',
      text: 'Projected ledger reads rise from roughly 900/hour to 3,300/hour. The service quota is 20,000/hour and the current p99 read is 140ms, so the added volume stays inside both budgets.',
      evidence: [
        { id: 'metric_ledger_lag', type: 'metric', label: 'Ledger quota 20,000/hour', detail: 'Projected peak 3,300/hour' },
      ],
    },
  },
  { t: 35800, type: 'stage.completed', stage: 'approval', status: 'completed' },

  // ── 11. Pull request ─────────────────────────────────────────────────────
  { t: 36000, type: 'stage.entered', stage: 'pull_request', workMode: 'remediate' },
  {
    t: 36600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'pull_request',
      workMode: 'remediate',
      kind: 'result',
      status: 'success',
      text: 'Pull request acme/support-platform#4821 opened by R. Kachroo after approval. The agent never held merge or deploy permission.',
      artifacts: [{ label: 'PR #4821', ref: 'https://github.com/acme/support-platform/pull/4821' }],
    },
  },
  { t: 37400, type: 'stage.completed', stage: 'pull_request', status: 'completed' },

  // ── 12. Production verification ──────────────────────────────────────────
  { t: 37600, type: 'stage.entered', stage: 'verify_prod', workMode: 'verify_production' },
  {
    t: 38200,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'verify_prod',
      workMode: 'verify_production',
      kind: 'action',
      text: 'Compare the two hours after dep_501 against the pre-fix baseline',
      tool: 'verification.compare',
      command: 'baseline 17:30–19:30 (1,240 runs) vs observed 19:30–21:30 (1,510 runs)',
      scope: 'Read production telemetry',
    },
  },
  {
    t: 39600,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'verify_prod',
      workMode: 'verify_production',
      kind: 'result',
      status: 'success',
      text: 'Correctness failure rate fell from 12.4% to 0.6% and satisfaction rose from 71.2% to 93.4% across 1,510 runs. Latency and cost moved within guardrails. Verdict: resolved, confidence 0.96.',
      artifacts: [{ label: 'Verification ver_55', ref: '#verification' }],
    },
  },
  { t: 40600, type: 'stage.completed', stage: 'verify_prod', status: 'completed' },

  // ── 13. Write memory ─────────────────────────────────────────────────────
  { t: 40800, type: 'stage.entered', stage: 'memorize', workMode: 'verify_production' },
  {
    t: 41400,
    type: 'block',
    block: {
      blockId: id(),
      stage: 'memorize',
      workMode: 'verify_production',
      kind: 'result',
      status: 'success',
      text: 'Wrote mem_77 as a verified outcome, linked to mem_12. The next investigation that fingerprints a stale cached tool result retrieves this fix before reading any code.',
      artifacts: [{ label: 'mem_77 — verified', ref: '/memory/mem_77' }],
    },
  },
  { t: 42200, type: 'stage.completed', stage: 'memorize', status: 'completed' },
  { t: 42600, type: 'investigation.completed', status: 'completed' },
]

export const INVESTIGATION_DURATION =
  INVESTIGATION_EVENTS[INVESTIGATION_EVENTS.length - 1].t
