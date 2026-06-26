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
export default function OnboardingWrapper() {
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

  return <OnboardingChecklist />
}
