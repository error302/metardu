import MetarduLogo from '@/components/MetarduLogo'

/** A single, brand-led loading view shared by app and route boundaries. */
export function LoadingState({
  message = 'Opening your workspace',
  subMessage,
  progress,
}: {
  message?: string
  subMessage?: string
  progress?: number | null
}) {
  const value = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress))
    : null
  const statusText = [message, subMessage].filter(Boolean).join('. ')

  return (
    <div className="metardu-loading-screen" aria-busy="true">
      <div className="metardu-loading-brand" role="status" aria-live="polite" aria-label={statusText}>
        <MetarduLogo size={64} showWordmark color="var(--text-primary)" />
      </div>
      <span className="sr-only">{statusText}</span>
      {value !== null && (
        <span
          className="sr-only"
          role="progressbar"
          aria-label={message}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          {Math.round(value)}%
        </span>
      )}
    </div>
  )
}

/**
 * Route-level loading: fills the viewport below the app bar so the brand
 * screen never renders as a small floating box. Route boundaries should
 * use this instead of a bare <LoadingState />.
 */
export function FullPageLoading({ message }: { message?: string }) {
  return (
    <div className="h-[calc(100dvh-4rem)] min-h-[24rem] w-full">
      <LoadingState message={message} />
    </div>
  )
}
