'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Professional Disclaimer Banner
 * Displayed on computation output pages, document generators, and export flows.
 * Ensures users are aware that all outputs require independent professional verification.
 */
export function ProfessionalDisclaimer({ variant = 'banner' }: { variant?: 'banner' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
        <span>
          Computation output — must be verified by a licensed surveyor per Survey Act Cap 299 before legal or registration use.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <p className="font-semibold text-amber-300">Professional Verification Required</p>
        <p className="mt-1 text-amber-200/80 leading-relaxed">
          METARDU is a computation tool, not a substitute for professional surveyor judgment. All outputs — including
          coordinates, areas, deed plans, mutation forms, and reports — must be independently verified by a licensed
          surveyor registered with ISK/EBK before being relied upon for any legal, construction, boundary determination,
          or registration purpose. No output from this platform constitutes a certified survey under the Survey Act Cap 299
          unless separately certified by a licensed surveyor and authenticated by the Survey of Kenya.
        </p>
      </div>
    </div>
  )
}
