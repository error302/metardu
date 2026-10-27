'use client'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { z } from 'zod'
import { Download, RefreshCw, Undo2, X } from 'lucide-react'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import type { RoadDesignData } from '@/types/engineering'
import type { RoadWorkbenchDraft } from '@/lib/engineering/roadWorkbenchDraft'
import {
  roadWorkbenchSourceSchema,
  roadWorkbenchOutcomeSchema,
  normalizedRoadJson,
  type RoadWorkbenchSource,
  type RoadWorkbenchCommand,
} from '@/lib/engineering/roadWorkbenchRecoveryContract'
import {
  readRoadRecovery,
  writeRoadRecovery,
  clearRoadRecovery,
  validateRoadOutcome,
  retainCancelledRoadDraft,
  roadRecoveryKey,
  type RetainedRoadRecovery,
  type RoadRecoveryRecord,
} from '@/lib/engineering/roadWorkbenchRecoveryDevice'
import RoadWorkbenchEditor from './RoadWorkbenchEditor'
import RoadWorkbench from './RoadWorkbench'
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded border border-[var(--border-color)] px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40'
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.name === 'AbortError'
      ? 'The request was interrupted. Retry recovery when the connection is available.'
      : cause.message
    : 'Road recovery could not be confirmed. Your original device record was preserved.'
