'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * Engineering Survey Workflow Hub — v0.3
 *
 * Connects the existing engineering tools into a visible 6-step workflow
 * for road and civil engineering surveys. Follows RDM 1.1 (2025) and
 * Kenya Rural Roads Authority (KeRRA) / Kenya National Highways Authority
 * (KeNHA) conventions.
 *
 * Steps:
 * 1. Establish baseline → /tools/chainage
 * 2. Differential levelling → /tools/leveling
 * 3. Cross-sections → /tools/cross-sections
 * 4. Earthworks volumes → /tools/earthworks
 * 5. Setting-out → /tools/setting-out
 * 6. As-built & handover → /tools/civil-export
 *
 * Status tracking via localStorage (same pattern as cadastral workflow).
 */

interface WorkflowState {
  baselineEstablished: boolean
  levellingComplete: boolean
  crossSectionsComplete: boolean
  earthworksComplete: boolean
  settingOutComplete: boolean
  asBuiltComplete: boolean
  roadReference?: string
  updatedAt: string
}

const STORAGE_KEY = 'metardu:engineering-workflow'

const EMPTY_STATE: WorkflowState = {
  baselineEstablished: false,
  levellingComplete: false,
  crossSectionsComplete: false,
  earthworksComplete: false,
  settingOutComplete: false,
  asBuiltComplete: false,
  updatedAt: new Date().toISOString(),
}

const STEPS = [
  {
    id: 'baselineEstablished' as const,
    num: '01',
    title: 'Establish the baseline',
    desc: 'Set out the road centreline or structure baseline with chainage stations at regular intervals (typically 20m or 25m). This is the reference line for all subsequent engineering survey work — levels, cross-sections, setting-out, and as-builts all hang off the chainage.',
    href: '/tools/chainage',
    cta: 'Open chainage tool',
    reference: 'RDM 1.1 (2025) § 5.3 · KeNHA/KeRRA standard chainage 20m',
    hints: [
      'Chainage stations at 20m intervals (25m for low-class roads)',
      'Mark chainage on permanent pegs offset from centreline',
      'Record coordinates of every chainage station (UTM)',
      'Tie baseline to at least two known control points',
    ],
  },
  {
    id: 'levellingComplete' as const,
    num: '02',
    title: 'Run differential levelling',
    desc: 'Establish levels along the baseline and at every cross-section. Use rise & fall or height of collimation method. Close the level loop to a known benchmark — RDM 1.1 requires 10√K mm closure where K is loop length in km.',
    href: '/tools/leveling',
    cta: 'Open levelling tool',
    reference: 'RDM 1.1 (2025) Table 5.1 · closure 10√K mm',
    hints: [
      'Open and close on a known benchmark (BM) — never assume a level',
      'Closure tolerance: 10√K mm (K = loop length in km)',
      'Record backsight, foresight, intermediate sights at every chainage',
      'Reduced levels (RL) feed directly into cross-sections and earthworks',
    ],
  },
  {
    id: 'crossSectionsComplete' as const,
    num: '03',
    title: 'Survey cross-sections',
    desc: 'At every chainage station, take levels left and right of the centreline to capture the existing ground profile. These cross-sections are the basis for earthworks volume calculations and for generating the road design template.',
    href: '/tools/cross-sections',
    cta: 'Open cross-sections tool',
    reference: 'RDM 1.1 (2025) § 6.2 · cross-section intervals',
    hints: [
      'Cross-section width: typically 15-30m each side of centreline',
      'Take levels at breaks of slope (not fixed intervals)',
      'Record offset distance + reduced level at every point',
      'Cross-sections at every chainage + at structure locations',
    ],
  },
  {
    id: 'earthworksComplete' as const,
    num: '04',
    title: 'Compute earthworks volumes',
    desc: 'Calculate cut and fill volumes between the existing ground (from cross-sections) and the design template. Use the end-area method for regular sections or prismoidal method for irregular ground. Generate the mass-haul diagram for material movement planning.',
    href: '/tools/earthworks',
    cta: 'Open earthworks tool',
    reference: 'RDM 1.1 (2025) § 7 · end-area method',
    hints: [
      'End-area method: V = (A1 + A2) / 2 × L (between consecutive sections)',
      'Mass-haul diagram shows where to borrow vs waste material',
      'Freehaul distance: 300m typical (within which no extra payment)',
      'Overlap areas: account for pavement layers in final volumes',
    ],
  },
  {
    id: 'settingOutComplete' as const,
    num: '05',
    title: 'Set out the works',
    desc: 'Set out the road formation, structures, and drainage works from the baseline. Compute setting-out data (bearings, distances, offsets) for every construction element. This is what the contractor builds to.',
    href: '/tools/setting-out',
    cta: 'Open setting-out tool',
    reference: 'RDM 1.1 (2025) § 8 · construction setting-out',
    hints: [
      'Set out: formation edges, shoulders, ditches, structure centres',
      'Use offset method (perpendicular to baseline) for linear works',
      'Use radiation method (bearing + distance from control point) for structures',
      'Check setting-out independently — never set out from a single reference',
    ],
  },
  {
    id: 'asBuiltComplete' as const,
    num: '06',
    title: 'As-built survey & handover',
    desc: 'Survey the completed works to confirm they match the design. Generate as-built drawings, final quantities, and the handover package. Export to civil CAD formats (LandXML, DXF) for the consulting engineer and client.',
    href: '/tools/civil-export',
    cta: 'Open civil export',
    reference: 'RDM 1.1 (2025) § 9 · as-built requirements',
    hints: [
      'Verify formation levels, widths, and slopes against design',
      'Final quantities: re-measure earthworks from as-built sections',
      'Export LandXML for civil CAD interchange (Civil 3D, MX Road)',
      'Handover package: as-built drawings + final quantities + compliance cert',
    ],
  },
]

