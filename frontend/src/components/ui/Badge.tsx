import {
  BadgeCheck,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  Clock,
  Eye,
  Info,
  Microscope,
  OctagonAlert,
  Pause,
  Rocket,
  TriangleAlert,
  UserCheck,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  AutonomyMode,
  EvaluatorType,
  IncidentStatus,
  Severity,
} from '../../types/domain'

export type Tone = 'neutral' | 'accent' | 'ai' | 'good' | 'warning' | 'serious' | 'critical'

const TONE_STYLE: Record<Tone, { fg: string; bg: string; bd: string }> = {
  neutral: { fg: 'var(--color-ink-2)', bg: 'rgba(255,255,255,0.05)', bd: 'var(--color-line)' },
  accent: { fg: 'var(--color-accent)', bg: 'var(--color-accent-soft)', bd: 'rgba(76,141,246,0.35)' },
  ai: { fg: 'var(--color-ai)', bg: 'var(--color-ai-soft)', bd: 'rgba(144,133,233,0.35)' },
  good: { fg: 'var(--color-good)', bg: 'var(--color-good-soft)', bd: 'rgba(12,163,12,0.35)' },
  warning: { fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)', bd: 'rgba(250,178,25,0.35)' },
  serious: { fg: 'var(--color-serious)', bg: 'var(--color-serious-soft)', bd: 'rgba(236,131,90,0.35)' },
  critical: { fg: 'var(--color-critical)', bg: 'var(--color-critical-soft)', bd: 'rgba(208,59,59,0.4)' },
}

/**
 * Base badge. `icon` is required by design: §17 mandates that status never
 * relies on colour alone, so there is no way to render a bare coloured pill.
 */
