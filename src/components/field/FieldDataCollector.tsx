'use client';

/**
 * FieldDataCollector — unified field data collection experience
 *
 * THE COMPONENT THAT MAKES METARDU BETTER THAN HI-TARGET/CHCNAV
 *
 * This is the purpose-built field data collector that orchestrates:
 *   1. Instrument connection (total station or GNSS rover)
 *   2. Station setup (IH, TH, backsight, atmospheric corrections)
 *   3. One-tap measurement capture (with haptic + audio feedback)
 *   4. Live QC (precision ratio, tolerance status per RDM 1.1)
 *   5. Stakeout mode (with audio guidance to target)
 *   6. Offline-first persistence (IndexedDB, auto-sync when online)
 *   7. Push-to-traverse (seamless handoff to adjustment)
 *
 * Why this beats Hi-Target/CHCNAV:
 *   - Works on ANY device (phone, tablet, laptop) — no Windows-only lock-in
 *   - Cloud sync — measurements appear on the office computer instantly
 *   - Rigorous QC — live tolerance checking per Survey Regulations 1994
 *   - Deed plan integration — push directly to deed plan generator
 *   - Multi-user — field crew + office crew see the same data
 *   - PWA — installable, offline-first, sunlight-readable field mode
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Settings, Target, List, Cloud, ChevronRight, X, Camera } from 'lucide-react'
import { FieldConnectionBar } from './FieldConnectionBar'
import { FieldMeasureButton } from './FieldMeasureButton'
import { FieldObservationList } from './FieldObservationList'
import { FieldStationSetup } from './FieldStationSetup'
import { RoadFieldCodeSelector } from './RoadFieldCodeSelector'
import { useFieldSessionState, useFieldSession } from '@/hooks/useFieldSessionState'
import { ToleranceBadge } from '@/components/survey/ToleranceBadge'
import { InstrumentConnectionPanel } from '@/components/InstrumentConnectionPanel'
import type { FieldInstrumentReading, FieldSessionState, SurveyType } from '@/lib/field/fieldSession'
import type { RoadFieldFeatureCode, RoadFieldPlan } from '@/types/engineering'
import { buildRoadFieldStations, formatRoadChainage, parseRoadFieldPlan, resolveRoadFieldPlanCrsCode, roadFieldPlanCrsIsBoundToProject, summarizeRoadStationCaptures } from '@/lib/engineering/roadFieldPlan'
import { appendFieldPointId, nextFieldPointNumber } from '@/lib/field/pointIds'
import { createClient } from '@/lib/api-client/client'
import { resolveStageReference } from '@/lib/workspaces/stageReference'

function isOfflinePlanFetchFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message)
}

interface FieldDataCollectorProps {
  projectId: string
  surveyType?: SurveyType
  roadSurvey?: boolean
}

type Panel = 'measure' | 'stakeout' | 'list' | 'sync' | null

export function FieldDataCollector({
  projectId,
  surveyType = 'cadastral',
  roadSurvey = false,
}: FieldDataCollectorProps) {
  const sessionState = useFieldSessionState(projectId, surveyType)
  const session = useFieldSession(projectId, surveyType)

  const [showSetup, setShowSetup] = useState(!sessionState.setup)
  const [activePanel, setActivePanel] = useState<Panel>('measure')
  const [showInstrumentPanel, setShowInstrumentPanel] = useState(false)
  const [activeFeatureCode, setActiveFeatureCode] = useState<string>('')
  const [roadFieldPlan, setRoadFieldPlan] = useState<RoadFieldPlan | null>(null)
  const [roadPlanLoading, setRoadPlanLoading] = useState(roadSurvey)
  const [roadPlanLoadError, setRoadPlanLoadError] = useState(false)
  const [roadPlanSource, setRoadPlanSource] = useState<'server_cached' | 'server_uncached' | 'offline_cache' | null>(null)
  const [roadPlanCachedAt, setRoadPlanCachedAt] = useState<string | null>(null)
  const [roadPlanCrsError, setRoadPlanCrsError] = useState<string | null>(null)
  const [roadProjectCrsCode, setRoadProjectCrsCode] = useState<string | null>(null)
  const [roadInstrumentCrsConfirmed, setRoadInstrumentCrsConfirmed] = useState(false)
  const [offlinePlanAcknowledged, setOfflinePlanAcknowledged] = useState(false)
  const [instrumentImportStatus, setInstrumentImportStatus] = useState<string | null>(null)
  const [activeRoadStationIndex, setActiveRoadStationIndex] = useState(0)
  const [stakeoutTarget, setStakeoutTarget] = useState<{ e: number; n: number; z: number } | null>(null)
  const [isSunlightMode, setIsSunlightMode] = useState(false)
  const [isLoadingMeasurements, setIsLoadingMeasurements] = useState(true)
  const [measurementsLoadFailed, setMeasurementsLoadFailed] = useState(false)
  const roadStations = useMemo(() => roadFieldPlan ? buildRoadFieldStations(roadFieldPlan) : [], [roadFieldPlan])
  const roadCaptureStatus = useMemo(
    () => roadFieldPlan ? summarizeRoadStationCaptures(roadStations, roadFieldPlan.featureCodes, sessionState.measurements) : [],
    [roadFieldPlan, roadStations, sessionState.measurements],
  )
  const capturedRoadStationCount = roadCaptureStatus.filter(station => station.pointCount > 0).length
  const activeRoadStation = roadStations[activeRoadStationIndex] ?? null
  const activeRoadStationStatus = roadCaptureStatus[activeRoadStationIndex]
  const nextUncapturedRoadStationIndex = useMemo(() => {
    if (roadCaptureStatus.length < 2) return null
    for (let offset = 1; offset < roadCaptureStatus.length; offset += 1) {
      const index = (activeRoadStationIndex + offset) % roadCaptureStatus.length
      if (roadCaptureStatus[index].pointCount === 0) return index
    }
    return null
  }, [activeRoadStationIndex, roadCaptureStatus])
  const pointIdPrefix = roadSurvey ? 'RD' : surveyType === 'cadastral' ? 'BP' : 'P'
  const nextPointNumber = useMemo(
    () => nextFieldPointNumber(pointIdPrefix, sessionState.measurements.map(measurement => measurement.pointId)),
    [pointIdPrefix, sessionState.measurements],
  )

  useEffect(() => {
    if (!roadSurvey) return
    let current = true
    const loadRoadPlan = async () => {
      setRoadPlanLoading(true)
      setRoadPlanLoadError(false)
      setRoadFieldPlan(null)
      setRoadPlanSource(null)
      setRoadPlanCachedAt(null)
      setRoadPlanCrsError(null)
      setRoadProjectCrsCode(null)
      setRoadInstrumentCrsConfirmed(false)
      setOfflinePlanAcknowledged(false)
      setInstrumentImportStatus(null)

      const loadOfflineCopy = async () => {
        const { getCachedRoadFieldPlan } = await import('@/lib/offline/fieldBookDB')
        const cached = await getCachedRoadFieldPlan(projectId)
        const cachedPlan = parseRoadFieldPlan(cached?.plan)
        if (!cached || !cachedPlan || !Number.isFinite(Date.parse(cached.cachedAt))) {
          if (current) {
            setRoadFieldPlan(null)
            setRoadPlanLoadError(true)
          }
          return
        }
        if (current) {
          setRoadFieldPlan(cachedPlan)
          setRoadPlanSource('offline_cache')
          setRoadPlanCachedAt(cached.cachedAt)
          const cachedCrsCode = resolveRoadFieldPlanCrsCode(cachedPlan.projectCrs)
          const isCrsBound = roadFieldPlanCrsIsBoundToProject(cachedPlan.projectCrs, cached.projectCrsCode)
          setRoadProjectCrsCode(isCrsBound ? cachedCrsCode : null)
          setRoadPlanCrsError(isCrsBound
            ? null
            : 'This offline plan has no verified project CRS binding. Reopen the collector online to validate and cache it before collecting GNSS points.')
          setActiveRoadStationIndex(0)
          setRoadPlanLoadError(false)
        }
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          await loadOfflineCopy()
        } catch {
          if (current) {
            setRoadFieldPlan(null)
            setRoadPlanLoadError(true)
          }
        } finally {
          if (current) setRoadPlanLoading(false)
        }
        return
      }

      try {
        const result = await createClient()
          .from('projects')
          .select('engineering_data,datum,utm_zone,hemisphere')
          .eq('id', projectId)
          .limit(1) as unknown as { data: Array<{ engineering_data?: unknown; datum?: unknown; utm_zone?: unknown; hemisphere?: unknown }> | null; error: unknown }
        if (result.error) throw result.error
        const engineeringData = result.data?.[0]?.engineering_data
        const planValue = typeof engineeringData === 'object' && engineeringData !== null
          ? (engineeringData as { roadFieldPlan?: unknown }).roadFieldPlan
          : undefined
        const plan = parseRoadFieldPlan(planValue)
        if (!plan) {
          const { deleteCachedRoadFieldPlan } = await import('@/lib/offline/fieldBookDB')
          await deleteCachedRoadFieldPlan(projectId).catch(() => undefined)
          if (current) {
            setRoadFieldPlan(null)
            setRoadPlanSource(null)
            setRoadPlanCachedAt(null)
            setRoadPlanLoadError(false)
          }
          return
        }

        const referenceResult = await createClient()
          .from('project_reference_systems')
          .select('*')
          .eq('project_id', projectId)
          .limit(1)
        if (referenceResult.error) throw referenceResult.error
        const declaredReference = (referenceResult.data as unknown as Array<Record<string, unknown>> | null)?.[0] ?? null
        const projectRow = result.data?.[0]
        const projectReference = resolveStageReference(
          declaredReference,
          {
            datum: typeof projectRow?.datum === 'string' ? projectRow.datum : null,
            utm_zone: typeof projectRow?.utm_zone === 'number' ? projectRow.utm_zone : null,
            hemisphere: typeof projectRow?.hemisphere === 'string' ? projectRow.hemisphere : null,
          },
        )
        const planCrsCode = resolveRoadFieldPlanCrsCode(plan.projectCrs)
        let crsError: string | null = null
        if (!projectReference.code) {
          crsError = 'The project has no valid reference system. Set it in Project Settings before collecting road points.'
        } else if (!planCrsCode) {
          crsError = 'The saved road plan CRS is not a supported projected EPSG code. Reopen and save the field plan using the project CRS.'
        } else if (planCrsCode !== projectReference.code) {
          crsError = `The saved road plan uses ${planCrsCode}, but the project reference system is ${projectReference.code}. Update the field plan before collecting.`
        }
        const validatedProjectCrsCode = crsError ? null : projectReference.code

        let cachedAt: string | null = null
        let source: 'server_cached' | 'server_uncached' = 'server_uncached'
        if (validatedProjectCrsCode) {
          try {
            const { cacheRoadFieldPlan } = await import('@/lib/offline/fieldBookDB')
            const cached = await cacheRoadFieldPlan(projectId, plan, validatedProjectCrsCode)
            cachedAt = cached.cachedAt
            source = 'server_cached'
          } catch {
            // Keep the online plan usable, but tell the operator this device is not prepared for offline reopening.
          }
        }
        if (current) {
          setRoadFieldPlan(plan)
          setRoadPlanSource(source)
          setRoadPlanCachedAt(cachedAt)
          setRoadPlanCrsError(crsError)
          setRoadProjectCrsCode(validatedProjectCrsCode)
          setActiveRoadStationIndex(0)
        }
      } catch (error) {
        if (isOfflinePlanFetchFailure(error)) {
          try {
            await loadOfflineCopy()
          } catch {
            if (current) {
              setRoadFieldPlan(null)
              setRoadPlanLoadError(true)
            }
          }
          return
        }
        if (current) {
          setRoadFieldPlan(null)
          setRoadPlanSource(null)
          setRoadPlanCachedAt(null)
          setRoadPlanLoadError(true)
        }
      } finally {
        if (current) setRoadPlanLoading(false)
      }
    }
    void loadRoadPlan()
    return () => { current = false }
  }, [projectId, roadSurvey])

  useEffect(() => {
    if (roadSurvey && roadFieldPlan?.featureCodes.length) {
      setActiveFeatureCode(roadFieldPlan.featureCodes[0])
    }
  }, [roadSurvey, roadFieldPlan])

  // Load existing measurements before capture so resumed sessions do not reuse
  // point IDs and a failed local read cannot silently begin a duplicate sequence.
  const loadMeasurements = useCallback(async () => {
    setIsLoadingMeasurements(true)
    setMeasurementsLoadFailed(false)
    const loaded = await session.loadMeasurements()
    const hasKnownMeasurements = session.getSnapshot().measurements.length > 0
    const ready = loaded || hasKnownMeasurements
    setMeasurementsLoadFailed(!ready)
    setIsLoadingMeasurements(false)
  }, [session])

  useEffect(() => {
    void loadMeasurements()
  }, [loadMeasurements])

  // Auto-sync when online
  useEffect(() => {
    if (sessionState.isOnline && sessionState.pendingSyncCount > 0 && !sessionState.isSyncing) {
      const timer = setTimeout(() => session.syncNow(), 2000)
      return () => clearTimeout(timer)
    }
  }, [sessionState.isOnline, sessionState.pendingSyncCount, sessionState.isSyncing, session])

  const handleCapture = useCallback(async (pointId: string, code?: string): Promise<boolean> => {
    if (sessionState.measurements.some(measurement => measurement.pointId === pointId)) return false
    const captureNotes = roadSurvey
      ? `ROAD_CODE=${code ?? 'UNCODED'}; CHAINAGE_M=${activeRoadStation ?? 'UNSET'}`
      : code
    const notes = appendFieldPointId(captureNotes, pointId)
    const measurement = await session.captureMeasurement({
      pointId,
      notes,
      projectCrs: roadSurvey ? roadProjectCrsCode ?? undefined : undefined,
      coordinateCrs: roadSurvey && roadInstrumentCrsConfirmed ? roadProjectCrsCode ?? undefined : undefined,
    })
    return measurement !== null
  }, [session, sessionState.measurements, roadSurvey, activeRoadStation, roadProjectCrsCode, roadInstrumentCrsConfirmed])

  const handleImportPoints = useCallback(async (points: FieldInstrumentReading[]) => {
    if (isLoadingMeasurements || measurementsLoadFailed || !sessionState.setup) {
      setInstrumentImportStatus('Finish station setup and load saved points before importing instrument readings.')
      return
    }
    if (roadSurvey && (!roadFieldPlan || !roadProjectCrsCode || activeRoadStation === null || !activeFeatureCode)) {
      setInstrumentImportStatus('The road plan, project CRS, chainage and feature code must be ready before importing a point.')
      return
    }

    const existingMeasurements = session.getSnapshot().measurements
    const savedReadingIds = new Set(existingMeasurements.flatMap(measurement => {
      const match = /(?:^|;\s*)INSTRUMENT_READING_ID=([^;]*)/.exec(measurement.notes ?? '')
      return match?.[1]?.trim() ? [match[1].trim()] : []
    }))
    const usedPointIds = existingMeasurements.map(measurement => measurement.pointId)
    let saved = 0
    let skipped = 0

    for (const point of points) {
      if (!point.id || savedReadingIds.has(point.id)) {
        skipped += 1
        continue
      }
      if (roadSurvey && point.source !== 'nmea' && !roadInstrumentCrsConfirmed) {
        skipped += 1
        continue
      }

      const pointId = `${pointIdPrefix}${nextFieldPointNumber(pointIdPrefix, usedPointIds)}`
      const safeReadingId = point.id.replace(/[;\r\n]/g, ' ').slice(0, 100)
      const safePointName = point.pointName.replace(/[;\r\n]/g, ' ').slice(0, 100)
      const roadNotes = roadSurvey
        ? `ROAD_CODE=${activeFeatureCode}; CHAINAGE_M=${activeRoadStation}`
        : ''
      const notes = appendFieldPointId(
        [roadNotes, `INSTRUMENT_READING_ID=${safeReadingId}`, `INSTRUMENT_POINT_NAME=${safePointName}`, `INSTRUMENT_SOURCE=${point.source}`]
          .filter(Boolean)
          .join('; '),
        pointId,
      )
      const reading: FieldInstrumentReading = point
      const measurement = await session.captureMeasurement({
        pointId,
        reading,
        notes,
        projectCrs: roadSurvey ? roadProjectCrsCode ?? undefined : undefined,
        coordinateCrs: roadSurvey && point.source !== 'nmea' && roadInstrumentCrsConfirmed
          ? roadProjectCrsCode ?? undefined
          : undefined,
      })
      if (measurement) {
        saved += 1
        savedReadingIds.add(point.id)
        usedPointIds.push(pointId)
      } else {
        skipped += 1
      }
    }

    setInstrumentImportStatus(
      saved > 0
        ? `Saved ${saved} instrument point${saved === 1 ? '' : 's'}${skipped ? `; ${skipped} skipped` : ''}.`
        : `No instrument points saved${skipped ? `; ${skipped} skipped` : ''}. Check the point coordinates, CRS confirmation and station setup, then retry.`,
    )
  }, [
    isLoadingMeasurements,
    measurementsLoadFailed,
    sessionState.setup,
    session,
    roadSurvey,
    roadFieldPlan,
    roadProjectCrsCode,
    activeRoadStation,
    activeFeatureCode,
    roadInstrumentCrsConfirmed,
    pointIdPrefix,
  ])

  const handleSetupComplete = useCallback((setup: typeof sessionState.setup) => {
    if (setup) {
      session.setupStation(setup)
      setShowSetup(false)
      setActivePanel('measure')
    }
  }, [session, sessionState])

  const handleSync = useCallback(() => {
    session.syncNow()
  }, [session])

  // ─── Setup Screen ────────────────────────────────────────────────────────
  if (showSetup) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
        <FieldConnectionBar
          isOnline={sessionState.isOnline}
          isSyncing={sessionState.isSyncing}
          pendingSyncCount={sessionState.pendingSyncCount}
          onSyncClick={handleSync}
        />
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
          <FieldStationSetup
            onComplete={handleSetupComplete}
            initialSetup={sessionState.setup}
          />
        </div>
      </div>
    )
  }

  // ─── Main Collector UI ───────────────────────────────────────────────────
  return (
    <div className={`min-h-screen flex flex-col ${isSunlightMode ? 'bg-white text-black font-bold border-b-4 border-black' : 'bg-[var(--bg-primary)]'}`}>
      {/* Connection Bar */}
      <FieldConnectionBar
        isOnline={sessionState.isOnline}
        isSyncing={sessionState.isSyncing}
        pendingSyncCount={sessionState.pendingSyncCount}
        onSyncClick={handleSync}
      />

      {/* Station Info Bar */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b ${isSunlightMode ? 'bg-yellow-300 text-black border-black border-b-2 font-black' : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}`}>
        <div className="flex-1 flex items-center gap-3">
          <span className={`text-sm font-mono font-bold ${isSunlightMode ? 'text-black underline' : 'text-[var(--accent)]'}`}>
            {sessionState.setup?.stationName}
          </span>
          <span className="text-xs opacity-70">
            IH: {sessionState.setup?.instrumentHeight}m | TH: {sessionState.setup?.targetHeight}m
          </span>
        </div>

        <button
          onClick={() => setIsSunlightMode(!isSunlightMode)}
          className={`px-3 py-1 text-xs rounded font-bold border transition ${
            isSunlightMode ? 'bg-black text-white border-black shadow-lg' : 'bg-black/10 dark:bg-white/10 text-foreground border-white/20'
          }`}
          title="Toggle Sunlight High-Contrast Outdoor Mode"
        >
          {isSunlightMode ? 'Sunlight Mode ON' : 'Outdoor Mode'}
        </button>
        <button
          onClick={() => setShowSetup(true)}
          className={`flex items-center gap-1 text-xs transition-colors ${
            isSunlightMode ? 'text-black hover:text-gray-700' : 'text-[var(--text-secondary)] hover:text-[var(--accent)]'
          }`}
        >
          <Settings className="w-3 h-3" /> Edit
        </button>
      </div>

      {roadSurvey && (
        <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
          {roadPlanLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading the saved road field plan…</p>
          ) : roadFieldPlan ? (
            <div className="space-y-3">
              {roadPlanCrsError && (
                <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100">
                  <p>{roadPlanCrsError}</p>
                  <a href={`/project/${projectId}/engineering?step=field_plan`} className="mt-2 inline-block font-semibold underline underline-offset-2">Update the road field plan</a>
                </div>
              )}
              {roadPlanSource === 'offline_cache' && (
                <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p>
                    Offline copy saved <time dateTime={roadPlanCachedAt ?? undefined}>{roadPlanCachedAt ? new Date(roadPlanCachedAt).toLocaleString() : 'at an unknown time'}</time>.
                    It may not include later project edits. Check it against the issued field brief before collecting.
                  </p>
                  <label className="mt-2 flex min-h-11 items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={offlinePlanAcknowledged}
                      onChange={event => setOfflinePlanAcknowledged(event.target.checked)}
                      className="h-4 w-4 accent-amber-400"
                    />
                    I checked this copy against the field brief for this session.
                  </label>
                </div>
              )}
              {roadPlanSource === 'server_uncached' && (
                <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  The project plan loaded, but this device could not save an offline copy. Reopen the plan while online before leaving for the field.
                </p>
              )}
              {roadPlanSource === 'server_cached' && (
                <p role="status" className="text-xs text-[var(--text-muted)]">The current project plan is saved on this device for offline reopening.</p>
              )}
              <div role="group" aria-label="Road survey coordinate reference and control" className="grid gap-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                <p className="break-words"><span className="font-semibold">Project CRS:</span> {roadFieldPlan.projectCrs}</p>
                <p className="break-words"><span className="font-semibold">Control / benchmark:</span> {roadFieldPlan.controlReference}</p>
              </div>
              {roadProjectCrsCode && (
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={roadInstrumentCrsConfirmed}
                    onChange={event => setRoadInstrumentCrsConfirmed(event.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Total-station coordinates are set in {roadProjectCrsCode}. GNSS readings are transformed from WGS 84.
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="road-chainage-station" className="text-sm font-semibold text-[var(--text-primary)]">Chainage station</label>
                <select
                  id="road-chainage-station"
                  value={activeRoadStationIndex}
                  onChange={event => setActiveRoadStationIndex(Number(event.target.value))}
                  className="min-h-11 min-w-48 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
                >
                  {roadStations.map((chainage, index) => (
                    <option key={`${chainage}-${index}`} value={index}>
                      CH {formatRoadChainage(chainage)} · {index + 1}/{roadStations.length}
                    </option>
                  ))}
                </select>
                <span role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">
                  {capturedRoadStationCount} of {roadStations.length} planned stations have recorded points
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {roadFieldPlan.leftExtentM == null && roadFieldPlan.rightExtentM == null
                    ? 'No cross-section extents entered'
                    : `Survey extents: L ${roadFieldPlan.leftExtentM ?? '—'} m · R ${roadFieldPlan.rightExtentM ?? '—'} m`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveRoadStationIndex(index => Math.max(0, index - 1))}
                  disabled={activeRoadStationIndex <= 0}
                  className="min-h-11 rounded-md border border-[var(--border-color)] px-3 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous station
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRoadStationIndex(index => Math.min(roadStations.length - 1, index + 1))}
                  disabled={activeRoadStationIndex >= roadStations.length - 1}
                  className="min-h-11 rounded-md border border-[var(--border-color)] px-3 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next station
                </button>
                <button
                  type="button"
                  onClick={() => { if (nextUncapturedRoadStationIndex !== null) setActiveRoadStationIndex(nextUncapturedRoadStationIndex) }}
                  disabled={nextUncapturedRoadStationIndex === null}
                  className="min-h-11 rounded-md border border-[var(--accent)]/50 px-3 text-sm font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next station with no recorded points
                </button>
                {activeRoadStation !== null && activeRoadStationStatus && (
                  <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
                    CH {formatRoadChainage(activeRoadStation)}: {activeRoadStationStatus.pointCount} point{activeRoadStationStatus.pointCount === 1 ? '' : 's'} recorded
                    {activeRoadStationStatus.capturedFeatureCodes.length > 0
                      ? ` · ${activeRoadStationStatus.capturedFeatureCodes.join(', ')}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-amber-500">
              <span>{roadPlanLoadError ? 'Could not load a current road plan or a valid offline copy. Connect to the project or reopen this plan online before collecting.' : 'No valid road field plan is saved for this project.'}</span>
              <a href={`/project/${projectId}/engineering?step=field_plan`} className="font-semibold underline underline-offset-2">Open road field plan</a>
            </div>
          )}
        </div>
      )}

      {/* Live QC Badge (if tolerance status available) */}
      {sessionState.toleranceStatus && (
        <div className="px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
          <ToleranceBadge result={sessionState.toleranceStatus} compact />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'measure' && (
          <div className="flex flex-col items-center py-8 px-4 w-full">
            {roadSurvey && roadFieldPlan && (
              <div className="mb-5 w-full flex justify-center">
                <RoadFieldCodeSelector
                  codes={roadFieldPlan.featureCodes}
                  value={activeFeatureCode as RoadFieldFeatureCode}
                  capturedCodes={activeRoadStationStatus?.capturedFeatureCodes ?? []}
                  sunlightMode={isSunlightMode}
                  onChange={setActiveFeatureCode}
                />
              </div>
            )}
            {/* Measure Button */}
            {isLoadingMeasurements && <p role="status" className="mb-4 text-sm text-[var(--text-muted)]">Loading saved points before capture…</p>}
            {measurementsLoadFailed && (
              <div role="alert" className="mb-4 max-w-md rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 p-3 text-center text-sm text-[var(--error)]">
                Saved points could not be loaded, so capture is paused to prevent duplicate point IDs.
                <button type="button" onClick={() => void loadMeasurements()} className="ml-2 font-semibold underline underline-offset-2">Retry</button>
              </div>
            )}
            {instrumentImportStatus && <p role="status" aria-live="polite" className="mb-3 max-w-md text-center text-sm text-[var(--text-secondary)]">{instrumentImportStatus}</p>}
            <FieldMeasureButton
              onCapture={(pointId) => handleCapture(pointId, activeFeatureCode || undefined)}
              disabled={isLoadingMeasurements || measurementsLoadFailed || (roadSurvey && (!roadFieldPlan || roadPlanLoading || !roadProjectCrsCode || activeRoadStation === null || !activeFeatureCode || (roadPlanSource === 'offline_cache' && !offlinePlanAcknowledged)))}
              stationSetup={!!sessionState.setup}
              pointIdPrefix={pointIdPrefix}
              nextPointNumber={nextPointNumber}
            />

            {/* Smart Feature Coding for non-road survey profiles */}
            {!roadSurvey && <div className="mt-8 w-full max-w-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">{roadSurvey ? 'Road point code' : 'Feature Code'}</span>
                <button 
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full hover:bg-[var(--bg-tertiary)] transition-colors border border-[var(--border-color)] text-xs font-medium text-[var(--text-primary)] shadow-sm"
                  title="Attach Photo"
                >
                  <Camera className="w-4 h-4 text-[var(--accent)]" />
                  <span>Photo</span>
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
                {(roadSurvey ? roadFieldPlan?.featureCodes ?? [] : ['FENCE_START', 'FENCE_LINE', 'FENCE_END', 'TREE', 'WALL', 'BLDG', 'ROAD_EDGE']).map(code => (
                  <button
                    key={code}
                    onClick={() => setActiveFeatureCode(code === activeFeatureCode ? (roadSurvey ? code : '') : code)}
                    className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                      activeFeatureCode === code
                        ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md'
                        : isSunlightMode 
                          ? 'bg-white text-black border-black border-2 hover:bg-gray-100'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>}

            {/* Instrument Connection CTA */}
            {!showInstrumentPanel && (
              <InstrumentPanelToggle onShow={() => setShowInstrumentPanel(true)} />
            )}
          </div>
        )}

        {activePanel === 'list' && (
          <FieldObservationList
            measurements={sessionState.measurements}
            onDelete={async (id) => {
              // Delete from IndexedDB
              try {
                const { deleteObservation } = await import('@/lib/offline/fieldBookDB')
                await deleteObservation(id)
              } catch {}
            }}
          />
        )}

        {activePanel === 'stakeout' && stakeoutTarget && (
          <StakeoutPanel
            target={stakeoutTarget}
            sessionState={sessionState}
            onClose={() => {
              session.deactivateStakeout()
              setStakeoutTarget(null)
              setActivePanel('measure')
            }}
          />
        )}

        {activePanel === 'sync' && (
          <SyncPanel
            sessionState={sessionState}
            onSync={handleSync}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-around border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <NavButton
          active={activePanel === 'measure'}
          onClick={() => setActivePanel('measure')}
          icon={<Target className="w-5 h-5" />}
          label="Measure"
        />
        <NavButton
          active={activePanel === 'stakeout'}
          onClick={() => setActivePanel('stakeout')}
          icon={<Crosshair className="w-5 h-5" />}
          label="Stakeout"
          disabled={!sessionState.setup}
        />
        <NavButton
          active={activePanel === 'list'}
          onClick={() => setActivePanel('list')}
          icon={<List className="w-5 h-5" />}
          label={`Points (${sessionState.measurements.length})`}
        />
        <NavButton
          active={activePanel === 'sync'}
          onClick={() => setActivePanel('sync')}
          icon={<Cloud className="w-5 h-5" />}
          label={sessionState.isOnline ? 'Sync' : 'Offline'}
          badge={sessionState.pendingSyncCount > 0 ? sessionState.pendingSyncCount : undefined}
        />
      </div>

      {/* Instrument Connection Modal */}
      {showInstrumentPanel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
          <div className="bg-[var(--bg-primary)] w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
              <h3 className="font-semibold text-[var(--text-primary)]">Connect Instrument</h3>
              <button
                onClick={() => setShowInstrumentPanel(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <InstrumentConnectionPanel
                importMode={roadSurvey ? 'latest' : 'all'}
                onImportPoints={handleImportPoints}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function NavButton({
  active,
  onClick,
  icon,
  label,
  disabled,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors disabled:opacity-30 ${
        active
          ? 'text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
      }`}
    >
      <div className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-[var(--accent)] text-[var(--bg-primary)] text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

function InstrumentPanelToggle({ onShow }: { onShow: () => void }) {
  return (
    <button
      onClick={onShow}
      className="mt-6 flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
    >
      <Settings className="w-4 h-4" /> Connect Instrument
      <ChevronRight className="w-4 h-4" />
    </button>
  )
}

function StakeoutPanel({
  target,
  onClose,
}: {
  target: { e: number; n: number; z: number }
  sessionState: FieldSessionState
  onClose: () => void
}) {
  const [currentE, setCurrentE] = useState<string>('')
  const [currentN, setCurrentN] = useState<string>('')
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true)
  const [lastSpoken, setLastSpoken] = useState<string>('')

  // Compute live distance and bearing to target
  const curE = parseFloat(currentE) || 0
  const curN = parseFloat(currentN) || 0
  const hasCurrent = !isNaN(curE) && !isNaN(curN) && curE !== 0 && curN !== 0

  const deltaE = target.e - curE
  const deltaN = target.n - curN
  const distToTarget = Math.hypot(deltaE, deltaN)
  let bearingToTarget = (Math.atan2(deltaE, deltaN) * 180) / Math.PI
  if (bearingToTarget < 0) bearingToTarget += 360

  const speakGuidance = useCallback((msg: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel() // Stop previous speech
    const utterance = new SpeechSynthesisUtterance(msg)
    utterance.rate = 1.05
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
    setLastSpoken(msg)
  }, [voiceEnabled])

  const triggerVoiceGuidance = () => {
    if (!hasCurrent) {
      speakGuidance('Enter current rover coordinates or connect GNSS receiver.')
      return
    }
    if (distToTarget <= 0.02) {
      speakGuidance('On target. Within 2 centimeters. Plumb and mark beacon.')
    } else if (distToTarget < 1.0) {
      speakGuidance(`Fine stakeout. Move ${(distToTarget * 100).toFixed(0)} centimeters at bearing ${bearingToTarget.toFixed(0)} degrees.`)
    } else {
      speakGuidance(`Move ${distToTarget.toFixed(1)} meters, bearing ${bearingToTarget.toFixed(0)} degrees.`)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Target className="w-5 h-5 text-[var(--accent)]" /> Voice-Guided Stakeout
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--error)]" aria-label="Close stakeout">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 space-y-2">
        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Target Beacon Coordinates</div>
        <div className="grid grid-cols-3 gap-2 font-mono text-sm">
          <div><span className="text-[var(--text-muted)] text-xs">E:</span> {target.e.toFixed(3)}</div>
          <div><span className="text-[var(--text-muted)] text-xs">N:</span> {target.n.toFixed(3)}</div>
          <div><span className="text-[var(--text-muted)] text-xs">Z:</span> {target.z.toFixed(3)}</div>
        </div>
      </div>

      {/* Rover Position Simulation / Live Readout */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Current Rover Position</div>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`text-xs px-2 py-1 rounded font-medium border ${
              voiceEnabled ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border-[var(--accent)]' : 'bg-transparent text-[var(--text-muted)] border-[var(--border-color)]'
            }`}
          >
            {voiceEnabled ? '🔊 Voice On' : '🔇 Voice Muted'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            className="input font-mono text-xs px-2 py-1.5"
            placeholder="Rover Easting (m)"
            value={currentE}
            onChange={(e) => setCurrentE(e.target.value)}
          />
          <input
            type="number"
            className="input font-mono text-xs px-2 py-1.5"
            placeholder="Rover Northing (m)"
            value={currentN}
            onChange={(e) => setCurrentN(e.target.value)}
          />
        </div>

        {hasCurrent && (
          <div className="p-3 bg-[var(--bg-secondary)] rounded-md border border-[var(--border-color)] space-y-1">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Distance to Target:</span>
              <span className={`font-mono text-base ${distToTarget <= 0.02 ? 'text-[var(--success)]' : 'text-[var(--accent)]'}`}>
                {distToTarget.toFixed(3)} m
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
              <span>Direction (Azimuth):</span>
              <span className="font-mono">{bearingToTarget.toFixed(1)}°</span>
            </div>
            {distToTarget <= 0.02 && (
              <div className="mt-2 text-center text-xs font-bold text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] py-1 rounded">
                ✓ ON TARGET (Within 2cm tolerance)
              </div>
            )}
          </div>
        )}

        <button
          onClick={triggerVoiceGuidance}
          className="w-full py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-bold text-xs rounded hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
        >
          <span>🗣️ Speak Navigation Guidance</span>
        </button>

        {lastSpoken && (
          <p className="text-[11px] text-[var(--text-muted)] italic text-center">
            "{lastSpoken}"
          </p>
        )}
      </div>
    </div>
  )
}

function SyncPanel({
  sessionState,
  onSync,
}: {
  sessionState: FieldSessionState
  onSync: () => void
}) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <Cloud className="w-5 h-5 text-[var(--accent)]" /> Sync Status
      </h3>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">Connection</span>
          <span className={`text-sm font-medium ${sessionState.isOnline ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
            {sessionState.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">Pending</span>
          <span className="text-sm font-mono text-[var(--text-primary)]">
            {sessionState.pendingSyncCount} measurement{sessionState.pendingSyncCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">Total captured</span>
          <span className="text-sm font-mono text-[var(--text-primary)]">
            {sessionState.measurements.length}
          </span>
        </div>
        {sessionState.lastSyncAt && (
          <div className="flex justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Last sync</span>
            <span className="text-sm text-[var(--text-muted)]">
              {new Date(sessionState.lastSyncAt).toLocaleTimeString('en-KE')}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={onSync}
        disabled={!sessionState.isOnline || sessionState.isSyncing || sessionState.pendingSyncCount === 0}
        className="w-full px-4 py-3 bg-[var(--accent)] text-[var(--bg-primary)] rounded-lg font-semibold hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Cloud className="w-4 h-4" />
        {sessionState.isSyncing ? 'Syncing…' : `Sync ${sessionState.pendingSyncCount} Pending`}
      </button>

      <p className="text-xs text-[var(--text-muted)]">
        Tip: Measurements are saved locally first (IndexedDB), then synced to the cloud
        when online. You can work offline indefinitely — sync happens automatically.
      </p>
    </div>
  )
}

// Need to import Crosshair here for the NavButton
import { Crosshair } from 'lucide-react'
