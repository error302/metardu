'use client'

/**
 * Field set-out (blueprint §11.3, §9.5, §27).
 *
 * One point at a time, the way it is actually staked: the next mark, the
 * target E/N/RL, your observed E/N/RL, the three deltas, and a plain-language
 * verdict. Every shot is recorded against the project's set-out definition,
 * judged by the same engine the office sees, and kept as append-only evidence.
 *
 * The screen deliberately does nothing else: no drafting, no adjustment, no
 * plan composition. Those belong on a desk.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ColumnPlumbCollector from '@/components/field/ColumnPlumbCollector'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, Radio, Ruler, TriangleAlert } from 'lucide-react'
import {
  cacheSetoutDefinitionList,
  cacheSetoutDefinitionPlan,
  deliverShot,
  flushQueuedShots,
  getCachedSetoutProjectPlan,
  listQueuedShots,
  saveShotLocally,
  type FieldSetoutDefinition,
  type FieldSetoutPoint,
  type FieldSetoutRegisterEntry,
  type QueuedSetoutShot,
} from '@/lib/field/setoutQueue'
import { evaluateSetoutCaptureEvidence } from '@/lib/field/setoutCapture'
import { resolveSetoutToleranceProfile } from '@/lib/engineering/setoutToleranceProfile'

type SetoutPoint = FieldSetoutPoint
type Definition = FieldSetoutDefinition
type RegisterEntry = FieldSetoutRegisterEntry

interface ObservationDraft {
  targetKey: string
  observed: { e: string; n: string; z: string }
  accuracy: string
  levelAccuracy: string
}

const EMPTY_OBSERVED = { e: '', n: '', z: '' }

const inputClass =
  'w-full px-3 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none'
const numberClass = `${inputClass} font-mono text-right`
const registerKey = (definitionId: string, label: string) => `${definitionId}:${label}`

function parseNumericField(value: string): { value: number | null; valid: boolean } {
  const trimmed = value.trim()
  if (trimmed === '') return { value: null, valid: true }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed)
    ? { value: parsed, valid: true }
    : { value: null, valid: false }
}

function downloadRejectedShots(shots: QueuedSetoutShot[]): boolean {
  if (shots.length === 0 || typeof URL.createObjectURL !== 'function') return false
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    status: 'LOCAL_ONLY_NOT_ON_PROJECT_REGISTER',
    note: 'These observations were rejected by the server. Review against the approved project design before taking any new field action.',
    shots,
  }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `METARDU-rejected-setout-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

export default function FieldSetOutPage() {
  const params = useSearchParams()
  return params?.get('mode') === 'plumb'
    ? <ColumnPlumbCollector projectId={params?.get('projectId') ?? ''} />
    : <PointSetOutCollector />
}

function PointSetOutCollector() {
  const params = useSearchParams()
  const projectId = params?.get('projectId') ?? ''
  const requestedDefinitionId = params?.get('definitionId') ?? ''

  const [definitions, setDefinitions] = useState<Definition[]>([])
  const [definitionId, setDefinitionId] = useState<string>('')
  const [points, setPoints] = useState<SetoutPoint[]>([])
  const [register, setRegister] = useState<Record<string, RegisterEntry>>({})
  const [index, setIndex] = useState(0)
  const [readingDraft, setReadingDraft] = useState<ObservationDraft | null>(null)
  const [heightReadingReference,setHeightReadingReference]=useState<{key:string;value:string}|null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingShots, setPendingShots] = useState(0)
  const [rejectedShots, setRejectedShots] = useState(0)
  const [rejectedShotRecords, setRejectedShotRecords] = useState<QueuedSetoutShot[]>([])
  const [queueState, setQueueState] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const [usingOfflinePlan, setUsingOfflinePlan] = useState(false)
  const [offlinePlanConfirmed, setOfflinePlanConfirmed] = useState(false)
  const [offlinePlanCachedAt, setOfflinePlanCachedAt] = useState<string | null>(null)
  const [planCacheWarning, setPlanCacheWarning] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const syncInFlight = useRef(false)

  /** Shots still waiting for signal — shown so nothing looks lost. */
  const refreshPending = useCallback(async () => {
    if (!projectId) return
    try {
      const shots = await listQueuedShots(projectId)
      const pending = shots.filter((shot) => !shot.synced)
      const rejected = pending.filter((shot) => shot.syncStatus === 'rejected')
      setPendingShots(pending.length)
      setRejectedShots(rejected.length)
      setRejectedShotRecords(rejected)
      setQueueState('ready')
      setExportError(null)
    } catch {
      setQueueState('unavailable')
    }
  }, [projectId])

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

  const loadCachedDefinitions = useCallback(async () => {
    if (!projectId) return false
    try {
      const cached = await getCachedSetoutProjectPlan(projectId)
      const snapshot = cached?.definitionList
      if (!snapshot) {
        setMessage('No saved set-out schedule is available on this device. Open this project’s set-out screen online before leaving coverage.')
        return false
      }
      const defs = snapshot.definitions
      setDefinitions(defs)
      setRegister(Object.fromEntries(snapshot.register.map((entry) => [registerKey(entry.definition_id, entry.label), entry])))
      setDefinitionId((current) => {
        const requested = defs.find((definition) => definition.id === requestedDefinitionId)
        if (requested) return requested.id
        if (current && defs.some((definition) => definition.id === current)) return current
        return defs[0]?.id ?? ''
      })
      setMessage(null)
      return true
    } catch {
      setMessage('METARDU could not read the saved set-out schedule from this device.')
      return false
    }
  }, [projectId, requestedDefinitionId])

  const loadRegister = useCallback(async () => {
    if (!projectId) return
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await loadCachedDefinitions()
        return
      }
      const res = await fetch(`/api/project/${projectId}/setout`)
      if (!res.ok) {
        if (res.status === 408 || res.status >= 500) {
          await loadCachedDefinitions()
        } else {
          setMessage(`Could not load this project’s set-out definitions (HTTP ${res.status}).`)
        }
        return
      }
      const json = (await res.json()) as {
        data?: { definitions?: Definition[]; register?: RegisterEntry[] }
      }
      const defs = json.data?.definitions ?? []
      const entries = json.data?.register ?? []
      setDefinitions(defs)
      setRegister(Object.fromEntries(entries.map((entry) => [registerKey(entry.definition_id, entry.label), entry])))
      setDefinitionId((current) => {
        const requested = defs.find((definition) => definition.id === requestedDefinitionId)
        if (requested) return requested.id
        if (current && defs.some((definition) => definition.id === current)) return current
        return defs[0]?.id ?? ''
      })
      setMessage(null)
      try {
        await cacheSetoutDefinitionList(projectId, defs, entries)
        setPlanCacheWarning(null)
      } catch {
        setPlanCacheWarning('The set-out list loaded, but this device could not save it for offline use. Keep the project online before leaving coverage.')
      }
    } catch {
      await loadCachedDefinitions()
    } finally {
      setLoading(false)
    }
  }, [projectId, requestedDefinitionId, loadCachedDefinitions])

  useEffect(() => {
    void loadRegister()
  }, [loadRegister])

  const loadDefinition = useCallback(async () => {
    if (!projectId || !definitionId) {
      setPoints([])
      return
    }
    const loadCachedPlan = async () => {
      try {
        const cached = await getCachedSetoutProjectPlan(projectId)
        const snapshot = cached?.definitionPlans[definitionId]
        if (!snapshot) {
          setPoints([])
          setOfflinePlanCachedAt(null)
          setUsingOfflinePlan(false)
          setMessage('No saved targets are available for this set-out definition. Open it online before leaving coverage.')
          return
        }
        setPoints(snapshot.points)
        setRegister(Object.fromEntries(snapshot.register.map((entry) => [registerKey(entry.definition_id, entry.label), entry])))
        setOfflinePlanCachedAt(snapshot.cachedAt)
        setUsingOfflinePlan(true)
        setOfflinePlanConfirmed(false)
        setMessage(null)
      } catch {
        setPoints([])
        setOfflinePlanCachedAt(null)
        setUsingOfflinePlan(false)
        setMessage('METARDU could not read the saved targets from this device. Do not clear browser data; reconnect and reload the field plan.')
      }
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await loadCachedPlan()
      return
    }
    try {
      const res = await fetch(`/api/project/${projectId}/setout?definitionId=${encodeURIComponent(definitionId)}`)
      if (!res.ok) {
        if (res.status === 408 || res.status >= 500) await loadCachedPlan()
        else setMessage(`Could not refresh this set-out definition (HTTP ${res.status}).`)
        return
      }
      const json = (await res.json()) as {
        data?: { points?: SetoutPoint[]; register?: RegisterEntry[] }
      }
      const nextPoints = json.data?.points ?? []
      const entries = json.data?.register ?? []
      setPoints(nextPoints)
      setRegister(Object.fromEntries(entries.map((entry) => [registerKey(entry.definition_id, entry.label), entry])))
      setUsingOfflinePlan(false)
      setOfflinePlanConfirmed(false)
      setMessage(null)
      try {
        const cachedAt = new Date().toISOString()
        await cacheSetoutDefinitionPlan(projectId, definitionId, nextPoints, entries, cachedAt)
        setOfflinePlanCachedAt(cachedAt)
        setPlanCacheWarning(null)
      } catch {
        setOfflinePlanCachedAt(null)
        setPlanCacheWarning('Targets loaded, but this device could not save them for offline use. Keep the project online before leaving coverage.')
      }
    } catch {
      await loadCachedPlan()
    }
  }, [projectId, definitionId])

  useEffect(() => {
    if (!projectId || !definitionId) return
    setIndex(0)
    setPoints([])
    setUsingOfflinePlan(false)
    setOfflinePlanConfirmed(false)
    setOfflinePlanCachedAt(null)
    void loadDefinition()
  }, [projectId, definitionId, loadDefinition])

  useEffect(() => {
    const onOffline = () => {
      if (points.length === 0) return
      setUsingOfflinePlan(true)
      setOfflinePlanConfirmed(false)
    }
    window.addEventListener('offline', onOffline)
    return () => window.removeEventListener('offline', onOffline)
  }, [points.length])


  // Reconcile device-first shots on entry and whenever the device regains
  // connectivity or returns to this screen. The API is idempotent, so replay
  // after an interrupted response cannot create a second observation.
  useEffect(() => {
    const syncQueuedShots = () => {
      if (!projectId || !navigator.onLine || syncInFlight.current) return
      syncInFlight.current = true
      void flushQueuedShots(projectId).then(() => {
        void loadRegister()
        void loadDefinition()
        void refreshPending()
      }).catch(() => {
        // Keep the local record and allow a later visibility/online retry.
      }).finally(() => {
        syncInFlight.current = false
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncQueuedShots()
    }
    syncQueuedShots()
    window.addEventListener('online', syncQueuedShots)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', syncQueuedShots)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [projectId, loadRegister, loadDefinition, refreshPending])

  const target = points[index] ?? null
  const currentDefinition = definitions.find((definition) => definition.id === definitionId)
  const hasPointProfile=target?.metadata!=null&&Object.prototype.hasOwnProperty.call(target.metadata,'setoutToleranceProfileSnapshot')
  const toleranceProfileSnapshot = hasPointProfile?target?.metadata?.setoutToleranceProfileSnapshot:currentDefinition?.metadata?.setoutToleranceProfileSnapshot
  const toleranceProfile = resolveSetoutToleranceProfile(toleranceProfileSnapshot)
  const hasToleranceSnapshot = toleranceProfileSnapshot != null
  const toleranceProfileMismatch = (hasToleranceSnapshot || !hasPointProfile&&currentDefinition?.tolerance_profile_id != null)
    && (!toleranceProfile || !hasPointProfile&&toleranceProfile.id !== currentDefinition?.tolerance_profile_id)
  const hasPointHeight=target?.metadata!=null&&Object.prototype.hasOwnProperty.call(target.metadata,'declaredHeightReference')
  const rawHeight=hasPointHeight?target?.metadata?.declaredHeightReference:currentDefinition?.metadata?.declaredHeightReference
  const plannedHeight=typeof rawHeight==='string'?rawHeight.trim():null
  const pointCrs=typeof target?.metadata?.projectCrs==='string'?target.metadata.projectCrs:currentDefinition?.crs??null
  const heightKey=JSON.stringify([projectId,definitionId,pointCrs,plannedHeight])
  const observedHeightReference=heightReadingReference?.key===heightKey?heightReadingReference.value:''
  const drainageMetadata = target?.point_type === 'drainage_station' ? target.metadata : null
  const rawAlignmentSource = drainageMetadata?.alignmentSource
  const mapAlignmentSource = rawAlignmentSource && typeof rawAlignmentSource === 'object' && !Array.isArray(rawAlignmentSource)
    ? rawAlignmentSource as Record<string, unknown>
    : null
  const latestObservation = target ? register[registerKey(definitionId, target.label)] ?? null : null
  const recordedCount = points.filter((point) => register[registerKey(definitionId, point.label)]).length
  // A reading belongs to the exact target revision shown when it was entered.
  // If a user changes points or the server refreshes a design revision, old
  // coordinates must never be judged or stored against the new target.
  const targetKey = target
    ? JSON.stringify([projectId, definitionId, target.label, target.revision, target.easting, target.northing, target.design_rl,pointCrs,plannedHeight,toleranceProfileSnapshot])
    : ''
  const activeDraft = readingDraft?.targetKey === targetKey ? readingDraft : null
  const observed = activeDraft?.observed ?? EMPTY_OBSERVED
  const accuracy = activeDraft?.accuracy ?? ''
  const levelAccuracy=activeDraft?.levelAccuracy??''
  const observedEasting = parseNumericField(observed.e)
  const observedNorthing = parseNumericField(observed.n)
  const horizontalInputIssue = !observedEasting.valid || !observedNorthing.valid
    ? 'Enter valid numeric observed Easting and Northing.'
    : observedEasting.value == null || observedNorthing.value == null
      ? 'Enter both observed Easting and Northing before recording a shot.'
      : null

  const updateObserved = (field: 'e' | 'n' | 'z', value: string) => {
    setReadingDraft((current) => {
      const base = current?.targetKey === targetKey
        ? current
        : { targetKey, observed: EMPTY_OBSERVED, accuracy: '',levelAccuracy:'' }
      return { ...base, observed: { ...base.observed, [field]: value } }
    })
  }
  const updateAccuracy = (value: string) => {
    setReadingDraft((current) => {
      const base = current?.targetKey === targetKey
        ? current
        : { targetKey, observed: EMPTY_OBSERVED, accuracy: '',levelAccuracy:'' }
      return { ...base, accuracy: value }
    })
  }
  const selectTarget = (nextIndex: number) => {
    if (saving) return
    setIndex(Math.max(0, Math.min(points.length - 1, nextIndex)))
    setReadingDraft(null)
    setMessage(null)
  }
  const updateLevelAccuracy=(value:string)=>setReadingDraft(current=>({...((current?.targetKey===targetKey)?current:{targetKey,observed:EMPTY_OBSERVED,accuracy:'',levelAccuracy:''}),levelAccuracy:value}))

  const verdict = useMemo(() => {
    if (!target || toleranceProfileMismatch) return null
    const e = parseNumericField(observed.e)
    const n = parseNumericField(observed.n)
    const rl = parseNumericField(observed.z)
    const accuracyValue = parseNumericField(accuracy)
    const levelAccuracyValue=parseNumericField(levelAccuracy)
    if (
      !e.valid || e.value == null || !n.valid || n.value == null ||
      !rl.valid || !accuracyValue.valid ||!levelAccuracyValue.valid ||
      (accuracyValue.value != null && accuracyValue.value < 0)||(levelAccuracyValue.value!=null&&levelAccuracyValue.value<0)||!currentDefinition?.crs
    ) return null
    try{return evaluateSetoutCaptureEvidence({horizontalCrs:currentDefinition.crs,definitionCrs:pointCrs,deviceCrs:currentDefinition.crs,verticalDatum:plannedHeight,deviceVerticalDatum:observedHeightReference.trim()||null,capturedAt:null,
      design:{easting:target.easting,northing:target.northing,rl:target.design_rl},capturedDesign:{easting:target.easting,northing:target.northing,rl:target.design_rl},observed:{easting:e.value,northing:n.value,rl:rl.value},reportedAccuracyM:accuracyValue.value,reportedVerticalAccuracyM:levelAccuracyValue.value,profile:toleranceProfile,capturedToleranceProfileId:toleranceProfile?.id??null},false).assessment}catch{return null}
  }, [target, observed.e, observed.n, observed.z, accuracy,levelAccuracy,observedHeightReference,plannedHeight,pointCrs,currentDefinition?.crs, toleranceProfileMismatch,toleranceProfile])

  const recordShot = useCallback(async (saveUnassessed=false) => {
    if (!projectId || !definitionId || !target || !verdict || verdict.result === 'INFO'&&!saveUnassessed
      || (usingOfflinePlan && !offlinePlanConfirmed)) return
    const e = parseNumericField(observed.e)
    const n = parseNumericField(observed.n)
    const rl = parseNumericField(observed.z)
    const fix = parseNumericField(accuracy)
    const levelFix=parseNumericField(levelAccuracy)
    if (!e.valid || e.value == null || !n.valid || n.value == null || !rl.valid || !fix.valid||!levelFix.valid) return
    if (target.design_rl != null && rl.value == null&&!saveUnassessed) return
    if (fix.value != null && fix.value < 0) return

    setSaving(true)
    try {
      // Device-first (blueprint §18.1): the shot is written to this device
      // before it is sent, so one bar of coverage cannot lose a stake.
      const local = await saveShotLocally({
        projectId,
        definitionId,
        label: target.label,
        observedEasting: e.value,
        observedNorthing: n.value,
        observedRL: rl.value,
        accuracyM: fix.value,
        verticalAccuracyM:levelFix.value,capturedVerticalDatum:observedHeightReference.trim()||null,capturedToleranceProfileId:toleranceProfile?.id??null,
        result: verdict.result,
        designEasting: target.easting,
        designNorthing: target.northing,
        designRL: target.design_rl,
        designRevision: target.revision,
        capturedCrs: currentDefinition?.crs ?? undefined,
      })

      const outcome = await deliverShot(local)
      if (outcome.delivered) {
        setMessage('Recorded — the shot is on the project register.')
        await Promise.all([loadRegister(), loadDefinition()])
      } else if (outcome.retryable === false) {
        setMessage(
          `Saved on this device, but the server needs this shot reviewed: ${outcome.reason ?? 'rejected'}. It is not on the project register.`
        )
      } else {
        setMessage(
          `Saved on this device. Upload did not finish: ${outcome.reason ?? 'queued'}. METARDU will retry when you reconnect or reopen this screen.`
        )
        void flushQueuedShots(projectId)
      }

      const nextUnstaked = points.findIndex(
        (p, i) => i > index && !register[registerKey(definitionId, p.label)]
      )
      setIndex(nextUnstaked === -1 ? Math.min(index + 1, points.length - 1) : nextUnstaked)
      setReadingDraft(null)
      await refreshPending()
    } catch {
      setMessage('Could not save the shot — it was not recorded. Copy the coordinates and retry.')
    } finally {
      setSaving(false)
    }
  }, [projectId, definitionId, currentDefinition?.crs, target, verdict, observed, accuracy,levelAccuracy,observedHeightReference,toleranceProfile, index, points, register, loadRegister, loadDefinition, refreshPending, usingOfflinePlan, offlinePlanConfirmed])

  if (!projectId) {
    return (
      <div className="min-h-screen p-4 text-sm text-[var(--text-muted)]">
        Open this screen from a project’s engineering step so the set-out definition is known.
      </div>
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-[var(--text-muted)]">Loading set-out…</div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <Link href="/field" aria-label="Back to field" className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Set out</p>
          <p className="text-sm font-semibold truncate">
            {currentDefinition?.name ?? 'No definition'}
          </p>
          {currentDefinition?.crs && <p className="text-[10px] text-[var(--text-muted)]">CRS {currentDefinition.crs}{currentDefinition.metadata?.source === 'project_drainage' ? ' · Drainage' : ''}</p>}
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {points.length
            ? `${recordedCount}/${points.length} recorded`
            : '—'}
        </span>
        {pendingShots > 0 && (
          <span className="text-[10px] font-mono text-amber-400" role="status">
            {pendingShots} shot{pendingShots === 1 ? '' : 's'} only on this device
            {rejectedShots > 0 ? ` · ${rejectedShots} need review` : ''}
          </span>
        )}
        {queueState === 'unavailable' && (
          <span className="text-[10px] font-mono text-red-300" role="status">Local queue unavailable</span>
        )}
      </header>

      {planCacheWarning && (
        <p role="status" className="mx-3 mt-3 rounded-lg border border-amber-700/70 bg-amber-950/30 p-3 text-xs text-amber-100">
          {planCacheWarning}
        </p>
      )}

      {!usingOfflinePlan && points.length > 0 && offlinePlanCachedAt && (
        <p role="status" className="mx-3 mt-3 rounded-lg border border-emerald-700/70 bg-emerald-950/25 p-3 text-xs text-emerald-100">
          Set-out targets saved on this device at {new Date(offlinePlanCachedAt).toLocaleString()}. Keep this field screen opened online before leaving coverage.
        </p>
      )}

      {usingOfflinePlan && points.length > 0 && (
        <section role="alert" className="mx-3 mt-3 rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-50">
          <p className="font-semibold">Working from a saved set-out plan while offline</p>
          <p className="mt-1 text-xs text-amber-100/80">
            {offlinePlanCachedAt
              ? `This device saved the targets ${new Date(offlinePlanCachedAt).toLocaleString()}. A newer approved design may exist.`
              : 'These targets are only still open in this screen; this device could not save an offline copy.'}
            {' '}Recorded shots stay on this device until they sync. The server will reject a target whose design revision has changed.
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={offlinePlanConfirmed}
              onChange={(event) => setOfflinePlanConfirmed(event.target.checked)}
              aria-label="Confirm saved set-out plan against issued field brief"
              className="h-4 w-4 accent-amber-400"
            />
            I checked these targets against the current issued field brief before recording shots.
          </label>
        </section>
      )}

      {definitionId && points.length > 0 && Number.isInteger(points[0].revision) && points[0].revision > 0 && (
        <div className="mx-3 mt-3 text-xs text-[var(--text-muted)]">
          <a href={`/api/project/${encodeURIComponent(projectId)}/setout/export?definitionId=${encodeURIComponent(definitionId)}&revision=${points[0].revision}`}
            className="inline-flex min-h-[44px] items-center rounded border border-[var(--border-color)] px-3 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
            Download saved set-out shot history (CSV)
          </a>
          <a href={`/api/project/${encodeURIComponent(projectId)}/setout/export?definitionId=${encodeURIComponent(definitionId)}&revision=${points[0].revision}&format=html`}
            className="ml-2 inline-flex min-h-[44px] items-center rounded border border-[var(--border-color)] px-3 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
            Download printable draft cut sheet
          </a>
          <a href={`/api/project/${encodeURIComponent(projectId)}/setout/export?definitionId=${encodeURIComponent(definitionId)}&revision=${points[0].revision}&format=pdf`}
            className="ml-2 inline-flex min-h-[44px] items-center rounded border border-[var(--border-color)] px-3 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
            Download draft cut sheet (PDF)
          </a>
          <p className="mt-1">Includes saved re-stakes for this revision and recorded criteria. Device-only shots are excluded. Recorded status is historical; review capture evidence before acceptance. Download the paginated draft PDF or open the printable HTML.</p>
        </div>
      )}

      {queueState === 'unavailable' && (
        <section role="alert" className="m-3 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-100">
          METARDU could not read this device’s local set-out queue. The pending shot count is unknown; do not clear browser data or uninstall the app until the queue is readable again.
        </section>
      )}

      {rejectedShotRecords.length > 0 && (
        <section aria-labelledby="rejected-setout-heading" className="mx-3 mt-3 rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="rejected-setout-heading" className="font-semibold">
                {rejectedShotRecords.length} local shot{rejectedShotRecords.length === 1 ? '' : 's'} need review
              </h2>
              <p className="mt-1 text-xs text-amber-100/80">
                These records were rejected and are not on the project register. They will not be changed or retried automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExportError(downloadRejectedShots(rejectedShotRecords) ? null : 'Could not create the local JSON export on this device.')}
              className="rounded-lg border border-amber-600 px-3 py-2 text-xs font-semibold hover:bg-amber-900/60"
            >
              Download review file
            </button>
          </div>
          {exportError && <p role="alert" className="mt-2 text-xs text-red-200">{exportError}</p>}
          <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {rejectedShotRecords.map((shot) => {
              const dE = shot.observedEasting - shot.designEasting
              const dN = shot.observedNorthing - shot.designNorthing
              const dZ = shot.observedRL == null || shot.designRL == null
                ? null
                : shot.observedRL - shot.designRL
              const capturedAt = Date.parse(shot.capturedAt)
              return (
                <article key={shot.id} className="rounded-lg border border-amber-800/80 bg-black/20 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-mono text-sm font-semibold">{shot.label}</h3>
                    <span className="rounded border border-amber-700 px-2 py-1">
                      Local capture judgement: {shot.result}
                    </span>
                  </div>
                  <p className="mt-1 text-amber-100/70">
                    Captured <time dateTime={shot.capturedAt}>{Number.isFinite(capturedAt) ? new Date(capturedAt).toLocaleString() : shot.capturedAt}</time>
                    {' · '}design revision {shot.designRevision ?? 'not recorded'}
                    {' · '}fix ±{shot.accuracyM == null ? 'not supplied' : `${(shot.accuracyM * 1000).toFixed(1)} mm`}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono sm:grid-cols-4">
                    <div><dt className="text-amber-100/60">Design E</dt><dd>{shot.designEasting.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">Design N</dt><dd>{shot.designNorthing.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">Design RL</dt><dd>{shot.designRL == null ? '—' : shot.designRL.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">Observed RL</dt><dd>{shot.observedRL == null ? 'not observed' : shot.observedRL.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">Observed E</dt><dd>{shot.observedEasting.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">Observed N</dt><dd>{shot.observedNorthing.toFixed(3)}</dd></div>
                    <div><dt className="text-amber-100/60">dE</dt><dd>{(dE * 1000).toFixed(1)} mm</dd></div>
                    <div><dt className="text-amber-100/60">dN</dt><dd>{(dN * 1000).toFixed(1)} mm</dd></div>
                    <div><dt className="text-amber-100/60">dZ</dt><dd>{dZ == null ? 'not available' : `${(dZ * 1000).toFixed(1)} mm`}</dd></div>
                  </dl>
                  <p className="mt-2 break-words border-t border-amber-800/70 pt-2 text-amber-100">
                    Server reason: {shot.syncError || 'The upload was rejected; inspect the project design and connection logs.'}
                  </p>
                  <p className="mt-1 text-amber-100/70">
                    Compare this captured shot with the approved design before taking further action. Keep this record unchanged.
                  </p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {definitions.length > 1 && (
        <div className="p-2 border-b border-[var(--border-color)] flex gap-2 overflow-x-auto">
          {definitions.map((d) => (
            <button
              key={d.id}
              disabled={saving}
              onClick={() => {
                setReadingDraft(null)
                setMessage(null)
                setDefinitionId(d.id)
              }}
              className={`px-3 py-2 rounded text-xs whitespace-nowrap ${
                d.id === definitionId
                  ? 'bg-[var(--accent)] text-black font-semibold'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {!target ? (
        <div className="p-4 text-sm text-[var(--text-muted)] space-y-2">
          <p className="flex items-center gap-2">
            <TriangleAlert className="w-4 h-4" />
            Nothing to stake yet.
          </p>
          <p>
            Generate a pile/column grid or a drainage pipe schedule in the project engineering step first; saved targets appear here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <section className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Target {target.label}
              </p>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {index + 1} / {points.length}
              </span>
            </div>
            <div className="mt-2 font-mono text-xl">
              <div>E {String(target.easting)}</div>
              <div>N {String(target.northing)}</div>
              <div>{target.design_rl != null ? `RL ${String(target.design_rl)}` : 'RL not designed'}</div>
            </div>
            {latestObservation && (
              <div className="mt-3 border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-secondary)]">
                <p className="font-semibold">
                  Latest recorded numerical result · {latestObservation.result.toUpperCase()}
                </p>
                <p className="mt-1 font-mono">
                  H {latestObservation.horizontal_error == null ? '—' : `${(latestObservation.horizontal_error * 1000).toFixed(1)} mm`}
                  {' · '}V {latestObservation.vertical_error == null ? 'not observed' : `${(latestObservation.vertical_error * 1000).toFixed(1)} mm`}
                  {' · '}Fix {latestObservation.reported_accuracy_m == null ? 'not reported' : `±${(latestObservation.reported_accuracy_m * 1000).toFixed(1)} mm`}
                </p>
              </div>
            )}
          </section>

          {drainageMetadata && (
            <section className="p-3 rounded-xl border border-amber-700/70 bg-amber-950/25 text-xs text-amber-100 space-y-1.5">
              <p className="font-semibold">
                {typeof drainageMetadata.pipeId === 'string' ? drainageMetadata.pipeId : 'Drainage pipe'}
                {' · '}{typeof drainageMetadata.stationRole === 'string' ? drainageMetadata.stationRole : 'Station'}
              </p>
              <p>
                Pipe chainage {typeof drainageMetadata.pipeChainageM === 'number' ? drainageMetadata.pipeChainageM.toFixed(3) : '—'} m
                {' · '}run chainage {typeof drainageMetadata.runChainageM === 'number' ? drainageMetadata.runChainageM.toFixed(3) : '—'} m
              </p>
              <p>Horizontal target: pipe centreline · vertical target: pipe invert RL.</p>
              <p>Intermediate ground and cover were not surveyed or inferred. Confirm trench formation, vertical datum, and the approved project tolerances before construction.</p>
              {mapAlignmentSource?.kind === 'saved_project_map_line' && (
                <p className="rounded border border-amber-600/70 bg-amber-950/40 p-2">
                  Route source: saved map line “{typeof mapAlignmentSource.label === 'string' ? mapAlignmentSource.label : 'Unnamed line'}” transformed from {typeof mapAlignmentSource.sourceCrs === 'string' ? mapAlignmentSource.sourceCrs : 'its recorded source CRS'} to {typeof mapAlignmentSource.projectCrs === 'string' ? mapAlignmentSource.projectCrs : 'the project CRS'}. This is unverified map geometry, not approved design or survey control; verify the route and both connectors against approved design and field control before staking or construction.
                </p>
              )}
            </section>
          )}

          <section className="grid grid-cols-3 gap-2">
            {points.map((p, i) => {
              const observation = register[registerKey(definitionId, p.label)]
              const status = observation?.result.toUpperCase()
              const statusText = status === 'PASS'
                ? 'text-emerald-400'
                : status === 'FAIL'
                  ? 'text-red-400'
                  : status === 'WARN'
                    ? 'text-amber-400'
                    : status === 'INFO'
                      ? 'text-sky-400'
                      : 'text-[var(--text-muted)]'
              const statusMark = status === 'PASS' ? '✓' : status === 'FAIL' ? '!' : status ? '·' : ''
              return (
              <button
                key={`${p.label}-${i}`}
                disabled={saving}
                onClick={() => selectTarget(i)}
                  title={status ? `${p.label} · ${status}` : `${p.label} · not recorded`}
                  aria-label={status ? `${p.label}, latest result ${status}` : `${p.label}, not recorded`}
                  className={`h-11 rounded-lg text-[11px] font-mono border ${
                    i === index
                      ? `border-[var(--accent)] bg-[var(--bg-tertiary)] ${statusText}`
                      : status
                        ? `border-[var(--border-color)] ${statusText}`
                        : 'border-[var(--border-color)] text-[var(--text-muted)]'
                  }`}
                >
                  {statusMark ? `${statusMark} ` : ''}
                  {p.label}
                </button>
              )
            })}
          </section>

          <section className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-2">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Observed here (instrument/GNSS)
            </p>
            {toleranceProfileMismatch ? (
              <p role="alert" className="text-[11px] text-red-300">
                This definition’s tolerance snapshot is missing or inconsistent. Refresh or rebuild the project set-out before recording a shot.
              </p>
            ) : toleranceProfile ? (
              <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                <p className="font-semibold">Project profile · {toleranceProfile.name} · {toleranceProfile.version}</p>
                <p className="mt-1 font-mono">
                  H ±{(toleranceProfile.horizontalM * 1000).toFixed(1)} mm · V ±{(toleranceProfile.verticalM * 1000).toFixed(1)} mm
                </p>
                <p className="mt-1">{toleranceProfile.jurisdiction} · effective {toleranceProfile.effectiveDate} · source: {toleranceProfile.source}</p>
                <p className="mt-1">Recorded as approved by: {toleranceProfile.approvedBy}</p>
                <p className="mt-1 text-amber-100/70">Transcribed from the named project requirement; confirm the governing revision with the responsible surveyor.</p>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                Adopted project criteria are not recorded. Differences can be saved as unassessed observations; no acceptance threshold is inferred. Review the issued specification before numerical assessment.
              </p>
            )}
            {target.design_rl != null && (
              <p id="setout-level-help" className="text-[11px] text-amber-200">
                This target has a design RL. Record the observed RL, its uncertainty and the common height reference for a numerical level comparison. Design height reference: {plannedHeight||'not recorded'}.
              </p>
            )}
            <input
              value={observed.e}
              onChange={(e) => updateObserved('e', e.target.value)}
              placeholder="Easting"
              inputMode="decimal"
              disabled={saving}
              className={numberClass}
              aria-label="Observed easting"
            />
            <input
              value={observed.n}
              onChange={(e) => updateObserved('n', e.target.value)}
              placeholder="Northing"
              inputMode="decimal"
              disabled={saving}
              className={numberClass}
              aria-label="Observed northing"
            />
            {horizontalInputIssue && (
              <p role="alert" className="text-[11px] text-amber-200">{horizontalInputIssue}</p>
            )}
            <input
              value={observed.z}
              onChange={(e) => updateObserved('z', e.target.value)}
              placeholder={target.design_rl == null ? 'RL (no design RL)' : 'Observed RL (required)'}
              inputMode="decimal"
              disabled={saving}
              aria-required={target.design_rl != null}
              aria-describedby={target.design_rl != null ? 'setout-level-help' : undefined}
              className={numberClass}
              aria-label="Observed reduced level"
            />
            <input
              value={accuracy}
              onChange={(e) => updateAccuracy(e.target.value)}
              placeholder="Fix accuracy ±m (optional)"
              inputMode="decimal"
              disabled={saving}
              className={numberClass}
              aria-label="Fix accuracy"
            />
          </section>

          {target.design_rl!=null&&<div className="space-y-2"><input aria-label="Level accuracy" value={levelAccuracy} onChange={e=>updateLevelAccuracy(e.target.value)} disabled={saving} className={numberClass} inputMode="decimal" placeholder="Reported level uncertainty (m)"/><input aria-label="Observed height reference" value={observedHeightReference} onChange={e=>setHeightReadingReference({key:heightKey,value:e.target.value})} disabled={saving} className={inputClass} placeholder="Observed datum / benchmark reference"/><p className="text-[11px] text-[var(--text-muted)]">Enter the uncertainty of the level observation. Horizontal fix accuracy does not establish level accuracy. The reference remains your reported field evidence, not independently verified control.</p></div>}
          {verdict?.result==='INFO'&&<button type="button" onClick={()=>void recordShot(true)} disabled={saving||(usingOfflinePlan&&!offlinePlanConfirmed)} className="min-h-11 rounded-lg border border-amber-600 px-4 py-3 text-sm text-amber-200">Save unassessed observation</button>}
          {verdict && (
            <section
              className={`p-3 rounded-xl border text-sm font-semibold ${
                verdict.result === 'PASS'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : verdict.result === 'INFO'
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ruler className="w-4 h-4" />
                  {verdict.message}
                </span>
                <span className="font-mono text-xs">
                  {verdict.result === 'PASS' ? 'ON TARGET' : verdict.result}
                </span>
              </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-xs">
                    <div>dE {verdict.dE >= 0 ? '+' : ''}{(verdict.dE * 1000).toFixed(0)} mm</div>
                    <div>dN {verdict.dN >= 0 ? '+' : ''}{(verdict.dN * 1000).toFixed(0)} mm</div>
                <div>
                  dZ{' '}
                      {verdict.dZ == null ? '—' : `${verdict.dZ >= 0 ? '+' : ''}${(verdict.dZ * 1000).toFixed(0)} mm`}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[var(--border-color)]/60 pt-2">
                    <p className="text-[11px] font-semibold">Correction to design (project grid)</p>
                    <p className="mt-1 text-[10px] font-normal text-[var(--text-muted)]">
                      Add these signed corrections to the observed coordinates. E/N follow the project CRS grid axes; they are not compass directions.
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-xs">
                      <div>ΔE {verdict.moveE >= 0 ? '+' : ''}{(verdict.moveE * 1000).toFixed(0)} mm</div>
                      <div>ΔN {verdict.moveN >= 0 ? '+' : ''}{(verdict.moveN * 1000).toFixed(0)} mm</div>
                      <div>ΔRL {verdict.moveZ == null ? '—' : `${verdict.moveZ >= 0 ? '+' : ''}${(verdict.moveZ * 1000).toFixed(0)} mm`}</div>
                    </div>
                  </div>
                </section>
          )}

          {message && (
            <p className="text-xs text-[var(--text-muted)] flex items-start gap-2">
              <Radio className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {message}
            </p>
          )}
        </div>
      )}

      <footer className="sticky bottom-0 p-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex gap-2">
        <button
          onClick={() => selectTarget(index - 1)}
          disabled={saving}
          className="px-4 py-4 rounded-lg border border-[var(--border-color)] text-sm"
        >
          Back
        </button>
        <button
          onClick={() => void recordShot()}
          disabled={saving || !verdict || verdict.result === 'INFO' || (usingOfflinePlan && !offlinePlanConfirmed)}
          className="flex-1 py-4 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Recording…' : verdict?.result === 'INFO' ? 'Improve fix / complete required reading' : 'Record field observation'}
        </button>
        <button
          onClick={() => selectTarget(index + 1)}
          disabled={saving}
          aria-label="Next point"
          className="px-4 py-4 rounded-lg border border-[var(--border-color)]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  )
}
