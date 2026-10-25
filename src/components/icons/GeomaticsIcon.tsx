import type { SVGProps } from 'react'

export type GeomaticsSymbol = 'control-point' | 'parcel' | 'traverse' | 'total-station' | 'gnss-rover' | 'level' | 'terrain'

/** Interface symbols only; these do not replace prescribed survey-plan notation. */
export default function GeomaticsIcon({ symbol, ...props }: SVGProps<SVGSVGElement> & { symbol: GeomaticsSymbol }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    {symbol === 'control-point' && <><path d="m12 3 9 16H3Z" /><circle cx="12" cy="13" r="2" /><path d="M12 10v6M9 13h6" /></>}
    {symbol === 'parcel' && <><path d="m4 5 13-2 4 13-12 5-5-5Z" /><path d="m4 16 13-13M10 9l11 7" /><circle cx="4" cy="5" r="1.5" /><circle cx="17" cy="3" r="1.5" /><circle cx="21" cy="16" r="1.5" /><circle cx="9" cy="21" r="1.5" /><circle cx="4" cy="16" r="1.5" /></>}
    {symbol === 'traverse' && <><path d="m3 17 7-11 11 4-4 10" /><circle cx="3" cy="17" r="1.5" /><circle cx="10" cy="6" r="1.5" /><circle cx="21" cy="10" r="1.5" /><circle cx="17" cy="20" r="1.5" /><path d="M8 10a5 5 0 0 0 6-2" /></>}
    {symbol === 'total-station' && <><rect x="6" y="4" width="12" height="7" rx="1.5" /><circle cx="12" cy="7.5" r="2" /><path d="M5 13h14M12 11v2M9 13 5 22M15 13l4 9M12 13v8M18 7h3" /></>}
    {symbol === 'gnss-rover' && <><ellipse cx="12" cy="5" rx="6" ry="2.5" /><path d="M12 8v12M9 22l3-2 3 2M3 2l2 1M21 2l-2 1M4 8l2-1M20 8l-2-1" /></>}
    {symbol === 'level' && <><path d="M3 7h12v5H3Z M9 12v2M5 14h8M7 14l-3 8M11 14l3 8M9 14v7M19 2v20M19 5h3M19 9h2M19 13h3M19 17h2M19 21h3" /><circle cx="12" cy="9.5" r="1" /></>}
    {symbol === 'terrain' && <><path d="M2 18c3-8 7 4 11-4s6-8 9-7M2 12c4-7 7 5 11-3s6-7 9-6M2 23c4-8 8 4 12-4s5-7 8-7" /><path d="M14 5h4M16 3v4" /></>}
  </svg>
}
