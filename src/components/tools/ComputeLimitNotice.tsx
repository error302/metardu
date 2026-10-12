'use client'

// ComputeLimitNotice — reusable banner explaining that a web tool is
// resource-constrained. State actual limits without claiming an unverified
// unlimited desktop runtime, offline coverage or data-delivery behavior.

import { MonitorDown, X } from 'lucide-react'
import { useState } from 'react'

export interface ComputeLimitNoticeProps {
  /** Maximum number of points the web tool accepts. */
  maxPoints?: number
  /** Which tool is being limited, e.g. "point cloud import". */
  tool?: string
  /** Optional context line shown under the headline. */
  message?: string
}

export function ComputeLimitNotice({
  maxPoints,
  tool = 'this tool',
  message,
}: ComputeLimitNoticeProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="relative rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/5 via-cyan-500/5 to-indigo-500/5 p-4 mb-6">
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss compute limit notice"
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shrink-0">
          <MonitorDown className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            Large dataset limits
            {maxPoints && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border border-sky-500/30 bg-sky-500/10 text-sky-400">
                Limit {maxPoints.toLocaleString()} pts
              </span>
            )}
          </h4>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1">
            {message ??
              `${tool} uses device and server resources.${maxPoints ? ` This workflow accepts up to ${maxPoints.toLocaleString()} points.` : ''} Review the data size and the tool's stated limits before starting a large job.`}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-2">
            Check the resulting surface and exported records before relying on them for field or construction work.
          </p>
        </div>
      </div>
    </div>
  )
}
