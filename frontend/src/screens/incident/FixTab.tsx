import { useState } from 'react'
import {
  Beaker,
  CircleCheck,
  CircleAlert,
  FileCode,
  FlaskConical,
  GitPullRequest,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'
import { FAILING_TEST_RUN, REMEDIATION, TEST_RUNS } from '../../mock/dataset'
import { Panel, Button, SectionLabel, ExternalLinkPill } from '../../components/ui/Primitives'
import { Badge } from '../../components/ui/Badge'
import { formatTime } from '../../lib/format'
import type { DiffFile } from '../../types/domain'

export function FixTab() {
  const [selected, setSelected] = useState(REMEDIATION.files[0].path)
  const file = REMEDIATION.files.find((f) => f.path === selected) ?? REMEDIATION.files[0]
  const approvals = REMEDIATION.approval

  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Reproduction" hint="A fix is not proposed until the failure is reproduced">
          <div className="p-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <Badge tone="good" icon={CircleCheck} size="sm">
                Reproduced
              </Badge>
              <span className="text-[11px] text-(--color-ink-3)">
                {REMEDIATION.reproduction.note}
              </span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {REMEDIATION.reproduction.steps.map((s, i) => (
                <li key={s} className="flex gap-2 text-[12px]">
                  <span className="tabular w-4 shrink-0 text-right font-mono text-[11px] text-(--color-ink-3)">
                    {i + 1}
                  </span>
                  <span className="text-(--color-ink-1)">{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-3 rounded-md border border-(--color-critical)/30 bg-(--color-critical-soft) p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-(--color-critical)">
                <FlaskConical className="size-3" />
                Regression test fails at the base commit
              </div>
              <pre className="overflow-x-auto font-mono text-[10px] leading-relaxed text-(--color-ink-2)">
                {FAILING_TEST_RUN.output.join('\n')}
              </pre>
              <p className="mt-1.5 text-[10px] text-(--color-ink-3)">
                Confirming the test fails before the patch is what makes it a regression test
                rather than an assertion written to match the fix.
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Proposed change"
          hint={`${REMEDIATION.branch} · base ${REMEDIATION.baseSha}`}
          action={
            <span className="tabular font-mono text-[11px]">
              <span className="text-(--color-good)">
                +{REMEDIATION.files.reduce((n, f) => n + f.additions, 0)}
              </span>{' '}
              <span className="text-(--color-critical)">
                −{REMEDIATION.files.reduce((n, f) => n + f.deletions, 0)}
              </span>
            </span>
          }
        >
          <div className="grid grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
            {/* File tree */}
            <div className="border-r border-(--color-line) py-1.5">
              {REMEDIATION.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelected(f.path)}
                  className={`flex w-full cursor-pointer items-start gap-2 px-3 py-1.5 text-left transition-colors ${
                    f.path === selected ? 'bg-(--color-accent-soft)' : 'hover:bg-white/4'
                  }`}
                >
                  <FileCode
                    className="mt-0.5 size-3 shrink-0"
                    style={{
                      color:
                        f.kind === 'test' ? 'var(--color-good)' : 'var(--color-ink-3)',
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px]">
                      {f.path.split('/').pop()}
                    </span>
                    <span className="block truncate text-[10px] text-(--color-ink-3)">
                      {f.path.split('/').slice(0, -1).join('/')}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-mono text-[10px]">
                    <span className="text-(--color-good)">+{f.additions}</span>
                    <span className="ml-1 text-(--color-critical)">−{f.deletions}</span>
                  </span>
                </button>
              ))}
            </div>

            <DiffView file={file} />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Approval" hint="Nothing leaves the sandbox without a human decision">
          <div className="p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="warning" icon={UserCheck} size="sm">
                {approvals.approvers.filter((a) => a.decision === 'approved').length} of{' '}
                {approvals.requiredApprovers} approvals
              </Badge>
              <span className="text-[11px] text-(--color-ink-3)">High severity requires 2</span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {approvals.approvers.map((a) => (
                <li
                  key={a.name}
                  className="flex items-center gap-2 rounded-md border border-(--color-line) px-2.5 py-2"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/6 text-[10px] font-semibold">
                    {a.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px]">{a.name}</span>
                  {a.decision === 'approved' ? (
                    <Badge tone="good" icon={CircleCheck} size="sm">
                      Approved {a.decidedAt ? formatTime(a.decidedAt) : ''}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon={CircleAlert} size="sm">
                      Pending
                    </Badge>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button variant="primary" icon={GitPullRequest}>
                Approve and open PR
              </Button>
              <Button variant="secondary">Request changes</Button>
            </div>

            {REMEDIATION.pullRequest && (
              <div className="mt-3 flex items-center gap-2 border-t border-(--color-line) pt-3">
                <span className="text-[11px] text-(--color-ink-3)">Pull request</span>
                <ExternalLinkPill href={REMEDIATION.pullRequest.url}>
                  #{REMEDIATION.pullRequest.number} · {REMEDIATION.pullRequest.status}
                </ExternalLinkPill>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Risk analysis">
          <ul className="divide-y divide-(--color-line)">
            {REMEDIATION.risk.map((r) => (
              <li key={r.label} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <ShieldAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{
                    color:
                      r.level === 'high'
                        ? 'var(--color-critical)'
                        : r.level === 'medium'
                          ? 'var(--color-warning)'
                          : 'var(--color-ink-3)',
                  }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{r.label}</span>
                    <span
                      className="rounded px-1 py-px text-[9px] font-semibold tracking-wide uppercase"
                      style={{
                        color:
                          r.level === 'medium' ? 'var(--color-warning)' : 'var(--color-ink-3)',
                        background:
                          r.level === 'medium' ? 'var(--color-warning-soft)' : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {r.level}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-(--color-ink-3)">{r.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Test matrix" hint="Development verification — necessary, not sufficient">
          <table className="w-full text-[12px]">
            <tbody>
              {TEST_RUNS.map((t) => (
                <tr key={t.testRunId} className="border-b border-(--color-line) last:border-0">
                  <td className="py-2 pl-3.5">
                    <div className="font-medium">{t.suite}</div>
                    <code className="font-mono text-[10px] text-(--color-ink-3)">{t.command}</code>
                  </td>
                  <td className="tabular py-2 text-right text-[11px] text-(--color-ink-2)">
                    {t.passed} passed
                    {t.failed > 0 && (
                      <span className="text-(--color-critical)"> · {t.failed} failed</span>
                    )}
                    {t.skipped > 0 && (
                      <span className="text-(--color-ink-3)"> · {t.skipped} skipped</span>
                    )}
                  </td>
                  <td className="py-2 pr-3.5 pl-2 text-right">
                    <Badge
                      tone={t.status === 'passed' ? 'good' : 'critical'}
                      icon={t.status === 'passed' ? CircleCheck : CircleAlert}
                      size="sm"
                    >
                      {t.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-(--color-line) px-3.5 py-2">
            <SectionLabel>Sandbox</SectionLabel>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-(--color-ink-3)">
              <Beaker className="size-3" />
              Network disabled · allowlisted commands · no production credentials
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function DiffView({ file }: { file: DiffFile }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      {file.hunks.map((h) => (
        <div key={h.header}>
          <div className="bg-(--color-surface-2) px-3 py-1 font-mono text-[10px] text-(--color-ink-3)">
            {h.header}
          </div>
          <pre className="font-mono text-[11px] leading-[1.65]">
            {h.lines.map((l, i) => (
              <div
                key={i}
                className="px-3"
                style={{
                  background:
                    l.kind === 'add'
                      ? 'rgba(12,163,12,0.10)'
                      : l.kind === 'del'
                        ? 'rgba(208,59,59,0.10)'
                        : undefined,
                  color:
                    l.kind === 'add'
                      ? 'var(--color-ink-1)'
                      : l.kind === 'del'
                        ? 'var(--color-ink-2)'
                        : 'var(--color-ink-3)',
                }}
              >
                <span
                  className="mr-2 inline-block w-2 select-none"
                  style={{
                    color:
                      l.kind === 'add'
                        ? 'var(--color-good)'
                        : l.kind === 'del'
                          ? 'var(--color-critical)'
                          : 'transparent',
                  }}
                >
                  {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                </span>
                {l.text || ' '}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  )
}
