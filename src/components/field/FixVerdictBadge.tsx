'use client';

/**
 * FixVerdictBadge — say out loud whether the current fix is good enough.
 *
 * Shown above the capture button so the surveyor sees the verdict before the
 * point is stored, not weeks later in the office. Colours carry the meaning:
 * green = cadastral grade, amber = usable with care, red = do not use for
 * boundary work.
 */

import type { FixAssessment } from '@/lib/field/fixVerdict'

interface FixVerdictBadgeProps {
  assessment: FixAssessment
  sunlightMode?: boolean
}

export function FixVerdictBadge({ assessment, sunlightMode = false }: FixVerdictBadgeProps) {
  const tone = assessment.cadastralGrade
    ? { border: 'rgba(34,197,94,0.55)', bg: 'rgba(34,197,94,0.12)', ink: '#22c55e' }
    : assessment.usable
      ? { border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.12)', ink: '#f59e0b' }
      : { border: 'rgba(239,68,68,0.55)', bg: 'rgba(239,68,68,0.12)', ink: '#ef4444' }

  const grade = assessment.cadastralGrade
    ? 'Survey grade'
    : assessment.usable
      ? 'Topographic only'
      : 'Not usable'

  // Only the two things that block survey grade — a list of five is noise on site.
  const reasons = assessment.reasons.slice(0, 2)

  return (
    <div
      role="status"
      aria-label={`Fix quality: ${assessment.label}, ${grade}`}
      className="mb-3 w-full max-w-md rounded-lg border px-3 py-2"
      style={{
        borderColor: tone.border,
        backgroundColor: sunlightMode ? '#FFFFFF' : tone.bg,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold" style={{ color: sunlightMode ? '#000000' : tone.ink }}>
          {assessment.label}
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: tone.border, color: sunlightMode ? '#000000' : tone.ink }}
        >
          {grade}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{assessment.detail}</p>
      {reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {reasons.map(reason => (
            <li key={reason} className="text-xs text-[var(--text-secondary)]">• {reason}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FixVerdictBadge
