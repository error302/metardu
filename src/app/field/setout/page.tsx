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
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, Radio, Ruler, TriangleAlert } from 'lucide-react'
import {
  deliverShot,
  flushQueuedShots,
  listQueuedShots,
  saveShotLocally,
  type QueuedSetoutShot,
} from '@/lib/field/setoutQueue'
import { DEFAULT_SETOUT_TOLERANCE, evaluateSetoutShot } from '@/lib/engineering/verticality'
import { resolveSetoutToleranceProfile } from '@/lib/engineering/setoutToleranceProfile'

interface SetoutPoint {
  label: string
  easting: number
  northing: number
  design_rl: number | null
  point_type: string
  revision: number
  metadata: Record<string, unknown>
}

interface Definition {
  id: string
  name: string
  structure_type: string
  crs: string | null
  tolerance_profile_id?: string | null
  metadata: Record<string, unknown>
}

interface RegisterEntry {
  definition_id: string
  label: string
  result: string
  horizontal_error: number | null
  vertical_error: number | null
  reported_accuracy_m: number | null
  staked_at: string
}

interface ObservationDraft {
  targetKey: string
  observed: { e: string; n: string; z: string }
  accuracy: string
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
  const projectId = params?.get('projectId') ?? ''
  const requestedDefinitionId = params?.get('definitionId') ?? ''

