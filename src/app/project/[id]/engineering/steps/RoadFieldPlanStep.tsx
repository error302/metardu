'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EngineeringData, RoadDesignData, RoadFieldFeatureCode, RoadFieldPlan } from '@/types/engineering'
import {
  buildRoadFieldStations,
  formatRoadChainage,
  ROAD_FIELD_CODE_OPTIONS,
  type RoadFieldPlanDraft,
  validateRoadFieldPlan,
} from '@/lib/engineering/roadFieldPlan'

const DEFAULT_CODES: RoadFieldFeatureCode[] = ['CL', 'LE', 'RE', 'DITCH_L', 'DITCH_R', 'CULV_IN', 'CULV_OUT', 'BREAKLINE']

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function RoadFieldPlanStep({
  projectId,
  projectName,
  roadName,
  roadDesign,
  projectCrsSuggestion,
  data,
  onSave,
}: {
  projectId: string
  projectName: string
  roadName?: string
  roadDesign?: RoadDesignData | null
  projectCrsSuggestion?: string | null
  data: RoadFieldPlan | null
  onSave: (data: Partial<EngineeringData>) => void | Promise<boolean>
}) {
  const [startChainage, setStartChainage] = useState(data ? String(data.startChainageM) : '')
  const [endChainage, setEndChainage] = useState(data ? String(data.endChainageM) : '')
  const [stationInterval, setStationInterval] = useState(data ? String(data.stationIntervalM) : '')
  const [leftExtent, setLeftExtent] = useState(data?.leftExtentM == null ? '' : String(data.leftExtentM))
  const [rightExtent, setRightExtent] = useState(data?.rightExtentM == null ? '' : String(data.rightExtentM))
  const [projectCrs, setProjectCrs] = useState(data?.projectCrs ?? '')
  const [controlReference, setControlReference] = useState(data?.controlReference ?? '')
  const [featureCodes, setFeatureCodes] = useState<RoadFieldFeatureCode[]>(data?.featureCodes ?? DEFAULT_CODES)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(!!data)
  const [saveError, setSaveError] = useState<string | null>(null)

  const savedStationLimits = useMemo(() => {
    const chainages = (roadDesign?.stations ?? [])
      .map(station => station.chainage)
      .filter(chainage => Number.isFinite(chainage) && chainage >= 0)
    if (chainages.length < 2) return null
    const { start, end } = chainages.reduce(
      (limits, chainage) => ({
        start: Math.min(limits.start, chainage),
        end: Math.max(limits.end, chainage),
      }),
      { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY },
    )
    return end > start ? { start, end } : null
  }, [roadDesign?.stations])

  useEffect(() => {
    if (!data) return
    setStartChainage(String(data.startChainageM))
    setEndChainage(String(data.endChainageM))
    setStationInterval(String(data.stationIntervalM))
    setLeftExtent(data.leftExtentM == null ? '' : String(data.leftExtentM))
    setRightExtent(data.rightExtentM == null ? '' : String(data.rightExtentM))
    setProjectCrs(data.projectCrs)
    setControlReference(data.controlReference)
    setFeatureCodes(data.featureCodes)
    setSaved(true)
  }, [data])

  const draft = useMemo<RoadFieldPlanDraft>(() => ({
    startChainageM: numberOrNull(startChainage),
    endChainageM: numberOrNull(endChainage),
    stationIntervalM: numberOrNull(stationInterval),
    leftExtentM: numberOrNull(leftExtent),
    rightExtentM: numberOrNull(rightExtent),
    projectCrs: projectCrs.trim(),
    controlReference: controlReference.trim(),
    featureCodes,
  }), [startChainage, endChainage, stationInterval, leftExtent, rightExtent, projectCrs, controlReference, featureCodes])

  const validationError = validateRoadFieldPlan(draft)
  const stationPreview = useMemo(() => {
    const { startChainageM, endChainageM, stationIntervalM } = draft
    if (validationError || startChainageM === null || endChainageM === null || stationIntervalM === null) return null
    return buildRoadFieldStations({
      ...draft,
      startChainageM,
      endChainageM,
      stationIntervalM,
    })
  }, [draft, validationError])
  const previewStations = stationPreview && stationPreview.length > 5
    ? [...stationPreview.slice(0, 4), stationPreview[stationPreview.length - 1]]
    : stationPreview ?? []
  const finalIntervalM = stationPreview && stationPreview.length > 1
    ? stationPreview[stationPreview.length - 1] - stationPreview[stationPreview.length - 2]
    : null
  const hasShortFinalInterval = finalIntervalM !== null
    && draft.stationIntervalM !== null
    && finalIntervalM + 0.0005 < draft.stationIntervalM
  const canStart = saved && !validationError

  const markEdited = (update: () => void) => {
    setSaved(false)
    setSaveError(null)
    update()
  }

  const toggleCode = (code: RoadFieldFeatureCode) => {
    markEdited(() => setFeatureCodes(current => current.includes(code)
      ? current.filter(item => item !== code)
      : [...current, code]))
  }

  const useSavedStationLimits = () => {
    if (!savedStationLimits) return
    markEdited(() => {
      setStartChainage(String(savedStationLimits.start))
      setEndChainage(String(savedStationLimits.end))
    })
  }

  const useProjectCrs = () => {
    if (!projectCrsSuggestion) return
    markEdited(() => setProjectCrs(projectCrsSuggestion))
  }

  const handleSave = async () => {
    if (validationError || draft.startChainageM === null || draft.endChainageM === null || draft.stationIntervalM === null) return
    setSaving(true)
    setSaveError(null)
    const plan: RoadFieldPlan = {
      ...draft,
      startChainageM: draft.startChainageM,
      endChainageM: draft.endChainageM,
      stationIntervalM: draft.stationIntervalM,
    }
    try {
      const result = await onSave({ roadFieldPlan: plan })
      if (result === false) {
        setSaveError('The plan was not saved. Check the project connection and try again.')
        return
      }
      setSaved(true)
    } catch {
      setSaveError('The plan was not saved. Check the project connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400'

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Field preparation</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Prepare the road survey</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Set the chainage range, cross-section extents and codes the crew will use. METARDU will turn this into a station list so the field session can focus on capturing and coding points.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
          On the capture device, open point collection while online before leaving coverage. This saves the current plan for offline reopening; the collector shows the saved time and asks you to confirm an offline copy before capture.
        </p>
        <p className="mt-2 text-xs text-zinc-500">Project: {projectName}{roadName ? ` · Road: ${roadName}` : ''}</p>
      </header>

      {(savedStationLimits || projectCrsSuggestion) && (
        <section aria-label="Suggestions from saved project records" className="grid gap-3 rounded-xl border border-sky-900/70 bg-sky-950/25 p-4 sm:grid-cols-2">
          {savedStationLimits && (
            <div>
              <p className="text-xs font-semibold text-sky-100">Saved design station limits</p>
              <p className="mt-1 font-mono text-xs text-sky-100/70">{savedStationLimits.start.toFixed(3)} m to {savedStationLimits.end.toFixed(3)} m</p>
              <button type="button" onClick={useSavedStationLimits} className="mt-2 rounded-md border border-sky-700 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900/60">
                Use saved station limits
              </button>
            </div>
          )}
          {projectCrsSuggestion && (
            <div>
              <p className="text-xs font-semibold text-sky-100">Declared project CRS</p>
              <p className="mt-1 text-xs text-sky-100/70">{projectCrsSuggestion}</p>
              <button type="button" onClick={useProjectCrs} className="mt-2 rounded-md border border-sky-700 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900/60">
                Use declared project CRS
              </button>
            </div>
          )}
          <p className="text-xs leading-5 text-sky-100/60 sm:col-span-2">
            Suggestions come from saved project records. Confirm the chainage limits and CRS against the approved survey brief before saving; station interval and control references still need the crew’s authoritative instructions.
          </p>
        </section>
      )}

      <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-3">
        <label className="text-sm text-zinc-300">
          Start chainage (m)
          <input className={inputClass} type="number" min="0" step="0.001" inputMode="decimal" value={startChainage} onChange={event => markEdited(() => setStartChainage(event.target.value))} placeholder="e.g. 0" />
        </label>
        <label className="text-sm text-zinc-300">
          End chainage (m)
          <input className={inputClass} type="number" min="0" step="0.001" inputMode="decimal" value={endChainage} onChange={event => markEdited(() => setEndChainage(event.target.value))} placeholder="Enter project end chainage" />
        </label>
        <label className="text-sm text-zinc-300">
          Station interval (m)
          <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={stationInterval} onChange={event => markEdited(() => setStationInterval(event.target.value))} placeholder="Enter client-required interval" />
        </label>
        <label className="text-sm text-zinc-300">
          Left survey extent (m, optional)
          <input className={inputClass} type="number" min="0" step="0.1" inputMode="decimal" value={leftExtent} onChange={event => markEdited(() => setLeftExtent(event.target.value))} placeholder="From centreline" />
        </label>
        <label className="text-sm text-zinc-300">
          Right survey extent (m, optional)
          <input className={inputClass} type="number" min="0" step="0.1" inputMode="decimal" value={rightExtent} onChange={event => markEdited(() => setRightExtent(event.target.value))} placeholder="From centreline" />
        </label>
        <label className="text-sm text-zinc-300">
          Approved project CRS
          <input className={inputClass} value={projectCrs} onChange={event => markEdited(() => setProjectCrs(event.target.value))} placeholder="Enter the project CRS exactly" required aria-required="true" />
        </label>
        <label className="text-sm text-zinc-300 sm:col-span-3">
          Control / benchmark ID and source
          <input className={inputClass} value={controlReference} onChange={event => markEdited(() => setControlReference(event.target.value))} placeholder="Enter the control IDs and authoritative source" required aria-required="true" />
        </label>
      </section>

      {stationPreview && stationPreview.length > 0 && (
        <section aria-labelledby="road-station-preview-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 id="road-station-preview-heading" className="text-sm font-semibold text-white">Station preflight</h4>
              <p className="mt-1 text-xs text-zinc-500">Check the generated chainages before saving the crew’s field plan.</p>
            </div>
            <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
              {stationPreview.length.toLocaleString()} planned {stationPreview.length === 1 ? 'station' : 'stations'}
            </span>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Sample of generated road stations">
            {previewStations.map((chainage, index) => {
              const isFinalStation = index === previewStations.length - 1
                && stationPreview.length > 5
              const stationNumber = isFinalStation ? stationPreview.length : index + 1
              return (
                <li key={`${stationNumber}-${chainage}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                  <span className="text-xs text-zinc-500">{isFinalStation ? 'Final station' : `Station ${stationNumber}`}</span>
                  <code className="font-mono text-sm font-semibold text-zinc-100">{formatRoadChainage(chainage)}</code>
                </li>
              )
            })}
          </ol>
          {stationPreview.length > previewStations.length && (
            <p className="mt-2 text-xs text-zinc-500">
              {stationPreview.length - previewStations.length} intermediate stations are part of the generated list.
            </p>
          )}
          <p role="status" className="mt-3 text-xs leading-5 text-sky-100/80">
            {hasShortFinalInterval && finalIntervalM !== null && draft.stationIntervalM !== null
              ? `The exact end chainage is included. The final step is ${finalIntervalM.toFixed(3)} m, shorter than the requested ${draft.stationIntervalM.toFixed(3)} m interval.`
              : 'The exact end chainage is included in the generated station list.'}
          </p>
        </section>
      )}

      <section>
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-white">Point codes</h4>
          <p className="mt-1 text-xs text-zinc-500">Choose the codes that match the client’s scope. The selected code and station are saved with every captured point.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROAD_FIELD_CODE_OPTIONS.map(({ code, label }) => {
            const selected = featureCodes.includes(code)
            return (
              <button
                key={code}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCode(code)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${selected ? 'border-amber-400/70 bg-amber-400/10 text-amber-100' : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600'}`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded border text-[10px] ${selected ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-zinc-600'}`}>{selected ? '✓' : ''}</span>
                <span><span className="font-mono font-semibold">{code}</span><span className="ml-2 text-xs opacity-75">{label}</span></span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="rounded-lg border border-sky-900/70 bg-sky-950/30 px-4 py-3 text-sm leading-6 text-sky-100/80">
        Station interval and survey extents are project instructions, not a legal or design standard. Confirm them against the client brief and authoritative project records. METARDU records the CRS and control references but does not verify the instrument configuration, control, or captured coordinates.
      </div>

      {validationError && <p role="status" className="text-sm text-amber-300">{validationError}</p>}
      {saveError && <p role="alert" className="text-sm text-red-300">{saveError}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
        <button type="button" onClick={() => void handleSave()} disabled={saving || !!validationError} className="rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
          {saving ? 'Saving plan…' : 'Save field plan'}
        </button>
        {canStart ? (
          <a href={`/field/collect?projectId=${encodeURIComponent(projectId)}&profile=road`} className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
            Start road point collection →
          </a>
        ) : (
          <span className="text-xs text-zinc-500">Save a valid plan to open its station list in field collection.</span>
        )}
        {saved && !validationError && <span className="text-xs text-emerald-300">Plan saved to this project.</span>}
      </div>
    </div>
  )
}
