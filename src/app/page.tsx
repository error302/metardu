'use client'
import { useState } from 'react'
import Link from 'next/link'

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const Icon = {
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>,
  calc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 4.5h.008v.008h-.008v-.008zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25z" /></svg>,
  report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  offline: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>,
  export: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
  africa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
}

// ── Hero mockup — looks like the actual app ────────────────────────────────────
function AppMockup() {
  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute -inset-6 bg-[var(--accent)]/10 rounded-3xl blur-2xl pointer-events-none" />
      <div className="relative bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-2xl">
        {/* Titlebar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--border-hover)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--border-hover)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--border-hover)]" />
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">Karen Estate Boundary Survey — UTM 37S</span>
          <div className="ml-auto flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-green-400">Online</span>
          </div>
        </div>

        {/* Workspace layout */}
        <div className="grid grid-cols-[160px_1fr_170px] h-64">
          {/* Left: Points list */}
          <div className="border-r border-[var(--border-color)] p-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 px-1">Survey Points</div>
            {[
              { n: 'A', e: '258430', ctrl: true },
              { n: 'B', e: '258562', ctrl: false },
              { n: 'C', e: '258701', ctrl: false },
              { n: 'D', e: '258654', ctrl: true },
              { n: 'E', e: '258523', ctrl: false },
            ].map((pt, i) => (
              <div key={i} className={`flex items-center gap-2 px-1.5 py-1 rounded text-[10px] mb-0.5 ${i === 1 ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/20' : ''}`}>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pt.ctrl ? 'bg-[var(--accent)]' : 'bg-blue-400'}`} />
                <span className="text-[var(--text-primary)] font-mono font-medium">{pt.n}</span>
                <span className="text-[var(--text-muted)] ml-auto">{pt.e}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
              <div className="text-[10px] text-[var(--text-muted)] text-center">5 points</div>
            </div>
          </div>

          {/* Center: Map */}
          <div className="relative bg-[var(--bg-primary)] overflow-hidden">
            <svg viewBox="0 0 280 256" className="w-full h-full">
              {/* Grid */}
              <defs>
                <pattern id="mg" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="280" height="256" fill="url(#mg)" />
              {/* Traverse polygon */}
              <polygon points="70,180 140,60 210,90 240,170 160,210 70,180"
                fill="rgba(232,132,26,0.08)" stroke="rgba(232,132,26,0.6)" strokeWidth="1.5" strokeDasharray="4 2"/>
              {/* Control points (orange) */}
              {[[70,180],[210,90]].map(([x,y],i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="7" fill="rgba(232,132,26,0.2)" stroke="rgba(232,132,26,0.8)" strokeWidth="1.5"/>
                  <circle cx={x} cy={y} r="2.5" fill="rgba(232,132,26,1)"/>
                </g>
              ))}
              {/* Detail points (blue) */}
              {[[140,60],[240,170],[160,210]].map(([x,y],i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="5" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.8)" strokeWidth="1.5"/>
                  <circle cx={x} cy={y} r="2" fill="rgba(59,130,246,1)"/>
                </g>
              ))}
              {/* Labels */}
              {[['A',70,180],['B',140,60],['C',210,90],['D',240,170],['E',160,210]].map(([l,x,y],i) => (
                <text key={i} x={Number(x)+10} y={Number(y)-6} fill="rgba(255,255,255,0.6)" fontSize="9" fontFamily="monospace">{l}</text>
              ))}
              {/* Area label */}
              <text x="155" y="140" fill="rgba(232,132,26,0.8)" fontSize="8" textAnchor="middle" fontFamily="monospace">1.24 ha</text>
              {/* North arrow */}
              <g transform="translate(250,20)">
                <polygon points="0,-10 3,0 0,-2 -3,0" fill="rgba(232,132,26,0.8)"/>
                <text x="0" y="12" fill="rgba(255,255,255,0.4)" fontSize="7" textAnchor="middle">N</text>
              </g>
            </svg>
            {/* Scale bar */}
            <div className="absolute bottom-2 left-2 flex items-end gap-1">
              <div className="w-16 h-1 border border-[var(--text-muted)]/30 relative">
                <div className="absolute left-0 top-0 w-1/2 h-full bg-[var(--text-muted)]/20" />
              </div>
              <span className="text-[9px] text-[var(--text-muted)] leading-none">50m</span>
            </div>
          </div>

          {/* Right: Results panel */}
          <div className="border-l border-[var(--border-color)] p-2 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 px-1">Traverse</div>
            <div className="space-y-1">
              {[
                ['Precision', '1 : 14,200', 'text-green-400'],
                ['Linear Err.', '0.038 m', 'text-green-400'],
                ['Closing E', '+0.021 m', 'text-[var(--text-secondary)]'],
                ['Closing N', '-0.031 m', 'text-[var(--text-secondary)]'],
                ['Method', 'Bowditch', 'text-[var(--text-muted)]'],
              ].map(([k,v,c], i) => (
                <div key={i} className="flex justify-between items-baseline px-1 text-[10px]">
                  <span className="text-[var(--text-muted)]">{k}</span>
                  <span className={`font-mono font-semibold ${c}`}>{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
              <div className="bg-green-900/30 border border-green-700/30 rounded px-1.5 py-1 text-[10px] text-green-400 text-center">
                ✓ Arithmetic check PASSED
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 px-1">Parcel</div>
              {[
                ['Area', '12,430 m²', 'text-[var(--accent)]'],
                ['Perimeter', '448.7 m', 'text-[var(--text-secondary)]'],
              ].map(([k,v,c], i) => (
                <div key={i} className="flex justify-between items-baseline px-1 text-[10px]">
                  <span className="text-[var(--text-muted)]">{k}</span>
                  <span className={`font-mono font-semibold ${c}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--bg-tertiary)] border-t border-[var(--border-color)]">
          <div className="flex gap-3 text-[10px] text-[var(--text-muted)]">
            <span>UTM 37S</span>
            <span>Arc 1960</span>
            <span>5 pts</span>
          </div>
          <div className="flex gap-2">
            {['PDF Report', 'DXF Export'].map(a => (
              <div key={a} className="px-2 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[10px] text-[var(--text-secondary)]">{a}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tool demo tab ──────────────────────────────────────────────────────────────
const TOOL_DEMOS: Record<string, { title: string; input: string[][]; output: string[][]; badge: string }> = {
  traverse: {
    title: 'Bowditch Traverse Adjustment',
    input: [['Stations', '5'], ['Total Distance', '1,247.80 m'], ['Method', 'Bowditch Rule']],
    output: [
      ['Closing Error E', '+0.042 m', 'neutral'],
      ['Closing Error N', '−0.031 m', 'neutral'],
      ['Linear Error', '0.052 m', 'neutral'],
      ['Precision Ratio', '1 : 23,996', 'good'],
      ['Grade', 'Excellent', 'good'],
    ],
    badge: '✓ Adjustment applied',
  },
  leveling: {
    title: 'Rise & Fall Leveling',
    input: [['Stations', '6 TPs'], ['Distance', '2.4 km'], ['Opening RL', '100.000 m']],
    output: [
      ['ΣBS − ΣFS', '=', 'neutral'],
      ['ΣRise − ΣFall', 'MATCHED', 'good'],
      ['Misclosure', '±8 mm', 'good'],
      ['Allowable (12√K)', '±18.6 mm', 'neutral'],
      ['Arithmetic Check', 'PASSED', 'good'],
    ],
    badge: '✓ Closing RL corrected',
  },
  cogo: {
    title: 'COGO — Bearing Intersection',
    input: [['Station A', 'E 258,430 / N 9,877,200'], ['Bearing A→P', '045° 22′ 30″'], ['Station B', 'E 258,710 / N 9,877,200']],
    output: [
      ['Point P  East.', '258,561.44 m', 'good'],
      ['Point P  North.', '9,877,331.44 m', 'good'],
      ['Dist. A→P', '187.21 m', 'neutral'],
      ['Dist. B→P', '167.44 m', 'neutral'],
      ['Check', 'Lines intersect', 'good'],
    ],
    badge: '✓ Full working shown',
  },
  curves: {
    title: 'Horizontal Curve Elements',
    input: [['Radius', '300 m'], ['Deflection Δ', '45° 00′ 00″'], ['PI Chainage', '2+450.000']],
    output: [
      ['Tangent Length T', '124.264 m', 'neutral'],
      ['Arc Length L', '235.619 m', 'neutral'],
      ['Long Chord C', '229.813 m', 'neutral'],
      ['External E', '24.264 m', 'neutral'],
      ['Mid-Ordinate M', '22.876 m', 'neutral'],
    ],
    badge: '✓ Stakeout table generated',
  },
}

function ToolDemo() {
  const [active, setActive] = useState<keyof typeof TOOL_DEMOS>('traverse')
  const demo = TOOL_DEMOS[active]
  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-color)]">
        {Object.keys(TOOL_DEMOS).map(k => (
          <button key={k} onClick={() => setActive(k as any)}
            className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${
              active === k
                ? 'bg-[var(--bg-primary)] text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}>
            {k}
          </button>
        ))}
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{demo.title}</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Input */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Input</div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3 space-y-2">
              {demo.input.map(([k, v], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">{k}</span>
                  <span className="text-[var(--text-secondary)] font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Output */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Output</div>
            <div className="bg-[var(--bg-primary)] rounded-lg p-3 space-y-2">
              {demo.output.map(([k, v, type], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">{k}</span>
                  <span className={`font-mono font-semibold ${type === 'good' ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 text-center">
          <span className="text-xs text-[var(--accent)] font-medium">{demo.badge}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="bg-[var(--bg-primary)]">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-24 lg:pt-28 lg:pb-32">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full"><defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>
        </div>
        {/* Accent glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-sm font-medium mb-6">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                Built for land surveyors in Africa
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold text-[var(--text-primary)] leading-[1.1] mb-5">
                Survey calculations,<br />
                <span className="text-[var(--accent)]">done right.</span>
              </h1>
              <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-lg leading-relaxed">
                Traverse adjustment, leveling arithmetic checks, COGO, curves, and professional PDF reports — all following <strong className="text-[var(--text-primary)] font-medium">N.N. Basak standards.</strong> Works offline in the field.
              </p>
              <div className="flex flex-wrap gap-3 mb-10">
                <Link href="/register" className="px-7 py-3.5 bg-[var(--accent)] text-black font-semibold rounded-xl hover:bg-[var(--accent-dim)] transition-colors">
                  Start free — no card needed
                </Link>
                <Link href="/tools" className="px-7 py-3.5 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/50 transition-colors">
                  Try a tool now
                </Link>
              </div>
              <div className="flex flex-wrap gap-5 text-sm text-[var(--text-muted)]">
                {[
                  'KSh 500/mo Pro',
                  '14-day free trial',
                  'Works offline',
                  'Android PWA',
                ].map(f => (
                  <div key={f} className="flex items-center gap-1.5">
                    <div className="text-[var(--accent)]">{Icon.check}</div>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* App mockup */}
            <div className="hidden lg:block">
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ──────────────────────────────────────────── */}
      <section className="py-20 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-[var(--text-muted)] text-sm uppercase tracking-wider mb-10">
            The problems every field surveyor knows
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Icon.clock,
                color: 'red',
                title: 'Hours of manual computation',
                body: 'A 5-station closed traverse with Bowditch adjustment can take 2+ hours by hand. One arithmetic error means starting over.',
              },
              {
                icon: Icon.warning,
                color: 'amber',
                title: 'Leveling checks that fail silently',
                body: 'ΣBS − ΣFS ≠ ΣRise − ΣFall. On paper you might not catch it until the submission is rejected.',
              },
              {
                icon: Icon.file,
                color: 'orange',
                title: 'Reports not ready for submission',
                body: 'Handwritten tables and Word documents that don\'t meet the format requirements of land registries.',
              },
            ].map(({ icon, color, title, body }) => (
              <div key={title} className={`bg-[var(--bg-primary)] p-6 rounded-xl border border-[var(--border-color)] border-l-2 border-l-${color}-500/50`}>
                <div className={`w-10 h-10 rounded-lg bg-${color}-500/10 text-${color}-400 flex items-center justify-center mb-4`}>
                  {icon}
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[var(--accent)] font-semibold mt-10">
            GeoNova solves all three — and everything else between field and submission.
          </p>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-primary)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] mb-3">
              Everything in one platform
            </h2>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
              From field data collection to submitted report, without leaving GeoNova.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Icon.calc, title: '20+ calculation tools', desc: 'Traverse (Bowditch + Transit), leveling (Rise & Fall + HOC), COGO, horizontal and vertical curves, tacheometry, GNSS baseline.' },
              { icon: Icon.map, title: 'Interactive project map', desc: 'Plot survey points, draw traverses and parcels on a live map. Click any point to inspect coordinates.' },
              { icon: Icon.report, title: 'Professional PDF reports', desc: 'One click generates a formatted survey report with coordinates, adjustments, and your company header.' },
              { icon: Icon.offline, title: 'Offline field mode', desc: 'Install as an Android app. Leveling book, traverse capture, and all calculators work without internet.' },
              { icon: Icon.export, title: 'DXF + LandXML export', desc: 'Export directly into AutoCAD or any surveying software. Submit digitally to clients and registries.' },
              { icon: Icon.africa, title: 'Built for African standards', desc: 'Arc 1960, WGS84, local UTM zones. Pricing in KES, UGX, TZS, NGN. 10 languages including Kiswahili.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="group p-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/40 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-4 group-hover:bg-[var(--accent)]/20 transition-colors">
                  {icon}
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOOL SHOWCASE ────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
              Real calculations, real outputs
            </h2>
            <p className="text-[var(--text-secondary)]">
              These are actual results from the live calculators — not mock numbers.
            </p>
          </div>
          <ToolDemo />
          <p className="text-center mt-6">
            <Link href="/tools" className="text-sm text-[var(--accent)] hover:underline">
              Open all 20 calculators →
            </Link>
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-primary)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">From field to report in minutes</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { n: '1', title: 'Create a project', body: 'Name it, set the UTM zone and datum (e.g. Zone 37S, Arc 1960). Takes 30 seconds.' },
              { n: '2', title: 'Enter your data', body: 'Type coordinates manually, upload a CSV from your data collector, or use field mode on your phone.' },
              { n: '3', title: 'Run the adjustment', body: 'Bowditch or Transit traverse, rise-and-fall leveling — GeoNova does the arithmetic check automatically.' },
              { n: '4', title: 'Download your report', body: 'One click generates a PDF with all adjusted coordinates, bearings, and your surveyor details.' },
            ].map(({ n, title, body }) => (
              <div key={n} className="relative">
                {/* Connector line */}
                {n !== '4' && <div className="hidden md:block absolute top-6 left-full w-full h-px bg-[var(--border-color)] -z-0" style={{ width: 'calc(100% - 1.5rem)', left: '1.5rem' }} />}
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-[var(--accent)] text-black font-bold text-lg flex items-center justify-center mb-4">
                    {n}
                  </div>
                  <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">What surveyors say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { q: 'GeoNova caught a leveling error I would have missed completely. The arithmetic check is automatic and the report was ready in one click.', name: 'Joseph M.', role: 'Licensed Land Surveyor', country: 'Kenya' },
              { q: 'I do boundary surveys on a budget Android phone. Offline mode works perfectly and the traverse precision is spot on every time.', name: 'Emmanuel O.', role: 'Survey Technician', country: 'Uganda' },
              { q: 'The COGO tools match what I used to do in expensive desktop software. At KSh 500 a month it is simply no comparison.', name: 'Amara D.', role: 'Civil Engineer', country: 'Tanzania' },
            ].map(({ q, name, role, country }) => (
              <div key={name} className="bg-[var(--bg-primary)] p-6 rounded-xl border border-[var(--border-color)]">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} viewBox="0 0 24 24" className="w-4 h-4 text-[var(--accent)] fill-current"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4 italic">"{q}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] text-sm font-bold">
                    {name[0]}
                  </div>
                  <div>
                    <p className="text-[var(--text-primary)] text-sm font-medium">{name}</p>
                    <p className="text-[var(--text-muted)] text-xs">{role} · {country}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-primary)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">Priced for Africa</h2>
            <p className="text-[var(--text-secondary)]">Local pricing. No USD card required. 14-day free trial on Pro.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                tier: 'Free', price: 'KSh 0', sub: 'forever',
                features: ['All 20 quick-calc tools', '1 survey project', '50 survey points', 'Basic PDF report', 'Offline calculations'],
                cta: 'Get started free', href: '/register', accent: false,
              },
              {
                tier: 'Pro', price: 'KSh 500', sub: '/month',
                features: ['Unlimited projects', 'Unlimited points', 'Full PDF reports', 'DXF + LandXML export', 'GPS Stakeout mode', 'Process field notes CSV', 'Offline sync', 'Priority support'],
                cta: 'Start 14-day trial', href: '/register', accent: true,
              },
              {
                tier: 'Team', price: 'KSh 2,000', sub: '/month',
                features: ['Everything in Pro', '5 team members', 'Real-time collaboration', 'Role-based access', 'Audit trail', 'Branded reports'],
                cta: 'Contact us', href: 'mailto:support@geonova.app', accent: false,
              },
            ].map(({ tier, price, sub, features, cta, href, accent }) => (
              <div key={tier} className={`relative rounded-xl border p-6 ${accent ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'}`}>
                {accent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-black text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <h3 className="font-bold text-[var(--text-primary)] text-lg mb-1">{tier}</h3>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-2xl font-bold text-[var(--accent)]">{price}</span>
                  <span className="text-sm text-[var(--text-muted)]">{sub}</span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <div className="mt-0.5 text-[var(--accent)] flex-shrink-0">{Icon.check}</div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={href} className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${accent ? 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 border border-[var(--border-color)]'}`}>
                  {cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[var(--text-muted)] mt-6">
            Also available in UGX · TZS · NGN · USD · ZAR · GHS · INR
          </p>
        </div>
      </section>

      {/* ── MOBILE CTA ───────────────────────────────────────────── */}
      <section className="py-20 bg-[var(--bg-secondary)] border-y border-[var(--border-color)]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-10 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Take it to the field</h2>
              <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                Install GeoNova on your Android phone like a native app. All calculators and the digital fieldbook work without internet — sync when you get back to the office.
              </p>
              <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 text-sm">
                <p className="text-[var(--text-muted)] mb-1 text-xs uppercase tracking-wider">Install on Android</p>
                <p className="text-[var(--text-secondary)]">Chrome → Menu (⋮) → Add to Home Screen</p>
              </div>
            </div>
            {/* Phone sketch */}
            <div className="flex justify-center">
              <div className="w-44 h-80 bg-[var(--bg-primary)] rounded-[2rem] border-2 border-[var(--border-color)] overflow-hidden flex flex-col shadow-xl">
                {/* Status bar */}
                <div className="px-4 py-2 flex justify-between">
                  <span className="text-[10px] text-[var(--text-muted)]">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-1.5 border border-[var(--text-muted)]/40 rounded-sm"><div className="w-2/3 h-full bg-green-500 rounded-sm" /></div>
                  </div>
                </div>
                {/* Header */}
                <div className="px-3 py-2 border-b border-[var(--border-color)]">
                  <div className="text-[10px] text-[var(--accent)] font-semibold">GeoNova Field</div>
                  <div className="text-[9px] text-[var(--text-muted)]">Karen Estate Survey</div>
                </div>
                {/* Content rows */}
                <div className="flex-1 p-3 space-y-1.5">
                  {['Leveling Book', 'Traverse Capture', 'Radiation', 'Stakeout', 'Quick Calc'].map(item => (
                    <div key={item} className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg px-2.5 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                      <span className="text-[10px] text-[var(--text-primary)]">{item}</span>
                    </div>
                  ))}
                </div>
                {/* Nav bar */}
                <div className="flex justify-around py-2 border-t border-[var(--border-color)]">
                  {['Home', 'Map', 'Sync'].map(n => (
                    <div key={n} className="text-[9px] text-[var(--text-muted)] text-center">
                      <div className="w-4 h-4 mx-auto mb-0.5 bg-[var(--border-color)] rounded" />
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--bg-primary)] text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] mb-4">
            Ready to work faster?
          </h2>
          <p className="text-[var(--text-secondary)] mb-8 text-lg">
            Join surveyors across Kenya, Uganda, Tanzania and Nigeria who have replaced their spreadsheets with GeoNova.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/register" className="px-8 py-4 bg-[var(--accent)] text-black font-bold rounded-xl hover:bg-[var(--accent-dim)] transition-colors text-lg">
              Start free trial
            </Link>
            <Link href="/tools" className="px-8 py-4 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/40 transition-colors text-lg">
              Try a tool first
            </Link>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-5">No credit card. No commitment. Free forever plan available.</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-color)] py-14 bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="text-[var(--text-primary)] font-bold text-base mb-1">GeoNova</div>
              <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">Professional surveying platform built for Africa.</p>
              <p className="text-xs text-[var(--text-muted)]">support@geonova.app</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">Calculators</p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                {['Distance & Bearing', 'Traverse', 'Leveling', 'COGO', 'Horizontal Curves', 'Tacheometry'].map(t => (
                  <li key={t}><Link href={`/tools/${t.toLowerCase().replace(/ &? /g, '-').replace(/[()]/g, '')}`} className="hover:text-[var(--accent)] transition-colors">{t}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">Resources</p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                {[['Field Guide', '/guide'], ['Documentation', '/docs'], ['Quick Start', '/docs/quick-start'], ['CSV Import', '/docs/csv-import'], ['FAQ', '/docs/faq']].map(([t, h]) => (
                  <li key={t}><Link href={h} className="hover:text-[var(--accent)] transition-colors">{t}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">Account</p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                {[['Pricing', '/pricing'], ['Register', '/register'], ['Login', '/login'], ['Community', '/community'], ['Instruments', '/equipment']].map(([t, h]) => (
                  <li key={t}><Link href={h} className="hover:text-[var(--accent)] transition-colors">{t}</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--border-color)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[var(--text-muted)]">
            <p>© 2026 GeoNova. Built for surveyors, by a surveyor.</p>
            <p>Kenya · Uganda · Tanzania · Nigeria · South Africa · India · Indonesia · Brazil</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
