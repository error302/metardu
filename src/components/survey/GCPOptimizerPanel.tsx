'use client'

/**
 * GCPOptimizerPanel — Drone GCP planning and validation
 *
 * Features:
 * - Enter a projected project boundary
 * - Plan candidate GCP targets inside the boundary
 * - Validation checklist
 * - Export for Pix4D / WebODM
 * - Track GCP survey status
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Drone, MapPin, CheckCircle2, AlertTriangle, Download,
  Loader2, Camera,
} from 'lucide-react'
import {
  generateGCPPlan,
  generateValidationChecklist,
  exportForPix4D,
  exportForWebODM,
  isPointInsideProjectBoundary,
  parseUtmBoundary,
  updateGCPWithSurvey,
  type GCPPlan,
} from '@/lib/engine/gcpOptimizer'

interface SurveyDraft {
  easting: string
  northing: string
  elevation: string
  horizontalAccuracy: string
  verticalAccuracy: string
  rtkFixed: boolean
}

const emptySurveyDraft: SurveyDraft = {
  easting: '',
  northing: '',
  elevation: '',
  horizontalAccuracy: '',
  verticalAccuracy: '',
  rtkFixed: false,
}

function requiredNumber(value: string, label: string): number {
  if (!value.trim()) throw new Error(`Enter ${label}.`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`)
  return parsed
}

export function GCPOptimizerPanel() {
  const [boundaryText, setBoundaryText] = useState('')
  const [utmZone, setUtmZone] = useState<number | null>(null)
  const [hemisphere, setHemisphere] = useState<'N' | 'S' | null>(null)
  const [plan, setPlan] = useState<GCPPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [surveyDrafts, setSurveyDrafts] = useState<Record<string, SurveyDraft>>({})
  const [surveyErrors, setSurveyErrors] = useState<Record<string, string>>({})

  const handleGenerate = useCallback(() => {
    setGenerating(true)
    try {
      const boundary = parseUtmBoundary(boundaryText)
      const newPlan = generateGCPPlan({ boundary })
      setPlan(newPlan)
      setSurveyDrafts(Object.fromEntries(newPlan.gcps.map(gcp => [gcp.id, { ...emptySurveyDraft }])))
      setSurveyErrors({})
      setPlanError(null)
    } catch (error) {
      setPlan(null)
      setSurveyDrafts({})
      setSurveyErrors({})
      setPlanError(error instanceof Error ? error.message : 'The boundary could not be used to plan targets.')
    } finally {
      setGenerating(false)
    }
  }, [boundaryText])

  const updateSurveyDraft = useCallback((gcpId: string, field: keyof SurveyDraft, value: string | boolean) => {
    setSurveyDrafts(current => ({
      ...current,
      [gcpId]: { ...emptySurveyDraft, ...current[gcpId], [field]: value },
    }))
    setSurveyErrors(current => ({ ...current, [gcpId]: '' }))
  }, [])

  const saveSurveyRecord = useCallback((gcpId: string) => {
    const currentPlan = plan
    const gcp = currentPlan?.gcps.find(item => item.id === gcpId)
    if (!currentPlan || !gcp) return
    const draft = surveyDrafts[gcpId] ?? emptySurveyDraft
    try {
      const easting = requiredNumber(draft.easting, 'surveyed easting')
      const northing = requiredNumber(draft.northing, 'surveyed northing')
      const elevation = requiredNumber(draft.elevation, 'surveyed elevation')
      const horizontalAccuracy = requiredNumber(draft.horizontalAccuracy, 'horizontal uncertainty')
      const verticalAccuracy = requiredNumber(draft.verticalAccuracy, 'vertical uncertainty')
      if (!isPointInsideProjectBoundary({ easting, northing }, currentPlan.projectBoundary)) {
        throw new Error('Surveyed coordinates fall outside the entered project boundary. Check the CRS, zone, and field record.')
      }
      const duplicate = currentPlan.gcps.find(item => item.id !== gcpId
        && item.status !== 'planned'
        && Math.hypot(item.easting - easting, item.northing - northing) < 0.001)
      if (duplicate) throw new Error(`Surveyed coordinates duplicate ${duplicate.name}. Each control point must be distinct.`)
      const updated = updateGCPWithSurvey(
        gcp,
        easting,
        northing,
        elevation,
        horizontalAccuracy,
        verticalAccuracy,
        draft.rtkFixed,
      )
      setPlan({
        ...currentPlan,
        gcps: currentPlan.gcps.map(item => item.id === gcpId ? updated : item),
      })
      setSurveyErrors(current => ({ ...current, [gcpId]: '' }))
    } catch (error) {
      setSurveyErrors(current => ({
        ...current,
        [gcpId]: error instanceof Error ? error.message : 'The survey record could not be saved.',
      }))
    }
  }, [plan, surveyDrafts])

  const checklist = useMemo(() => {
    if (!plan) return []
    return generateValidationChecklist(plan)
  }, [plan])

  const handleExport = useCallback((format: 'pix4d' | 'webodm') => {
    if (!plan || utmZone === null || hemisphere === null) return
    try {
      const csv = format === 'pix4d'
        ? exportForPix4D(plan.gcps, utmZone, hemisphere)
        : exportForWebODM(plan.gcps, utmZone, hemisphere)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gcp-export-${format}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setPlanError(null)
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'This GCP plan cannot be exported yet.')
    }
  }, [plan, utmZone, hemisphere])

  const allTargetsSurveyed = !!plan?.gcps.length && plan.gcps.every(gcp =>
    gcp.status !== 'planned'
      && gcp.rtkFixed
      && Number.isFinite(gcp.easting)
      && Number.isFinite(gcp.northing)
      && Number.isFinite(gcp.elevation)
      && Number.isFinite(gcp.accuracy)
      && (gcp.accuracy ?? 0) > 0
      && Number.isFinite(gcp.verticalAccuracy)
      && (gcp.verticalAccuracy ?? 0) > 0,
  )

  return (
    <div className="space-y-4">
      {/* Project boundary input */}
      <div className="card p-4">
        <label htmlFor="gcp-boundary" className="block text-sm font-semibold text-[var(--text-primary)]">Project boundary coordinates</label>
        <p id="gcp-boundary-help" className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          Enter WGS 84 / UTM easting,northing pairs in metres, one per line and in boundary order. All coordinates must use the same UTM zone and datum; this tool does not transform datums.
        </p>
        <textarea
          id="gcp-boundary"
          value={boundaryText}
          onChange={event => {
            setBoundaryText(event.target.value)
            setPlan(null)
            setSurveyDrafts({})
            setSurveyErrors({})
            setPlanError(null)
          }}
          aria-describedby="gcp-boundary-help"
          rows={5}
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-3 font-mono text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label htmlFor="utm-zone" className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            UTM zone
            <select
              id="utm-zone"
              value={utmZone ?? ''}
              onChange={event => setUtmZone(event.target.value ? Number(event.target.value) : null)}
              className="h-10 min-w-24 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="">Choose zone</option>
              {Array.from({ length: 60 }, (_, index) => index + 1).map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <fieldset className="flex items-center gap-1">
            <legend className="mb-1 text-xs text-[var(--text-secondary)]">Hemisphere</legend>
            {(['N', 'S'] as const).map(h => (
              <button
                key={h}
                onClick={() => setHemisphere(h)}
                type="button"
                className={`min-h-10 min-w-10 rounded-lg border border-[var(--border-color)] px-3 text-xs font-mono ${hemisphere === h ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}
                aria-pressed={hemisphere === h}
                aria-label={`Hemisphere ${h === 'N' ? 'North' : 'South'}`}
              >
                {h}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!boundaryText.trim() || generating}
            className="flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Drone className="h-4 w-4" aria-hidden="true" />}
            Plan candidate targets
          </button>
        </div>
        {planError && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{planError}</p>}
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--text-secondary)]">
          Candidate target count and spacing are planning heuristics. Confirm them against the flight plan, ground sampling distance, overlap, relief, and project control design. They are not accuracy or coverage estimates.
        </p>
      </div>

      {/* Plan results */}
      {plan && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)] text-center">
              <div className="text-lg font-bold text-[var(--accent)]">{plan.totalGCPs}</div>
              <div className="text-[9px] text-gray-400 uppercase">Candidate targets</div>
            </div>
            <div className="p-2 rounded-lg bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)] text-center">
              <div className="text-lg font-bold text-gray-300">{plan.projectAreaHa.toFixed(3)} ha</div>
              <div className="text-[9px] text-gray-400 uppercase">Boundary area</div>
            </div>
          </div>

          {/* GCP list */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Candidate target locations</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => handleExport('pix4d')} disabled={!allTargetsSurveyed || utmZone === null || hemisphere === null} className="flex items-center gap-1 px-2 h-8 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[10px] text-gray-400 disabled:cursor-not-allowed disabled:opacity-40">
                  <Download className="w-3 h-3" /> Pix4D
                </button>
                <button type="button" onClick={() => handleExport('webodm')} disabled={!allTargetsSurveyed || utmZone === null || hemisphere === null} className="flex items-center gap-1 px-2 h-8 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[10px] text-gray-400 disabled:cursor-not-allowed disabled:opacity-40">
                  <Download className="w-3 h-3" /> WebODM GCP CSV
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {plan.gcps.map(gcp => (
                <div key={gcp.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-[var(--border-color)]">
                  <div className={`shrink-0 w-7 h-7 rounded flex items-center justify-center ${
                    gcp.status === 'validated' ? 'bg-emerald-500/10' :
                    gcp.status === 'surveyed' ? 'bg-blue-500/10' : 'bg-gray-500/10'
                  }`}>
                    <MapPin className={`w-3.5 h-3.5 ${
                      gcp.status === 'validated' ? 'text-emerald-400' :
                      gcp.status === 'surveyed' ? 'text-blue-400' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-[var(--text-primary)]">{gcp.name}</div>
                    <div className="text-[9px] text-gray-400 font-mono">Proposed UTM E:{(gcp.plannedEasting ?? gcp.easting).toFixed(3)} N:{(gcp.plannedNorthing ?? gcp.northing).toFixed(3)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {gcp.rtkFixed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    {gcp.photoCaptured && <Camera className="w-3 h-3 text-blue-400" />}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      gcp.status === 'validated' ? 'bg-emerald-500/10 text-emerald-400' :
                      gcp.status === 'surveyed' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>{gcp.status}</span>
                  </div>
                </div>
              ))}
            </div>
            <p role="status" className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              Surveyed coordinates, elevations and uncertainty values must be entered below before export. The height is passed through unchanged; confirm the selected software uses the same vertical reference as your project.
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              Pix4D converts measured UTM coordinates to WGS84. WebODM GCP CSV uses Northing, Easting, Elevation and label for GCP Editor Pro; select WGS84 UTM zone {utmZone ?? '—'}{hemisphere ?? '—'} there. It contains control coordinates only, so you still need to mark each target in the photos; this CSV does not carry the recorded uncertainties.
            </p>
            <div className="mt-4 space-y-3">
              {plan.gcps.map(gcp => {
                const draft = surveyDrafts[gcp.id] ?? emptySurveyDraft
                const easting = gcp.status === 'planned' ? null : gcp.easting
                const northing = gcp.status === 'planned' ? null : gcp.northing
                return (
                  <details key={`${gcp.id}-survey`} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
                      {gcp.status === 'planned' ? `Record measured values for ${gcp.name}` : `Edit measured values for ${gcp.name}`}
                    </summary>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Planned target: E {gcp.plannedEasting?.toFixed(3)} m · N {gcp.plannedNorthing?.toFixed(3)} m
                      {easting !== null && northing !== null ? ` · Measured: E ${easting.toFixed(3)} m · N ${northing.toFixed(3)} m` : ''}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        ['easting', 'Surveyed easting (m)'],
                        ['northing', 'Surveyed northing (m)'],
                        ['elevation', 'Surveyed elevation (m)'],
                        ['horizontalAccuracy', 'Horizontal uncertainty (m)'],
                        ['verticalAccuracy', 'Vertical uncertainty (m)'],
                      ] as const).map(([field, label]) => (
                        <label key={field} className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                          {label}
                          <input
                            type="number"
                            step="0.001"
                            inputMode="decimal"
                            value={draft[field]}
                            onChange={event => updateSurveyDraft(gcp.id, field, event.target.value)}
                            aria-label={`${label} for ${gcp.name}`}
                            className="min-h-10 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                          />
                        </label>
                      ))}
                      <label className="flex min-h-10 items-center gap-2 self-end text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={draft.rtkFixed}
                          onChange={event => updateSurveyDraft(gcp.id, 'rtkFixed', event.target.checked)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        Receiver reported a fixed RTK solution
                      </label>
                    </div>
                    {surveyErrors[gcp.id] && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{surveyErrors[gcp.id]}</p>}
                    <button
                      type="button"
                      onClick={() => saveSurveyRecord(gcp.id)}
                      className="mt-3 min-h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
                    >
                      Save measured values
                    </button>
                  </details>
                )
              })}
            </div>
          </div>

          {/* Validation checklist */}
          <div className="card p-4">
            <span className="text-xs font-semibold text-[var(--text-primary)] mb-2 block">Field Validation Checklist</span>
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={`${item}-${i}`} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                  {item.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className={`flex-1 text-xs ${item.completed ? 'text-emerald-400' : 'text-gray-400'}`}>{item.item}</span>
                  <span className="text-[9px] text-gray-400">{item.gcpsCompleted}/{item.totalGCPs}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
