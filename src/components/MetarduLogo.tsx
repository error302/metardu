'use client'

import Link from 'next/link'

interface MetarduLogoProps {
  color?: string
  size?: number
  showWordmark?: boolean
}

export default function MetarduLogo({
  color = 'currentColor',
  size = 32,
  showWordmark = true,
}: MetarduLogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <img
        src="/metardu-logo.jpg"
        alt="METARDU"
        width={size}
        height={size}
        className="rounded-md"
        style={{ width: size, height: size, objectFit: 'cover' }}
      />

      {showWordmark && (
        <span
          style={{
            fontSize: '15px',
            fontWeight: 500,
            letterSpacing: '0.15em',
            color: color === 'currentColor' ? 'inherit' : color,
          }}
        >
          METARDU
        </span>
      )}
    </div>
  )
}