  const [definitions, setDefinitions] = useState<Definition[]>([])
  const [definitionId, setDefinitionId] = useState<string>('')
  const [points, setPoints] = useState<SetoutPoint[]>([])
  const [register, setRegister] = useState<Record<string, RegisterEntry>>({})
  const [index, setIndex] = useState(0)
  const [readingDraft, setReadingDraft] = useState<ObservationDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingShots, setPendingShots] = useState(0)
  const [rejectedShots, setRejectedShots] = useState(0)
  const [rejectedShotRecords, setRejectedShotRecords] = useState<QueuedSetoutShot[]>([])
  const [queueState, setQueueState] = useState<'checking' | 'ready' | 'unavailable'>('checking')
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

  const loadRegister = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/project/${projectId}/setout`)
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: { definitions?: Definition[]; register?: RegisterEntry[] }
      }
      const defs = json.data?.definitions ?? []
      setDefinitions(defs)
      setRegister(
        Object.fromEntries(
          (json.data?.register ?? []).map((entry) => [registerKey(entry.definition_id, entry.label), entry])
        )
      )
      const requested = defs.find((definition) => definition.id === requestedDefinitionId)
      const current = defs.find((definition) => definition.id === definitionId)
      if (requested) setDefinitionId(requested.id)
      else if (!current && defs[0]) setDefinitionId(defs[0].id)
    } catch {
      // Offline: keep whatever is already on screen.
    } finally {
      setLoading(false)
    }
  }, [projectId, definitionId, requestedDefinitionId])

  useEffect(() => {
    void loadRegister()
  }, [loadRegister])

  const loadDefinition = useCallback(async () => {
    if (!projectId || !definitionId) {
      setPoints([])
      return
    }
    try {
      const res = await fetch(`/api/project/${projectId}/setout?definitionId=${encodeURIComponent(definitionId)}`)
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: { points?: SetoutPoint[]; register?: RegisterEntry[] }
      }
      setPoints(json.data?.points ?? [])
      setRegister(
        Object.fromEntries(
          (json.data?.register ?? []).map((entry) => [registerKey(entry.definition_id, entry.label), entry])
        )
      )
    } catch {
      // Keep the current list when the device is offline.
    }
  }, [projectId, definitionId])

  useEffect(() => {
    if (!projectId || !definitionId) return
    setIndex(0)
    void loadDefinition()
  }, [projectId, definitionId, loadDefinition])


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
  const toleranceProfileSnapshot = currentDefinition?.metadata?.setoutToleranceProfileSnapshot
  const toleranceProfile = resolveSetoutToleranceProfile(toleranceProfileSnapshot)
  const hasToleranceSnapshot = toleranceProfileSnapshot != null
  const toleranceProfileMismatch = (hasToleranceSnapshot || currentDefinition?.tolerance_profile_id != null)
    && (!toleranceProfile || toleranceProfile.id !== currentDefinition?.tolerance_profile_id)
  const horizontalToleranceM = toleranceProfile?.horizontalM ?? DEFAULT_SETOUT_TOLERANCE.horizontalM
  const verticalToleranceM = toleranceProfile?.verticalM ?? DEFAULT_SETOUT_TOLERANCE.verticalM
  const activeTolerance = { horizontalM: horizontalToleranceM, verticalM: verticalToleranceM }
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
    ? JSON.stringify([projectId, definitionId, target.label, target.revision, target.easting, target.northing, target.design_rl])
    : ''
  const activeDraft = readingDraft?.targetKey === targetKey ? readingDraft : null
  const observed = activeDraft?.observed ?? EMPTY_OBSERVED
  const accuracy = activeDraft?.accuracy ?? ''
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
        : { targetKey, observed: EMPTY_OBSERVED, accuracy: '' }
      return { ...base, observed: { ...base.observed, [field]: value } }
    })
  }
  const updateAccuracy = (value: string) => {
    setReadingDraft((current) => {
      const base = current?.targetKey === targetKey
        ? current
        : { targetKey, observed: EMPTY_OBSERVED, accuracy: '' }
      return { ...base, accuracy: value }
    })
  }
  const selectTarget = (nextIndex: number) => {
    if (saving) return
    setIndex(Math.max(0, Math.min(points.length - 1, nextIndex)))
    setReadingDraft(null)
    setMessage(null)
  }

  const verdict = useMemo(() => {
    if (!target || toleranceProfileMismatch) return null
    const e = parseNumericField(observed.e)
    const n = parseNumericField(observed.n)
    const rl = parseNumericField(observed.z)
    const accuracyValue = parseNumericField(accuracy)
    if (
      !e.valid || e.value == null || !n.valid || n.value == null ||
      !rl.valid || !accuracyValue.valid ||
      (accuracyValue.value != null && accuracyValue.value < 0)
    ) return null
    return evaluateSetoutShot(
      {
        designE: target.easting,
        designN: target.northing,
        designZ: target.design_rl,
        observedE: e.value,
        observedN: n.value,
        observedZ: rl.value,
      },
      { horizontalM: horizontalToleranceM, verticalM: verticalToleranceM, accuracyM: accuracyValue.value }
    )
  }, [target, observed.e, observed.n, observed.z, accuracy, toleranceProfileMismatch, horizontalToleranceM, verticalToleranceM])

  const recordShot = useCallback(async () => {
    if (!projectId || !definitionId || !target || !verdict || verdict.result === 'INFO') return
    const e = parseNumericField(observed.e)
    const n = parseNumericField(observed.n)
    const rl = parseNumericField(observed.z)
    const fix = parseNumericField(accuracy)
    if (!e.valid || e.value == null || !n.valid || n.value == null || !rl.valid || !fix.valid) return
    if (target.design_rl != null && rl.value == null) return
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
  }, [projectId, definitionId, currentDefinition?.crs, target, verdict, observed, accuracy, index, points, register, loadRegister, loadDefinition, refreshPending])

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
              <div>E {target.easting.toFixed(3)}</div>
              <div>N {target.northing.toFixed(3)}</div>
              <div>{target.design_rl != null ? `RL ${target.design_rl.toFixed(3)}` : 'RL not designed'}</div>
            </div>
            {latestObservation && (
              <div className="mt-3 border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-secondary)]">
                <p className="font-semibold">
                  Latest recorded shot · {latestObservation.result.toUpperCase()}
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
                  H ±{(activeTolerance.horizontalM * 1000).toFixed(1)} mm · V ±{(activeTolerance.verticalM * 1000).toFixed(1)} mm
                </p>
                <p className="mt-1">{toleranceProfile.jurisdiction} · effective {toleranceProfile.effectiveDate} · source: {toleranceProfile.source}</p>
                <p className="mt-1">Recorded as approved by: {toleranceProfile.approvedBy}</p>
                <p className="mt-1 text-amber-100/70">Transcribed from the named project requirement; confirm the governing revision with the responsible surveyor.</p>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                METARDU default comparison: ±{(activeTolerance.horizontalM * 1000).toFixed(1)} mm horizontal, ±{(activeTolerance.verticalM * 1000).toFixed(1)} mm vertical. This is not a project-issued acceptance criterion. Confirm the project specification before acceptance and construction.
              </p>
            )}
            {target.design_rl != null && (
              <p id="setout-level-help" className="text-[11px] text-amber-200">
                This target has a design RL. Enter the observed RL before METARDU can verify this 3D set-out.
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
          disabled={saving || !verdict || verdict.result === 'INFO'}
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
