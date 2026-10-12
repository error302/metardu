import Image from 'next/image'

interface MetarduLogoProps {
  color?: string
  size?: number
  showWordmark?: boolean
  className?: string
}

/**
 * METARDU Logo Component
 *
 * Uses the square brandmark cropped from the master artwork in
 * public/metardu-logo.jpg. Keep this component as the shared logo source
 * for navigation, authentication, loading, and workspace chrome.
 *
 * The wordmark text color is controlled by the `color` prop.
 */
export default function MetarduLogo({
  color = 'currentColor',
  size = 32,
  showWordmark = true,
  className = '',
}: MetarduLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`} role="img" aria-label="METARDU">
      {/* Canonical METARDU brandmark */}
      <Image
        src="/metardu-icon.png"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded"
        priority
      />

      {showWordmark && (
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: `${size * 0.47}px`,
            letterSpacing: '0.05em',
            color: color === 'currentColor' ? 'inherit' : color,
          }}
          aria-hidden="true"
        >
          METARDU
        </span>
      )}
    </div>
  )
}
