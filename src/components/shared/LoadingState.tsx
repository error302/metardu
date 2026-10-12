import type { CSSProperties } from 'react'
import MetarduLogo from '@/components/MetarduLogo'

const ASCII_CHARS = ' .:-=+/*\\01xX'
const ASCII_ROWS = Array.from({ length: 18 }, (_, row) => ({
  id: row,
  text: Array.from({ length: 78 }, (_, column) =>
    ASCII_CHARS[(row * 11 + column * 7 + row * column) % ASCII_CHARS.length]
  ).join(''),
}))

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
      <div className="metardu-loading-ascii" aria-hidden="true">
        {ASCII_ROWS.map((row) => (
          <span
            key={row.id}
            className="metardu-loading-ascii-row"
            style={{ '--wave-delay': `${row.id * -190}ms` } as CSSProperties}
          >
            {row.text}
          </span>
        ))}
      </div>
      <div className="metardu-loading-scrim" aria-hidden="true" />
      <div className="metardu-loading-brand" role="status" aria-live="polite" aria-label={statusText}>
        <MetarduLogo size={62} showWordmark color="var(--text-primary)" />
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
