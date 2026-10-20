'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * Cadastral Workflow Hub
 *
 * Connects the existing cadastral tools into a visible 5-step workflow.
 * A surveyor lands here, sees the full process, and can track progress.
 *
 * Steps:
 * 1. Search parcel → /parcel
 * 2. Validate boundary → /cadastra
 * 3. Record beacons → /beacons
 * 4. Generate deed plan → /deed-plan
 * 5. Create mutation / submit → /tools/mutation-plan
 *
 * Progress is a browser-local checklist. It is not a registry status or
 * evidence that any authority has reviewed or accepted the survey.
 */

interface WorkflowState {
  parcelSearched: boolean
  fieldObsRecorded: boolean
  boundaryValidated: boolean
  beaconsRecorded: boolean
  deedPlanGenerated: boolean
  submissionReady: boolean
  parcelNumber?: string
  updatedAt: string
}

const STORAGE_KEY = 'metardu:cadastral-workflow'

const EMPTY_STATE: WorkflowState = {
  parcelSearched: false,
  fieldObsRecorded: false,
  boundaryValidated: false,
  beaconsRecorded: false,
  deedPlanGenerated: false,
  submissionReady: false,
  updatedAt: new Date().toISOString(),
}

const STEPS = [
  {
    id: 'parcelSearched' as const,
    num: '01',
    title: 'Check METARDU records and official sources',
    desc: 'Search records saved to your METARDU account or shared references. A local miss does not establish parcel status or ownership. Use the official land services for current records and confirm boundaries with the responsible survey office.',
    href: '/parcel',
    cta: 'Search parcel',
    reference: 'METARDU parcel records · official portal handoff',
    hints: [
      'Record the identifier and registration section supplied by the client',
      'Obtain and inspect the authoritative survey records for the job',
      'Confirm notice, consent, and adjoining-owner requirements for the survey type',
    ],
  },
  {
    id: 'fieldObsRecorded' as const,
    num: '02',
    title: 'Capture Field Data & Compute Traverse',
    desc: 'Record field and control observations in the project field book or import a supported file. Compute the traverse with the selected adjustment method, then compare the result with the raw observations and project reference system.',
    href: '/fieldbook',
    cta: 'Open digital fieldbook',
    reference: 'Declared project reference system · applicable survey instructions',
    hints: [
      'Check browser and instrument compatibility before relying on a live connection',
      'Retain original observations and review closure against the requirements for this job',
      'Confirm the adjustment and coordinate reference before using exported coordinates',
    ],
  },
  {
    id: 'boundaryValidated' as const,
    num: '03',
    title: 'Review boundary geometry',
    desc: 'Run geometry checks on the saved boundary, including self-intersections and parcel overlaps where comparison data exists. These checks do not verify ownership, title area, legal tolerances, or registry acceptance.',
    href: '/tools/topology-check',
    cta: 'Run topology check',
    reference: 'METARDU geometry checks · GeoJSON RFC 7946',
    hints: [
      'Compare calculated areas with the source documents and declared measurement basis',
      'Check overlaps only where valid neighboring geometry is available',
      'Review coordinate order and topology warnings before using the drawing',
    ],
  },
  {
    id: 'beaconsRecorded' as const,
    num: '04',
    title: 'Record and review beacon evidence',
    desc: 'Record the observed marker type, status, coordinates, and field notes when that evidence is available. METARDU can prepare a certificate draft; the surveyor must check the applicable form and required evidence.',
    href: '/tools/beacon-certificate',
    cta: 'Build beacon certificate',
    reference: 'Applicable survey instructions · source beacon evidence',
    hints: [
      'Do not infer a marker type or status from a coordinate alone',
      'Retain field notes and the observation source for recovered or replaced marks',
      'Review the generated draft against the current form and signing requirements',
    ],
  },
  {
    id: 'deedPlanGenerated' as const,
    num: '05',
    title: 'Generate a deed-plan draft',
    desc: 'Create a drawing from the available project geometry and metadata. Check the declared CRS, units, scale, bearings, labels, and required official layout before signing or filing; METARDU does not certify the plan as an official form.',
    href: '/deed-plan',
    cta: 'Generate deed plan',
    reference: 'Current Survey of Kenya instructions · project evidence',
    hints: [
      'Choose a scale that suits the job and verify legibility at the final print size',
      'Confirm every coordinate came from the intended project and declared CRS',
      'Inspect the exported plan and check the current filing format before delivery',
    ],
  },
  {
    id: 'submissionReady' as const,
    num: '06',
    title: 'Prepare files for manual submission',
    desc: 'Assemble the project documents and data available in METARDU for licensed-surveyor review. The platform does not upload them to a government registry or guarantee that the set is complete or accepted.',
    href: '/tools/mutation-plan',
    cta: 'Create mutation plan',
    reference: 'Current official portal workflow · applicable land and survey rules',
    hints: [
      'Confirm which plans, forms, consents, and supporting records apply to this case',
      'Verify professional credentials and signing requirements through the responsible body',
      'Review every file before using the official portal or delivering to an authority',
    ],
  },
]

