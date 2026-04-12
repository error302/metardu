'use client'

import { X, Crown, Lock } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export interface UpgradeModalProps {
  feature?: string
  description?: string
  onClose: () => void
  isOpen?: boolean
  currentPlan?: string
}

export function useUpgradeCheck() {
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState('')

  const checkPro = (featureName: string, isProFeature: boolean, userTier: string): boolean => {
    if (isProFeature && userTier !== 'pro' && userTier !== 'team' && userTier !== 'firm' && userTier !== 'enterprise') {
      setUpgradeFeature(featureName)
      setShowUpgrade(true)
      return true
    }
    return false
  }

  return { showUpgrade, upgradeFeature, checkPro, setShowUpgrade }
}

export default function UpgradeModal({ feature = 'Unlock Pro Features', description, onClose, isOpen = true, currentPlan }: UpgradeModalProps) {
  if (isOpen === false) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-full max-w-md shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-[var(--accent)]" />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Pro Feature</span>
          </div>

          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            {feature}
          </h2>

          {description && (
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {description}
            </p>
          )}

          <div className="mb-6">
            <span className="text-3xl font-bold text-[var(--accent)]">
              KES 4,999
            </span>
            <span className="text-sm text-[var(--text-muted)]">/month</span>
          </div>

          <Link
            href="/pricing"
            className="w-full px-4 py-3 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg transition-colors text-center"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  )
}