export default function RecoverableRoadWorkbench({
  projectId,
}: {
  projectId: string
}) {
  const { data, status } = useSession()
  const actor = z.string().uuid().safeParse(data?.user?.id)
  if (status === 'loading')
    return <p role="status">Reading your signed-in account…</p>
  if (status !== 'authenticated' || !actor.success)
    return (
      <p role="alert">Sign in to recover or edit your saved road project.</p>
    )
  return (
    <Controller
      key={`${actor.data}:${projectId}`}
      actor={actor.data}
      project={projectId}
    />
  )
}
function Controller({ actor, project }: { actor: string; project: string }) {
  const [source, setSource] = useState<RoadWorkbenchSource | null>(null),
    [retained, setRetained] = useState<RetainedRoadRecovery | null>(null)
  const [seed, setSeed] = useState<RoadWorkbenchDraft | undefined>(),
    [epoch, setEpoch] = useState(0)
  const [notice, setNotice] = useState(
      'Reading saved source and device recovery…',
    ),
    [problem, setProblem] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [showLatest, setShowLatest] = useState(false)
  const current = useRef<RetainedRoadRecovery | null>(null),
    sourceRef = useRef<RoadWorkbenchSource | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve()),
    blocked = useRef(false),
    active = useRef(false),
    pendingOperation = useRef(false),
    sequence = useRef(0)
  const lifetime = useRef<AbortController | null>(null)
  const latestDraft = useRef<RoadWorkbenchDraft | null>(null)
  const loadGeneration = useRef(0)
  const getSource = useCallback(async () => {
    const response = await fetch(
      `/api/engineering/road-workbench?project_id=${encodeURIComponent(project)}&expected_user_id=${encodeURIComponent(actor)}`,
      { cache: 'no-store', signal: lifetime.current?.signal },
    )
    const input: unknown = await response.json()
    if (!response.ok) throw Error(errorFrom(input))
    const parsed = z
      .object({ source: roadWorkbenchSourceSchema })
      .strict()
      .safeParse(input)
    if (!parsed.success)
      throw Error(
        'The saved road response is incomplete. Its device copy was preserved; retry recovery.',
      )
    const value = parsed.data.source
    if (value.actorId !== actor || value.projectId !== project)
      throw Error(
        'The saved source did not match the original account and project.',
      )
    return value
  }, [actor, project])
  const initialize = useCallback(async () => {
    const generation = ++loadGeneration.current,
      belongs = () => active.current && loadGeneration.current === generation
    setReady(false)
    setProblem('')
    blocked.current = false
    try {
      const saved = await getSource()
      if (!belongs()) return
      sourceRef.current = saved
      setSource(saved)
      const device = await readRoadRecovery(actor, project)
      if (!belongs()) return
      current.current = device
      setRetained(device)
      setSeed(device?.record.draft)
      setEpoch((v) => v + 1)
      setNotice(
        device
          ? device.record.command
            ? 'Recovered original unconfirmed save. Check, retry or cancel that same request.'
            : 'Recovered unfinished road inputs from this device.'
          : 'Device recovery is ready. Edits will be retained on this device before saving.',
      )
      setReady(true)
    } catch (cause) {
      if (belongs()) {
        blocked.current = true
        setProblem(message(cause))
      }
    }
  }, [actor, project, getSource])
  useEffect(() => {
    active.current = true
    lifetime.current = new AbortController()
    void initialize()
    return () => {
      active.current = false
      loadGeneration.current += 1
      lifetime.current?.abort()
    }
  }, [initialize])
  const conflict =
    !!retained &&
    !!source &&
    (retained.record.source.engineeringHash !== source.engineeringHash ||
      retained.record.source.referenceHash !== source.referenceHash)
  const draftChanged = useCallback(
    (draft: RoadWorkbenchDraft, dirty: boolean) => {
      latestDraft.current = normalizedRoadJson(draft)
      if (
        blocked.current ||
        pendingOperation.current ||
        current.current?.record.command ||
        !sourceRef.current
      )
        return
      if (
        current.current &&
        canonicalJson(current.current.record.draft) === canonicalJson(draft)
      )
        return
      if (!dirty && !current.current) return
      const version = ++sequence.current,
        snapshot = normalizedRoadJson(draft)
      setNotice('Retaining current inputs on this device…')
      queue.current = queue.current
        .then(async () => {
          if (blocked.current) return
          const previous = current.current,
            base = previous?.record.source ?? sourceRef.current
          if (!base)
            throw Error(
              'The original road source is unavailable. No save was sent.',
            )
          const record: RoadRecoveryRecord = {
            version: 1,
            actorId: actor,
            projectId: project,
            entryId: previous?.record.entryId ?? crypto.randomUUID(),
            sequence: (previous?.record.sequence ?? 0) + 1,
            source: base,
            draft: snapshot,
            command: null,
            updatedAt: new Date().toISOString(),
          }
          const next = await writeRoadRecovery(record, previous?.digest ?? null)
          current.current = next
          if (active.current) {
            setRetained(next)
            if (sequence.current === version)
              setNotice(
                'Current inputs retained on this device. Save the road draft to retain it on the server.',
              )
          }
        })
        .catch((cause) => {
          blocked.current = true
          if (active.current) {
            setProblem(message(cause))
            setNotice(
              'Device retention is unconfirmed. Keep this page open or download the recovery file; no new save will be sent.',
            )
          }
        })
    },
    [actor, project],
  )
  const request = async (
    operation: 'commit' | 'cancel' | 'status',
    command: RoadWorkbenchCommand,
  ) => {
    const controller = new AbortController(),
      abort = () => controller.abort(),
      signal = lifetime.current?.signal
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(abort, 60000)
    try {
      const response = await fetch('/api/engineering/road-workbench', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, command }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const input: unknown = await response.json()
      if (!response.ok) throw Error(errorFrom(input))
      const parsed = z
        .object({ outcome: roadWorkbenchOutcomeSchema.nullable() })
        .strict()
        .safeParse(input)
      if (!parsed.success)
        throw Error(
          'The road response did not contain a valid final outcome. The original request remains retained on this device.',
        )
      return parsed.data.outcome
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  const settle = async (saved: RetainedRoadRecovery, input: unknown) => {
    if (input == null) {
      setNotice(
        'No final outcome was found. The original request remains retained; retry it or cancel it before editing.',
      )
      return false
    }
    const outcome = await validateRoadOutcome(saved.record, input)
    if (!active.current) return false
    if (outcome.state === 'cancelled') {
      const replacement = await retainCancelledRoadDraft(saved, outcome)
      current.current = replacement
      setRetained(replacement)
      setSeed(replacement.record.draft)
      setEpoch((v) => v + 1)
      setNotice(
        'Cancellation confirmed. The original save cannot apply later; the unfinished inputs remain retained on this device.',
      )
      return false
    }
    await clearRoadRecovery(saved, outcome)
    current.current = null
    setRetained(null)
    // Retain the acknowledged draft as the visible source if the fresh read is interrupted.
    const acknowledged: RoadWorkbenchSource = {
      version: 1,
      actorId: actor,
      projectId: project,
      engineeringHash: outcome.engineeringHash,
      referenceHash: outcome.referenceHash,
      road: outcome.road,
      reference: outcome.reference,
    }
    sourceRef.current = acknowledged
    setSource(acknowledged)
    setSeed(undefined)
    setEpoch((v) => v + 1)
    try {
      const latest = await getSource()
      if (!active.current) return false
      sourceRef.current = latest
      setSource(latest)
      setNotice(
        latest.engineeringHash === acknowledged.engineeringHash &&
          latest.referenceHash === acknowledged.referenceHash
          ? 'Road save confirmed. The exact request and design are retained on the server.'
          : 'Original road save confirmed. The project has since changed; the latest saved source is displayed.',
      )
    } catch (cause) {
      blocked.current = true
      setProblem(message(cause))
      setNotice(
        'The original save is confirmed. Refresh the saved source before editing again.',
      )
    }
    return true
  }
  const save = async (road: RoadDesignData) => {
    if (pendingOperation.current || blocked.current) return false
    pendingOperation.current = true
    setBusy(true)
    setProblem('')
    try {
      await queue.current
      if (!active.current || blocked.current)
        throw Error(
          'The current inputs were not confirmed on this device. No save was sent.',
        )
      const previous = current.current
      if (!previous)
        throw Error('Retain the current inputs on this device before saving.')
      const c: RoadWorkbenchCommand = {
        version: 1,
        actorId: actor,
        projectId: project,
        requestId: crypto.randomUUID(),
        expectedEngineeringHash: previous.record.source.engineeringHash,
        expectedReferenceHash: previous.record.source.referenceHash,
        road: normalizedRoadJson(road),
      }
      const pending = await writeRoadRecovery(
        {
          ...previous.record,
          sequence: previous.record.sequence + 1,
          command: c,
          updatedAt: new Date().toISOString(),
        },
        previous.digest,
      )
      current.current = pending
      setRetained(pending)
      setNotice(
        'Original save request retained on this device. Waiting for its final outcome…',
      )
      if (!active.current) return false
      return await settle(pending, await request('commit', c))
    } catch (cause) {
      if (active.current) {
        setProblem(message(cause))
        setNotice(
          current.current?.record.command
            ? 'Original save is unconfirmed and retained on this device. Check, retry or cancel the same request.'
            : 'Save was not sent. Keep these inputs for device recovery.',
        )
      }
      return false
    } finally {
      pendingOperation.current = false
      if (active.current) setBusy(false)
    }
  }
  const recover = async (operation: 'status' | 'commit' | 'cancel') => {
    const saved = current.current,
      command = saved?.record.command
    if (pendingOperation.current || !saved || !command) return
    pendingOperation.current = true
    setBusy(true)
    setProblem('')
    try {
      await settle(saved, await request(operation, command))
    } catch (cause) {
      if (active.current) setProblem(message(cause))
    } finally {
      pendingOperation.current = false
      if (active.current) setBusy(false)
    }
  }
  const discard = async () => {
    if (pendingOperation.current) return
    pendingOperation.current = true
    setBusy(true)
    setProblem('')
    try {
      await queue.current
      const previous = current.current
      if (previous?.record.command)
        throw Error(
          'Recover or cancel the original unconfirmed save before discarding its inputs.',
        )
      if (previous) await clearRoadRecovery(previous, undefined)
      current.current = null
      blocked.current = false
      setRetained(null)
      setSeed(undefined)
      await initialize()
    } catch (cause) {
      blocked.current = true
      if (active.current) setProblem(message(cause))
    } finally {
      pendingOperation.current = false
      if (active.current) setBusy(false)
    }
  }
  const download = () => {
    try {
      const raw = JSON.stringify(
        {
          version: 1,
          actorId: actor,
          projectId: project,
          deviceRecordRaw: window.localStorage.getItem(
            roadRecoveryKey(actor, project),
          ),
          source: sourceRef.current,
          currentInputs: latestDraft.current,
        },
        null,
        2,
      )
      const url = URL.createObjectURL(
          new Blob([raw], { type: 'application/json' }),
        ),
        a = document.createElement('a')
      a.href = url
      a.download = `metardu-road-recovery-${project}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (cause) {
      setProblem(message(cause))
    }
  }
  const pending = retained?.record.command
  const editing = retained?.record.source ?? source
  const terrainEngineeringHash=editing?.engineeringHash,terrainReferenceHash=editing?.referenceHash
  const terrainScope=useMemo(()=>terrainEngineeringHash&&terrainReferenceHash?{actorId:actor,projectId:project,engineeringHash:terrainEngineeringHash,referenceHash:terrainReferenceHash}:undefined,[actor,project,terrainEngineeringHash,terrainReferenceHash])
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Recoverable road workspace"
    >
      <div className="space-y-3 border-y border-[var(--border-color)] py-3">
        <p
          role="status"
          aria-label="Device recovery status"
          className="text-sm text-[var(--text-secondary)]"
        >
          {notice}
        </p>
        {problem && (
          <p role="alert" className="border-l-2 border-amber-500 pl-3 text-sm">
            {problem}
          </p>
        )}
        {conflict && (
          <p className="border-l-2 border-amber-500 pl-3 text-sm">
            The saved project changed while these device inputs were unfinished.
            Their original source is retained; saving is blocked. Review the
            latest saved design and retain a recovery copy before discarding or
            transferring inputs.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {pending && (
            <>
              <button
                type="button"
                disabled={busy}
                className={button}
                onClick={() => void recover('status')}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Check original save outcome
              </button>
              <button
                type="button"
                disabled={busy}
                className={button}
                onClick={() => void recover('commit')}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Retry original save
              </button>
              <button
                type="button"
                disabled={busy}
                className={button}
                onClick={() => void recover('cancel')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel pending save
              </button>
            </>
          )}
          {(retained || problem) && (
            <button type="button" className={button} onClick={download}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download recovery file
            </button>
          )}
          {conflict && (
            <button
              type="button"
              className={button}
              onClick={() => setShowLatest((v) => !v)}
            >
              {showLatest
                ? 'Hide latest saved design'
                : 'View latest saved design'}
            </button>
          )}
          {problem && !pending && !ready && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void initialize()}
            >
              Retry recovery read
            </button>
          )}
        </div>
      </div>
      {showLatest && source && (
        <RoadWorkbench
          road={source.road}
          reference={source.reference}
          projectId={project}
          sourceLabel="Latest saved source · separate review"
        />
      )}
      {ready && editing && (
        <RoadWorkbenchEditor
          key={`${actor}:${project}:${epoch}`}
          projectId={project}
          road={editing.road}
          reference={editing.reference}
          initialDraft={seed}
          terrainScope={terrainScope}
          onDraftChange={draftChanged}
          retainedDraftIdentity={
            retained ? canonicalJson(retained.record.draft) : undefined
          }
          onDiscard={() => void discard()}
          onSave={save}
          disabled={busy || !!pending || conflict || blocked.current}
        />
      )}
    </section>
  )
}
function errorFrom(input: unknown) {
  const parsed = z
    .object({ error: z.union([z.string(), z.object({ message: z.string() })]) })
    .passthrough()
    .safeParse(input)
  return parsed.success
    ? typeof parsed.data.error === 'string'
      ? parsed.data.error
      : parsed.data.error.message
    : 'The road request could not be confirmed. Its device record was retained.'
}