export default function EngineeringWorkflowPage() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<WorkflowState>(EMPTY_STATE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setState(JSON.parse(saved))
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    const completed = searchParams.get('completed')
    const road = searchParams.get('road')
    if (completed && completed in state) {
      const newState = {
        ...state,
        [completed]: true,
        ...(road ? { roadReference: road } : {}),
        updatedAt: new Date().toISOString(),
      }
      setState(newState)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, searchParams])

  const toggleStep = (stepId: keyof WorkflowState) => {
    const newState = {
      ...state,
      [stepId]: !state[stepId],
      updatedAt: new Date().toISOString(),
    }
    setState(newState)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState))
  }

  const resetWorkflow = () => {
    setState(EMPTY_STATE)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(EMPTY_STATE))
  }

  const completedCount = STEPS.filter(s => state[s.id]).length
  const progress = Math.round((completedCount / STEPS.length) * 100)

  if (!mounted) {
    return <div className="max-w-5xl mx-auto px-4 py-8" style={{ minHeight: '50vh' }} />
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      {/* Header */}
      <div className="mb-8 pb-5 border-b border-[var(--border-color)]">
        <div className="font-mono text-[11px] text-[var(--accent)] tracking-[0.12em] uppercase mb-2">
          Engineering survey · 6-step workflow
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-[var(--text-primary)] tracking-[-0.025em] leading-[1.05]">
          From baseline <span className="text-[var(--accent)] italic">to handover.</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-3 max-w-[60ch] leading-relaxed">
          The complete road and civil engineering survey workflow. Each step links to
          the relevant tool. Follow RDM 1.1 accuracy standards and KeNHA/KeRRA conventions
          throughout. Progress saves locally and persists across sessions.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-10 flex items-center gap-4">
        <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-sm overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)] tracking-[0.04em]">
          {completedCount}/{STEPS.length} complete
        </span>
        {completedCount > 0 && (
          <button
            onClick={resetWorkflow}
            className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--error)] tracking-[0.06em] uppercase transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-0 border border-[var(--border-color)] bg-[var(--bg-card)]">
        {STEPS.map((step, idx) => {
          const isComplete = state[step.id]
          const isLocked = idx > 0 && !state[STEPS[idx - 1].id]

          return (
            <div
              key={step.id}
              className={`border-b border-[var(--border-color)] last:border-b-0 ${isLocked ? 'opacity-50' : ''}`}
            >
              <div className="p-5 md:p-6">
                <div className="flex items-start gap-4">
                  {/* Step number / checkbox */}
                  <button
                    onClick={() => !isLocked && toggleStep(step.id)}
                    disabled={isLocked}
                    className={`shrink-0 w-10 h-10 border flex items-center justify-center transition-all ${
                      isComplete
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--bg-primary)]'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                    } ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    aria-label={isComplete ? `Mark step ${step.num} as incomplete` : `Mark step ${step.num} as complete`}
                  >
                    {isComplete ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span className="font-mono text-xs tracking-[0.04em]">{step.num}</span>
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h2 className={`font-display text-xl text-[var(--text-primary)] tracking-[-0.015em] leading-tight ${isComplete ? 'line-through opacity-60' : ''}`}>
                          {step.title}
                        </h2>
                        <p className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.04em] mt-1">
                          {step.reference}
                        </p>
                      </div>
                      {!isLocked && (
                        <Link
                          href={step.href}
                          className="shrink-0 font-mono text-[11px] text-[var(--accent)] hover:opacity-80 tracking-[0.04em] uppercase border-b border-[var(--accent)] pb-0.5 no-underline"
                        >
                          {step.cta} →
                        </Link>
                      )}
                    </div>

                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                      {step.desc}
                    </p>

                    {/* Hints */}
                    <ul className="space-y-1.5">
                      {step.hints.map((hint, i) => (
                        <li key={`${hint}-${i}`} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                          <span className="text-[var(--accent)] mt-0.5">·</span>
                          <span className="font-mono leading-relaxed">{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom: contextual info */}
      <div className="mt-8 grid md:grid-cols-3 gap-4">
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Accuracy standards — RDM 1.1
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">Levelling closure: 10√K mm (K = km)</li>
            <li className="font-mono">Traverse: 1:10,000 minimum (1st order)</li>
            <li className="font-mono">Setting-out: ±10mm horizontal, ±5mm vertical</li>
            <li className="font-mono">Cross-section levels: ±20mm on hard surfaces</li>
            <li className="font-mono">Earthworks: ±5% on volume quantities</li>
          </ul>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Authorities & standards
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">RDM 1.1 (2025) — Roads Design Manual</li>
            <li className="font-mono">KeNHA — Kenya National Highways Authority</li>
            <li className="font-mono">KeRRA — Kenya Rural Roads Authority</li>
            <li className="font-mono">KURA — Kenya Urban Roads Authority</li>
            <li className="font-mono">Survey Act Cap 299 — legal framework</li>
          </ul>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Geodesy & precision tools
          </div>
          <ul className="space-y-2 text-xs">
            <li><Link href="/tools/orthometric-height" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Orthometric height (h → H)</Link></li>
            <li><Link href="/tools/scale-factor" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Scale factor (grid → ground)</Link></li>
            <li><Link href="/tools/site-calibration" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Site calibration (datum shift)</Link></li>
            <li><Link href="/tools/lsa" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Least squares adjustment</Link></li>
            <li><Link href="/tools/as-built-deviation" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">As-built deviation guard</Link></li>
          </ul>
        </div>
      </div>

      {/* Last updated */}
      {state.updatedAt && (
        <div className="mt-6 text-center font-mono text-[10px] text-[var(--text-muted)] tracking-[0.04em]">
          Last updated {new Date(state.updatedAt).toLocaleString('en-KE')}
        </div>
      )}
    </div>
  )
}
