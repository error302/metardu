'use client'

import AppErrorBoundary from '@/components/shared/AppErrorBoundary'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <AppErrorBoundary error={error} reset={reset} context="Admin panel error" />
}
