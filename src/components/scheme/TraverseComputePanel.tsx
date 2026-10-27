'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { z } from 'zod'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import {
  computeRetainedTraverse,
  TRAVERSE_PROTOCOL,
  traverseCommandSchema,
  traverseReadSchema,
  traverseOutcomeSchema,
  type RetainedTraverse,
} from '@/lib/scheme/traverseContract'
import {
  prepareTraversePending,
  readTraversePending,
  validateTraverseAcknowledgement,
  clearTraversePending,
  traversePendingKey,
  type PendingTraverse,
} from '@/lib/scheme/traversePending'
import TraverseObservationForm, {
  emptyTraverseEntry,
  traverseAction as action,
} from './TraverseObservationForm'

type ReadData = z.infer<typeof traverseReadSchema>['data']
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' }),
    body: unknown = await response.json()
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body)
    throw Error(
      error.success
        ? error.data.error
        : 'The retained traverse request could not be acknowledged.',
    )
  }
  return z.object({ data: z.unknown().optional() }).parse(body).data
}
export default function TraverseComputePanel({
  projectId,
  parcelId,
}: {
  projectId: string
  parcelId: string
}) {
  const { data: session, status } = useSession(),
    actor = session?.user?.id
  if (status === 'loading')
    return <p role="status">Checking the current account…</p>
  if (status !== 'authenticated' || !actor)
    return <p role="alert">Sign in to read this parcel traverse.</p>
  return (
    <RetainedPanel
      key={`${actor}:${projectId}:${parcelId}`}
      actor={actor}
      projectId={projectId}
      parcelId={parcelId}
    />
  )
}
function RetainedPanel({
  actor,
  projectId,
  parcelId,
}: {
  actor: string
  projectId: string
  parcelId: string
}) {
  const [data, setData] = useState<ReadData | null>(null),
    [selected, setSelected] = useState<RetainedTraverse | null>(null)
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [pending, setPending] = useState<PendingTraverse | null>(null),
    [deviceError, setDeviceError] = useState(''),
    [rawDevice, setRawDevice] = useState<string | null>(null)
  const [entry, setEntry] = useState(emptyTraverseEntry),
    [reviewed, setReviewed] = useState(false),
    [pointPage, setPointPage] = useState(0),
    [formVersion, setFormVersion] = useState(0)
  const [deviceReady, setDeviceReady] = useState(false),
    [frameReady, setFrameReady] = useState(false)
  const alive = useRef(true),
    inFlight = useRef(false),
    readVersion = useRef(0)
  function query(extra: Record<string, string> = {}) {
    return (
      '/api/scheme/traverse?' +
      new URLSearchParams({
        project_id: projectId,
        parcel_id: parcelId,
        expected_user_id: actor,
        ...extra,
      })
    )
  }
  async function load(
    extra: Record<string, string> = {},
    keepSelection = false,
    signal?: AbortSignal,
  ) {
    const generation = ++readVersion.current
    setLoading(true)
    setFrameReady(false)
    setReviewed(false)
    setError('')
    try {
      const value = traverseReadSchema.parse({
        data: await request(query(extra), { signal }),
      }).data
      if (
        value.context.actorId !== actor ||
        value.context.projectId !== projectId ||
        value.context.parcelId !== parcelId
      )
        throw Error(
          'The retained source does not match the current account and parcel.',
        )
      if (
        value.selected &&
        (value.selected.receipt.projectId !== projectId ||
          value.selected.receipt.parcelId !== parcelId)
      )
        throw Error(
          'The retained revision belongs to a different project or parcel.',
        )
      if (alive.current && generation === readVersion.current) {
        setData(value)
        setFrameReady(true)
        if (!keepSelection) {
          setSelected(value.selected)
          setPointPage(0)
        }
      }
    } catch (failure) {
      if (
        alive.current &&
        generation === readVersion.current &&
        !signal?.aborted
      )
        setError(
          failure instanceof z.ZodError
            ? 'The retained read could not be validated. Keep the original evidence and retry.'
            : failure instanceof Error
              ? failure.message
              : 'Source read failed.',
        )
    } finally {
      if (alive.current && generation === readVersion.current) setLoading(false)
    }
  }
  async function readDevice() {
    try {
      const record = await readTraversePending(actor, projectId, parcelId)
      if (alive.current) {
        setPending(record)
        setDeviceError('')
        setRawDevice(
          localStorage.getItem(traversePendingKey(actor, projectId, parcelId)),
        )
      }
    } catch (failure) {
      if (alive.current) {
        setDeviceError(
          failure instanceof Error
            ? failure.message
            : 'Device storage is unavailable. No computation was sent.',
        )
        try {
          setRawDevice(
            localStorage.getItem(
              traversePendingKey(actor, projectId, parcelId),
            ),
          )
        } catch {
          /* Preserve unreadable storage. */
        }
      }
    } finally {
      if (alive.current) setDeviceReady(true)
    }
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void load({}, false, controller.signal)
    void readDevice()
    return () => {
      alive.current = false
      controller.abort()
    }
    // The keyed component fixes the account, project and parcel for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function begin() {
    if (inFlight.current || !alive.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    return true
  }
  function finish() {
    inFlight.current = false
    if (alive.current) setBusy(false)
  }
  async function acknowledge(record: PendingTraverse, value: unknown) {
    const retained = await validateTraverseAcknowledgement(record, value)
    if (!alive.current) return
    await clearTraversePending(record, retained.receipt)
    if (!alive.current) return
    setPending(null)
    setRawDevice(null)
    setSelected(retained)
    setPointPage(0)
    setReviewed(false)
    setNotice(
      `Retained revision ${retained.receipt.ordinal}. Original observations and the numerical draft are available.`,
    )
    await load({}, true)
  }
  async function acceptOutcome(record: PendingTraverse, value: unknown) {
    const outcome = traverseOutcomeSchema.parse(value)
    if (outcome.state === 'cancelled') {
      if (!alive.current) return
      await clearTraversePending(record, outcome)
      if (alive.current) {
        setPending(null)
        setRawDevice(null)
        setNotice(
          'Cancellation acknowledged. The original form remains available.',
        )
        setReviewed(false)
      }
    } else {
      const result = traverseReadSchema.parse({
        data: await request(query({ revision_id: outcome.revisionId })),
      }).data
      if (!result.selected)
        throw Error(
          'The committed revision could not be recovered. The device record was preserved.',
        )
      await acknowledge(record, result.selected)
    }
  }
  async function save(original?: PendingTraverse) {
    if (!begin()) return
    let record = original
    try {
      if (!record) {
        const context = data?.context
        if (
          !context ||
          !frameReady ||
          !deviceReady ||
          context.prerequisites.length ||
          !context.sourceCrs ||
          !context.adoptedFactor ||
          !reviewed ||
          deviceError
        )
          throw Error(
            'Review the project frame, observations and device record before retaining.',
          )
        const body = traverseCommandSchema.parse({
          ...entry,
          protocol: TRAVERSE_PROTOCOL,
          requestId: crypto.randomUUID(),
          expectedUserId: actor,
          projectId,
          parcelId,
          evidenceHash: context.evidenceHash,
          sourceCrs: context.sourceCrs,
          baseRevisionId: context.latestRevisionId,
          convention: 'clockwise_bs_to_fs_face_pair_zenith_metres',
          reduction: {
            combinedScaleFactor: context.adoptedFactor,
            reference: entry.reduction.reference,
          },
          reviewed,
        })
        if (body.control.openingRL.trim() && !context.verticalDatum)
          throw Error(
            'Declare the vertical datum before retaining absolute levels.',
          )
        computeRetainedTraverse(body)
        record = await prepareTraversePending(body)
        if (!alive.current) return
        setPending(record)
        setRawDevice(JSON.stringify(record))
      }
      if (!alive.current) return
      await acknowledge(
        record,
        await request('/api/scheme/traverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record.body),
        }),
      )
    } catch (failure) {
      if (alive.current) {
        setError(
          failure instanceof z.ZodError
            ? record
              ? 'The server acknowledgement could not be validated. Keep the device record and recover or retry the original request.'
              : 'Complete the required source fields and review the observation convention.'
            : failure instanceof Error
              ? failure.message
              : 'The save is unconfirmed. Keep the device record.',
        )
        await readDevice()
      }
    } finally {
      finish()
    }
  }
  async function resolve(cancel: boolean) {
    if (!pending || !begin()) return
    const record = pending,
      b = record.body
    try {
      const value = cancel
        ? await request('/api/scheme/traverse?action=cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expectedUserId: actor,
              projectId,
              parcelId,
              requestId: b.requestId,
              inputHash: record.inputHash,
            }),
          })
        : z
            .object({ outcome: traverseOutcomeSchema })
            .parse(await request(query({ request_id: b.requestId }))).outcome
      await acceptOutcome(record, value)
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof z.ZodError
            ? 'The server outcome could not be validated. Keep the original device request.'
            : failure instanceof Error
              ? failure.message
              : 'The outcome remains unconfirmed. Keep the original request.',
        )
    } finally {
      finish()
    }
  }
  function downloadDevice() {
    if (rawDevice === null) return
    const href = URL.createObjectURL(
        new Blob([rawDevice], { type: 'application/json' }),
      ),
      a = document.createElement('a')
    a.href = href
    a.download = `metardu-traverse-device-${parcelId}.json`
    a.click()
    URL.revokeObjectURL(href)
  }
  const locked = busy || !!pending || !!deviceError || !deviceReady
  return (
    <div className="min-w-0 space-y-6" aria-label="Retained parcel traverse">
      <header className="space-y-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <GeomaticsIcon symbol="total-station" />
          Original observations
        </h3>
        <p className="max-w-prose text-sm text-[var(--text-secondary)]">
          Retain a paired-face traverse as a numerical draft. Boundary vertices,
          parcel area and cadastral acceptance require a separate review.
        </p>
      </header>
      {loading && (
        <p role="status" className="text-sm">
          Reading the retained project frame…
        </p>
      )}
      {(error || deviceError) && (
        <div
          role="alert"
          className="space-y-2 break-words rounded-lg border border-red-500/40 p-3 text-sm"
        >
          {deviceError && <p>{deviceError}</p>}
          {error && <p>{error}</p>}
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void load({}, !!selected)}
            className={action}
          >
            Retry loading traverse
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--border-color)] p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {rawDevice !== null && (
        <button type="button" className={action} onClick={downloadDevice}>
          Download device record
        </button>
      )}
      {pending && (
        <aside
          className="space-y-3 rounded-lg border border-[var(--border-color)] p-4"
          aria-label="Unconfirmed request"
        >
          <h4 className="font-medium">
            Unconfirmed request retained on this device
          </h4>
          <p className="break-all font-mono text-xs">
            {pending.body.requestId}
          </p>
          <p className="text-sm">
            Recover the final receipt or retry the original request.
            Cancellation also requires server acknowledgement.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={action}
              onClick={() => void resolve(false)}
            >
              Recover receipt
            </button>
            <button
              type="button"
              disabled={busy}
              className={action}
              onClick={() => void save(pending)}
            >
              Retry original save
            </button>
            <button
              type="button"
              disabled={busy}
              className={action}
              onClick={() => void resolve(true)}
            >
              Cancel request
            </button>
          </div>
        </aside>
      )}
      {data && (
        <section
          className="space-y-2 border-y border-[var(--border-color)] py-3 text-sm"
          aria-label="Declared project frame"
        >
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Project grid
              </dt>
              <dd className="font-mono">
                {data.context.sourceCrs ?? 'Not declared'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Adopted ground-to-grid factor
              </dt>
              <dd className="font-mono">
                {data.context.adoptedFactor ?? 'Not declared'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Vertical datum
              </dt>
              <dd>
                {data.context.verticalDatum ??
                  'Not declared; absolute levels unavailable'}
              </dd>
            </div>
          </dl>
          {data.context.prerequisites.map((reason) => (
            <p key={reason} className="text-amber-700 dark:text-amber-300">
              {reason}
            </p>
          ))}
        </section>
      )}
      <TraverseObservationForm
        key={formVersion}
        entry={entry}
        change={setEntry}
        context={data?.context ?? null}
        disabled={locked || loading || !frameReady}
        reviewed={reviewed}
        setReviewed={setReviewed}
        onSave={() => void save()}
        onFileError={setError}
      />
      {data && (
        <section
          className="space-y-3 border-t border-[var(--border-color)] pt-4"
          aria-label="Retained history"
        >
          <h4 className="font-medium">Retained revisions</h4>
          {data.revisions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No retained revisions were found in this confirmed read.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {data.revisions.map((row) => (
                <li
                  key={row.revisionId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    Revision {row.ordinal} · {row.name}
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {row.createdAt} · Draft, unverified
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy || loading}
                    className={action}
                    onClick={() =>
                      void load({ revision_id: row.revisionId }, false)
                    }
                  >
                    Read revision {row.ordinal}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {data.beforeOrdinal !== null && (
              <button
                type="button"
                disabled={busy || loading}
                className={action}
                onClick={() => void load({}, true)}
              >
                Newest history
              </button>
            )}
            {data.hasMore && data.nextBeforeOrdinal !== null && (
              <button
                type="button"
                disabled={busy || loading}
                className={action}
                onClick={() =>
                  void load(
                    { before_ordinal: String(data.nextBeforeOrdinal) },
                    true,
                  )
                }
              >
                Older history
              </button>
            )}
          </div>
        </section>
      )}
      {selected && (
        <section
          className="min-w-0 space-y-3 border-t border-[var(--border-color)] pt-4"
          aria-label="Retained numerical draft"
        >
          <h4 className="font-medium">
            Revision {selected.receipt.ordinal} · {selected.input.name}
          </h4>
          <p className="text-sm">
            Draft, unverified · {selected.result.assessment.reason}
          </p>
          {!selected.currentReferenceMatches && (
            <p className="rounded border border-amber-500/40 p-3 text-sm">
              The project reference changed after this revision. Its coordinates
              remain in the retained source grid. Reuse requires a reviewed
              transformation; copying into the current grid is unavailable.
            </p>
          )}
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Source grid
              </dt>
              <dd>{selected.input.sourceCrs}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Linear misclosure (m)
              </dt>
              <dd className="font-mono">
                {selected.result.linearError ?? 'Not assessed'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">
                Precision ratio
              </dt>
              <dd className="font-mono">
                {selected.result.precisionRatio === null
                  ? 'Not assessed'
                  : selected.result.precisionRatio === 0
                    ? 'Zero computed misclosure'
                    : `1:${selected.result.precisionRatio}`}
              </dd>
            </div>
          </dl>
          {selected.result.coordinateWarnings.map((warning) => (
            <p key={warning} className="text-sm">
              {warning}
            </p>
          ))}
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <caption className="mb-2 text-left">
                Retained coordinate path; display values keep the stored
                numerical precision.
              </caption>
              <thead>
                <tr>
                  {['Station', 'Easting (m)', 'Northing (m)', 'Level (m)'].map(
                    (label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {selected.result.coordinates
                  .slice(pointPage * 50, pointPage * 50 + 50)
                  .map((point, index) => (
                    <tr
                      key={index}
                      className="border-t border-[var(--border-color)]"
                    >
                      <td className="p-2">{point.station}</td>
                      <td className="p-2 font-mono">{point.easting}</td>
                      <td className="p-2 font-mono">{point.northing}</td>
                      <td className="p-2 font-mono">{point.rl ?? 'Unknown'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {selected.result.coordinates.length > 50 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={action}
                disabled={pointPage === 0}
                onClick={() => setPointPage(pointPage - 1)}
              >
                Previous coordinates
              </button>
              <span className="text-xs">
                {pointPage + 1} of{' '}
                {Math.ceil(selected.result.coordinates.length / 50)}
              </span>
              <button
                type="button"
                className={action}
                disabled={
                  (pointPage + 1) * 50 >= selected.result.coordinates.length
                }
                onClick={() => setPointPage(pointPage + 1)}
              >
                Next coordinates
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={locked || loading || !selected.currentReferenceMatches}
              className={action}
              onClick={() => {
                setEntry({
                  ...selected.input,
                  derivedFromRevisionId: selected.receipt.revisionId,
                })
                setFormVersion((v) => v + 1)
                setReviewed(false)
                setNotice(
                  'Original inputs copied. Review against the current project grid and adopted factor before retaining a new revision.',
                )
              }}
            >
              Edit as new revision
            </button>
            <Link
              className={action}
              href={`/project/${projectId}/scheme/boundary-review?parcel=${parcelId}&traverse=${selected.receipt.traverseId}`}
            >
              Review boundary vertices
            </Link>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer">Retained evidence</summary>
            <dl className="mt-2 space-y-2 break-all font-mono">
              {[
                ['Revision', selected.receipt.revisionId],
                ['Original issuer', selected.receipt.actorId],
                ['Engine', selected.receipt.engineVersion],
                ['Input SHA-256', selected.receipt.inputHash],
                ['Source SHA-256', selected.receipt.sourceHash],
                ['Result SHA-256', selected.receipt.resultHash],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}
    </div>
  )
}
