'use client'

import { useState, useEffect } from 'react'
import OnboardingChecklist from './OnboardingChecklist'

const DISMISSED_KEY = 'metardu_onboarding_dismissed'

/**
 * OnboardingWrapper — conditionally renders the OnboardingChecklist
 * based on whether the user has previously dismissed it.
 *
 * Checks localStorage for the 'metardu_onboarding_dismissed' key.
 * If present, renders nothing. Otherwise, renders the checklist.
 */
export default function OnboardingWrapper({ compact = false }: { compact?: boolean }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const value = localStorage.getItem(DISMISSED_KEY)
      setDismissed(value === 'true')
    } catch {
      // localStorage unavailable — show by default
      setDismissed(false)
    }
  }, [])

  // Still loading (SSR / initial hydration) — render nothing to avoid flash
  if (dismissed === null) return null

  // User previously dismissed — don't show
  if (dismissed) return null

  if (compact) return <details className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]">
      Getting started <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">Optional setup guide</span>
    </summary>
    <div className="px-3 pb-3"><OnboardingChecklist /></div>
  </details>
  return <OnboardingChecklist />
}
