'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * Topographic Survey Workflow Hub — v0.3
 *
 * Connects the existing topographic tools into a visible 5-step workflow.
 * Covers tacheometric survey, DTM generation, contour extraction, orthophoto
 * integration, and CAD/GIS export — the full topo deliverable pipeline.
 *
 * Steps:
 * 1. Field collection → /tools/tacheometry
 * 2. DTM generation → /tools/point-cloud-import
 * 3. Contour extraction → /tools/contour-generator
 * 4. Orthophoto overlay → /tools/orthophoto-viewer
 * 5. CAD/GIS export → /tools/gis-export
 *
 * Status tracking via localStorage (same pattern as cadastral/engineering).
 */

interface WorkflowState {
  fieldCollected: boolean
  dtmGenerated: boolean
  contoursExtracted: boolean
  orthophotoOverlaid: boolean
  exportComplete: boolean
  areaName?: string
  updatedAt: string
}

const STORAGE_KEY = 'metardu:topographic-workflow'

const EMPTY_STATE: WorkflowState = {
  fieldCollected: false,
  dtmGenerated: false,
  contoursExtracted: false,
  orthophotoOverlaid: false,
  exportComplete: false,
  updatedAt: new Date().toISOString(),
}

const STEPS = [
  {
    id: 'fieldCollected' as const,
    num: '01',
    title: 'Collect field data',
    desc: 'Capture topographic points using tacheometry (total station) or GNSS RTK. Record point ID, Easting, Northing, elevation, and feature code at every shot. Feature codes (building, road, fence, tree, boundary, spot level) drive the final drawing.',
    href: '/tools/tacheometry',
    cta: 'Open tacheometry tool',
    reference: 'RDM 1.1 (2025) § 4 · topographic survey methods',
    hints: [
      'Point density: 1 point per 5-10m² for 1:500 scale, 1 per 25m² for 1:1000',
      'Feature code every point — drives automated symbol generation',
      'Capture breaklines (top of slope, bottom of ditch, road edge)',
      'Tie survey to at least two known control points (UTM)',
    ],
  },
  {
    id: 'dtmGenerated' as const,
    num: '02',
    title: 'Generate the DTM',
    desc: 'Build a digital terrain model from the surveyed points. Import point clouds from total station, GNSS, drone, or LiDAR. The DTM is the surface model that contours, volumes, and cross-sections are derived from.',
    href: '/tools/point-cloud-import',
    cta: 'Open point cloud import',
    reference: 'RDM 1.1 (2025) § 4.3 · DTM requirements',
    hints: [
      'Breaklines are mandatory — a DTM without breaklines is wrong',
      'TIN (triangulated irregular network) is the standard DTM structure',
      'Check for spikes and depressions (common GPS errors)',
      'Point density drives DTM accuracy — denser is not always better',
    ],
  },
  {
    id: 'contoursExtracted' as const,
    num: '03',
    title: 'Extract contour lines',
    desc: 'Generate contour lines from the DTM at the interval specified for the survey scale. Smooth contours where appropriate but never across breaklines. Export contours as DXF for CAD or KML for GIS.',
    href: '/tools/contour-generator',
    cta: 'Open contour generator',
    reference: 'RDM 1.1 (2025) § 4.4 · contour standards',
    hints: [
      'Contour interval: 0.5m for 1:500, 1m for 1:1000, 2m for 1:2500',
      'Index contours every 5th line, labelled with elevation',
      'Contours must not cross breaklines — they break at the line',
      'Depressions shown with hachures, not solid lines',
    ],
  },
  {
    id: 'orthophotoOverlaid' as const,
    num: '04',
    title: 'Overlay orthophoto',
    desc: 'Georeference an orthophoto (from drone survey or satellite) and overlay it on the topo drawing. Trace boundaries, buildings, and features from the image to supplement field data. Export the combined drawing.',
    href: '/tools/orthophoto-viewer',
    cta: 'Open orthophoto viewer',
    reference: 'RDM 1.1 (2025) § 4.5 · imagery integration',
    hints: [
      'Orthophoto GSD (ground sample distance) should match survey scale',
      'Georeference to at least 4 GCPs (ground control points)',
      'Trace building outlines and visible boundaries from the image',
      'Check orthophoto against field points — they should agree within 0.5m',
    ],
  },
  {
    id: 'exportComplete' as const,
    num: '05',
    title: 'Export to CAD & GIS',
    desc: 'Export the final topographic drawing to DXF for AutoCAD/Civil 3D, Shapefile for ArcGIS/QGIS, and KML for Google Earth. Layer naming follows the Survey of Kenya convention so downstream users can find features.',
    href: '/tools/gis-export',
    cta: 'Open GIS export',
    reference: 'Survey of Kenya · layer naming convention',
    hints: [
      'DXF layers: BUILDING, ROAD, FENCE, BOUNDARY, CONTOUR, TEXT, SPOT_LEVEL',
      'Shapefile: separate .shp per feature type (points, lines, polygons)',
      'KML for client review — opens in Google Earth, no CAD needed',
      'Include coordinate system metadata in every export (EPSG:32736/37 for Kenya)',
    ],
  },
]

export default function TopographicWorkflowPage() {
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
    const area = searchParams.get('area')
    if (completed && completed in state) {
      const newState = {
        ...state,
        [completed]: true,
        ...(area ? { areaName: area } : {}),
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
          Topographic survey · 5-step workflow
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-[var(--text-primary)] tracking-[-0.025em] leading-[1.05]">
          From field points <span className="text-[var(--accent)] italic">to final drawing.</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-3 max-w-[60ch] leading-relaxed">
          The complete topographic survey workflow. Collect field data, build the DTM,
          extract contours, overlay orthophoto, and export to CAD/GIS. Progress saves
          locally and persists across sessions.
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
                        <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
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
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Survey scale → point density
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">1:500 → 1 point per 5-10m², 0.5m contours</li>
            <li className="font-mono">1:1000 → 1 point per 15-25m², 1m contours</li>
            <li className="font-mono">1:2500 → 1 point per 50-100m², 2m contours</li>
            <li className="font-mono">1:5000 → 1 point per 200m², 5m contours</li>
          </ul>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.08em] uppercase mb-3">
            Coordinate systems — Kenya
          </div>
          <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
            <li className="font-mono">UTM Zone 36S (EPSG:32736) — western Kenya</li>
            <li className="font-mono">UTM Zone 37S (EPSG:32737) — eastern Kenya</li>
            <li className="font-mono">Arc 1960 datum — legacy cadastral</li>
            <li className="font-mono">WGS84 — GNSS / drone / satellite imagery</li>
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