export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  size = 'md',
  title,
}: {
  tone?: Tone
  icon: LucideIcon
  children: React.ReactNode
  size?: 'sm' | 'md'
  title?: string
}) {
  const s = TONE_STYLE[tone]
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium whitespace-nowrap ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
      }`}
      style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.2} />
      {children}
    </span>
  )
}

// ─── Severity ──────────────────────────────────────────────────────────────

const SEVERITY: Record<Severity, { tone: Tone; icon: LucideIcon; label: string }> = {
  critical: { tone: 'critical', icon: OctagonAlert, label: 'Critical' },
  high: { tone: 'critical', icon: TriangleAlert, label: 'High' },
  medium: { tone: 'serious', icon: CircleAlert, label: 'Medium' },
  low: { tone: 'warning', icon: Info, label: 'Low' },
}

export function SeverityBadge({ severity, size }: { severity: Severity; size?: 'sm' | 'md' }) {
  const s = SEVERITY[severity]
  return (
    <Badge tone={s.tone} icon={s.icon} size={size}>
      {s.label}
    </Badge>
  )
}

// ─── Incident status ───────────────────────────────────────────────────────

const STATUS: Record<IncidentStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  detected: { tone: 'warning', icon: CircleDashed, label: 'Detected' },
  triaging: { tone: 'warning', icon: CircleDashed, label: 'Triaging' },
  monitoring: { tone: 'neutral', icon: Eye, label: 'Monitoring' },
  open: { tone: 'critical', icon: CircleAlert, label: 'Open' },
  investigating: { tone: 'ai', icon: Microscope, label: 'Investigating' },
  needs_input: { tone: 'warning', icon: Clock, label: 'Needs input' },
  reproduced: { tone: 'ai', icon: CircleCheck, label: 'Reproduced' },
  unreproduced: { tone: 'warning', icon: CircleSlash, label: 'Not reproduced' },
  fix_proposed: { tone: 'ai', icon: Wrench, label: 'Fix proposed' },
  testing: { tone: 'ai', icon: Clock, label: 'Testing' },
  awaiting_approval: { tone: 'warning', icon: UserCheck, label: 'Awaiting approval' },
  pr_created: { tone: 'accent', icon: Rocket, label: 'PR created' },
  deployed: { tone: 'accent', icon: Rocket, label: 'Deployed' },
  verifying: { tone: 'accent', icon: Clock, label: 'Verifying' },
  resolved: { tone: 'good', icon: CircleCheck, label: 'Resolved' },
  inconclusive: { tone: 'warning', icon: CircleHelp, label: 'Inconclusive' },
  regressed: { tone: 'critical', icon: TriangleAlert, label: 'Regressed' },
  dismissed: { tone: 'neutral', icon: CircleSlash, label: 'Dismissed' },
}

export function StatusBadge({ status, size }: { status: IncidentStatus; size?: 'sm' | 'md' }) {
  const s = STATUS[status] ?? STATUS.open
  return (
    <Badge tone={s.tone} icon={s.icon} size={size}>
      {s.label}
    </Badge>
  )
}

// ─── Confidence ────────────────────────────────────────────────────────────

/**
 * Confidence is never shown as a bare colour. It always carries the number, so
 * a reader can judge it rather than trusting a hue (§15.6).
 */
export function ConfidenceBadge({
  confidence,
  size,
}: {
  confidence: number
  size?: 'sm' | 'md'
}) {
  const tone: Tone = confidence >= 0.75 ? 'good' : confidence >= 0.4 ? 'warning' : 'neutral'
  const label = confidence >= 0.75 ? 'High' : confidence >= 0.4 ? 'Medium' : 'Low'
  return (
    <Badge tone={tone} icon={Info} size={size} title={`Confidence ${confidence.toFixed(2)}`}>
      {label} confidence · {confidence.toFixed(2)}
    </Badge>
  )
}

export function VerifiedBadge({ verified, size }: { verified: boolean; size?: 'sm' | 'md' }) {
  return verified ? (
    <Badge tone="good" icon={BadgeCheck} size={size} title="Outcome verified in production">
      Verified
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CircleDashed} size={size} title="No production verification yet">
      Unverified
    </Badge>
  )
}

// ─── Autonomy mode ─────────────────────────────────────────────────────────

const AUTONOMY: Record<AutonomyMode, { label: string; icon: LucideIcon }> = {
  monitor: { label: 'Monitor', icon: Eye },
  advisor: { label: 'Advisor', icon: Info },
  investigator: { label: 'Investigator', icon: Microscope },
  fixer: { label: 'Fixer', icon: Wrench },
  guarded_autopilot: { label: 'Guarded Autopilot', icon: Bot },
}

export function AutonomyBadge({ mode, size }: { mode: AutonomyMode; size?: 'sm' | 'md' }) {
  const m = AUTONOMY[mode]
  return (
    <Badge tone="ai" icon={m.icon} size={size} title="Autonomy mode — what the agent is permitted to do">
      {m.label}
    </Badge>
  )
}

// ─── Evaluator provenance ──────────────────────────────────────────────────

const EVALUATOR: Record<EvaluatorType, { label: string; tone: Tone }> = {
  deterministic: { label: 'Deterministic', tone: 'accent' },
  application: { label: 'Application', tone: 'accent' },
  user_explicit: { label: 'User feedback', tone: 'serious' },
  user_implicit: { label: 'User behaviour', tone: 'serious' },
  human_reviewer: { label: 'Human review', tone: 'good' },
  model_judge: { label: 'Model judge', tone: 'ai' },
  statistical: { label: 'Statistical', tone: 'neutral' },
}

export function EvaluatorBadge({ type, size }: { type: EvaluatorType; size?: 'sm' | 'md' }) {
  const e = EVALUATOR[type]
  const icon = type === 'model_judge' ? Bot : type.startsWith('user') ? UserCheck : CircleCheck
  return (
    <Badge tone={e.tone} icon={icon} size={size}>
      {e.label}
    </Badge>
  )
}

export function PassBadge({ pass, size }: { pass: boolean | null; size?: 'sm' | 'md' }) {
  if (pass === null)
    return (
      <Badge tone="neutral" icon={CircleDashed} size={size}>
        Unknown
      </Badge>
    )
  return pass ? (
    <Badge tone="good" icon={CircleCheck} size={size}>
      Pass
    </Badge>
  ) : (
    <Badge tone="critical" icon={CircleAlert} size={size}>
      Fail
    </Badge>
  )
}

export function PausedBadge() {
  return (
    <Badge tone="warning" icon={Pause}>
      Paused
    </Badge>
  )
}
