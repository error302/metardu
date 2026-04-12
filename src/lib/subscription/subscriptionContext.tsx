'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PlanId } from '@/lib/subscription/catalog'

interface SubscriptionContextType {
  plan: PlanId
  isTrialing: boolean
  trialDaysLeft: number
  canCreateProject: boolean
  canAddPoints: boolean
  hasFeature: (feature: string) => boolean
  projectCount: number
  loading: boolean
  refresh: () => void
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  plan: 'free',
  isTrialing: false,
  trialDaysLeft: 0,
  canCreateProject: true,
  canAddPoints: true,
  hasFeature: () => false,
  projectCount: 0,
  loading: true,
  refresh: () => {},
})

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [plan, setPlan] = useState<PlanId>('free')
  const [isTrialing, setIsTrialing] = useState(false)
  const [trialDaysLeft, setTrialDaysLeft] = useState(0)
  const [features, setFeatures] = useState<string[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const resetState = useCallback(() => {
    setPlan('free')
    setIsTrialing(false)
    setTrialDaysLeft(0)
    setFeatures([])
    setProjectCount(0)
  }, [])

  const loadSubscription = useCallback(async () => {
    if (!userId) {
      resetState()
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    resetState()

    if (sub) {
      setPlan(sub.plan_id as PlanId)
      setFeatures(sub.features || [])

      if (sub.status === 'trial') {
        setIsTrialing(true)
        const daysLeft = Math.ceil(
          (new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000
        )
        setTrialDaysLeft(Math.max(0, daysLeft))
      }
    }

    const { count } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    setProjectCount(count || 0)
    setLoading(false)
  }, [resetState, userId])

  useEffect(() => {
    let active = true

    async function loadAuthSession() {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
          credentials: 'same-origin',
        })

        if (!response.ok) {
          throw new Error(`Session request failed with ${response.status}`)
        }

        const session = await response.json()
        if (!active) return

        setUserId((session?.user as { id?: string } | undefined)?.id ?? null)
      } catch {
        if (!active) return
        setUserId(null)
      } finally {
        if (active) {
          setAuthResolved(true)
        }
      }
    }

    loadAuthSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!authResolved) return

    if (!userId) {
      resetState()
      setLoading(false)
      return
    }

    setLoading(true)
    void loadSubscription()
  }, [authResolved, loadSubscription, resetState, userId])

  const canCreateProject = plan !== 'free' || projectCount < 1
  const canAddPoints = true

  function hasFeature(feature: string) {
    if (plan === 'pro' || plan === 'team' || plan === 'firm' || plan === 'enterprise') return true
    return features.includes(feature)
  }

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        isTrialing,
        trialDaysLeft,
        canCreateProject,
        canAddPoints,
        hasFeature,
        projectCount,
        loading,
        refresh: loadSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => useContext(SubscriptionContext)
