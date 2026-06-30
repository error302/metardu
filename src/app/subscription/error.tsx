'use client'

import AppErrorBoundary from '@/components/shared/AppErrorBoundary'

export default function SubscriptionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <AppErrorBoundary error={error} reset={reset} context="Subscription management error" />
}
