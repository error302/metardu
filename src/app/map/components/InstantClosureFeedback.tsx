'use client'

/**
 * InstantClosureFeedback — Live traverse closure feedback for the METARDU Map Compute panel.
 *
 * Automatically monitors vertexEditingVertices from MapReactContext and evaluates
 * traverse misclosure against Kenya Survey Regulations 1994 cadastral standards (1:5000).
 */

import React, { memo, useMemo } from 'react'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import {
  evaluateInstantClosure,
  type ClosureGrade,
} from '@/lib/surveyMapEngine/ol/qaOverlays'

/**
 * Grade → color chips. The grade thresholds and misclosure math live in the
 * survey map engine (`ol/qaOverlays.evaluateInstantClosure`); this component
 * only renders style variants.
 */
const GRADE_COLORS: Record<ClosureGrade, string> = {
  Excellent: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Good: 'bg-green-500/15 text-green-400 border border-green-500/30',
  Acceptable: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  Poor: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  Fail: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
}

export const InstantClosureFeedback = memo(function InstantClosureFeedback() {
  const { vertexEditingVertices } = useMapContext()

  const closureData = useMemo(() => {
    return evaluateInstantClosure(vertexEditingVertices || [])
  }, [vertexEditingVertices])

  if (!closureData) {
    return null
  }

  const {
    sumDeltaE,
    sumDeltaN,
    linearMisclosure,
    perimeter,
    precisionRatio,
    passes,
    minimum,
    grade,
  } = closureData

  const Icon = passes ? ShieldCheck : ShieldAlert
  const iconColor = passes ? 'text-emerald-400' : 'text-rose-400'
  const precisionDisplay = Number.isFinite(precisionRatio)
    ? Math.round(precisionRatio).toLocaleString()
    : '∞'

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-secondary)_80%,transparent)] p-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          Closure Check
        </span>
        <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${GRADE_COLORS[grade]}`}>
          {grade}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <span className="text-[var(--text-muted)]">Linear Error</span>
          <div className="font-mono text-[var(--text-secondary)]">{linearMisclosure.toFixed(4)} m</div>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Precision</span>
          <div className="font-mono text-[var(--text-secondary)]">1:{precisionDisplay}</div>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Perimeter</span>
          <div className="font-mono text-[var(--text-secondary)]">{perimeter.toFixed(3)} m</div>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Standard</span>
          <div className="font-mono text-[var(--text-secondary)]">1:{minimum.toLocaleString()} (Cadastral)</div>
        </div>
      </div>

      {/* Residuals row */}
      <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)] font-mono border-t border-[var(--border-color)] pt-1.5">
        <span>ΣΔE: {sumDeltaE >= 0 ? '+' : ''}{sumDeltaE.toFixed(4)}</span>
        <span>ΣΔN: {sumDeltaN >= 0 ? '+' : ''}{sumDeltaN.toFixed(4)}</span>
      </div>
    </div>
  )
})