export default function CadastralWorkflowPage() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<WorkflowState>(EMPTY_STATE)
  const [mounted, setMounted] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setState(JSON.parse(saved) as WorkflowState)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // Check URL params for step completion (e.g. ?completed=parcelSearched)
  useEffect(() => {
    if (!mounted) return
    const completed = searchParams.get('completed')
    const parcel = searchParams.get('parcel')
    if (completed && completed in state) {
      const newState = {
        ...state,
        [completed]: true,
        ...(parcel ? { parcelNumber: parcel } : {}),
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
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10" role="status" aria-busy="true">
        <p className="text-sm text-[var(--text-secondary)] mb-6">Loading your cadastral workflow…</p>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)]" aria-hidden="true">
          {STEPS.map(step => (
            <div key={step.id} className="p-5 md:p-6 border-b border-[var(--border-color)] last:border-b-0 motion-safe:animate-pulse">
              <div className="h-5 w-2/3 bg-[var(--bg-tertiary)] mb-3" />
              <div className="h-3 w-full bg-[var(--bg-tertiary)] mb-2" />
              <div className="h-3 w-4/5 bg-[var(--bg-tertiary)]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      {/* Header */}
      <div className="mb-8 pb-5 border-b border-[var(--border-color)]">
        <div className="font-mono text-[11px] text-[var(--accent)] tracking-[0.12em] uppercase mb-2">
          Cadastral survey · 6-step workflow aid
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-[var(--text-primary)] tracking-[-0.025em] leading-[1.05]">
          From project records <span className="text-[var(--accent)] italic">to a reviewed draft.</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-3 max-w-[60ch] leading-relaxed">
          A checklist linking to METARDU tools for a cadastral job. Progress is saved in this browser only; it does not confirm field completion, official review, or registry acceptance. METARDU does not search government records or file documents for you.
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
          {completedCount}/{STEPS.length} marked complete
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
            Official sources to check
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">Current Survey Act and amendments</li>
            <li className="font-mono">Current survey regulations and official notices</li>
            <li className="font-mono">Requirements for the survey type and location</li>
            <li className="font-mono">Current land-registration process and forms</li>
            <li className="font-mono">Official Ardhisasa portal and filing guidance</li>
          </ul>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Possible supporting documents
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">Deed plan layout — confirm the required current form</li>
            <li className="font-mono">Consent records — where applicable to the job</li>
            <li className="font-mono">Beacon schedule or certificate — verify requirements</li>
            <li className="font-mono">Computation records and supporting field notes</li>
            <li className="font-mono">Mutation documents — where applicable</li>
          </ul>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Geodesy tools
          </div>
          <ul className="space-y-2 text-xs">
            <li><Link href="/tools/scale-factor" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Scale factor (grid → ground area)</Link></li>
            <li><Link href="/tools/site-calibration" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Site calibration (WGS84 → Arc 1960)</Link></li>
            <li><Link href="/tools/cassini-utm" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Cassini ↔ UTM converter</Link></li>
            <li><Link href="/tools/topology-check" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">Topology pre-flight validator</Link></li>
            <li><Link href="/tools/cogo-reconstruct" className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-mono no-underline">COGO deed plan reconstructor</Link></li>
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
