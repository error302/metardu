import Link from 'next/link'

interface MetarduLogoProps {
  color?: string
  size?: number
  showWordmark?: boolean
  className?: string
}

/**
 * METARDU Logo Component
 *
 * Uses the official SVG logo (inline for performance — no image loading).
 * The logo is a stylized "M" inside a rounded square with a breathing animation.
 *
 * Official colors (from public/logo.svg):
 * - Background: #2D2D2D (dark gray, NOT accent orange)
 * - M letter: #FFFFFF (white)
 * - Border: white stroke
 *
 * The wordmark uses white for "M" and inherited color for "ETARDU".
 */
export default function MetarduLogo({
  color = 'currentColor',
  size = 32,
  showWordmark = true,
  className = '',
}: MetarduLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Official SVG Logo — inline for zero-load rendering */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 30 30"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-label="METARDU logo"
      >
        {/* Rounded square background — official #2D2D2D */}
        <path
          d="M24.51,28.51H5.49c-2.21,0-4-1.79-4-4V5.49c0-2.21,1.79-4,4-4h19.03c2.21,0,4,1.79,4,4v19.03 C28.51,26.72,26.72,28.51,24.51,28.51z"
          fill="#2D2D2D"
          stroke="#FFFFFF"
          strokeWidth="0.6317"
          strokeMiterlimit="10"
        />
        {/* M letter with breathing animation — official white */}
        <g style={{ animation: 'metardu-breathe 2.5s ease-in-out infinite' }}>
          <path d="M15.47,7.1l-1.3,1.85c-0.2,0.29-0.54,0.47-0.9,0.47h-7.1V7.09C6.16,7.1,15.47,7.1,15.47,7.1z" fill="#FFFFFF" />
          <polygon points="24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1" fill="#FFFFFF" />
          <path d="M14.53,22.91l1.31-1.86c0.2-0.29,0.54-0.47,0.9-0.47h7.09v2.33H14.53z" fill="#FFFFFF" />
        </g>
      </svg>

      {showWordmark && (
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: `${size * 0.47}px`,
            letterSpacing: '0.05em',
            color: color === 'currentColor' ? 'inherit' : color,
          }}
        >
          METARDU
        </span>
      )}
    </div>
  )
}
