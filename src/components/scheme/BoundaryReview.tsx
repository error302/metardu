'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { ArrowDown, ArrowUp, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import {
  boundaryDirectorySchema,
  boundaryReceiptSchema,
  boundarySourceSchema,
  prepareBoundary,
  BOUNDARY_VERTEX_LIMIT,
  type BoundaryCommand,
  type BoundaryReceipt,
  type BoundarySource,
} from '@/lib/scheme/boundaryReview'
import {
  BoundarySaveRefusal,
  createParcelFromTraverse,
} from '@/lib/map/traverseToParcel'
const action =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-40'
type Directory = z.infer<typeof boundaryDirectorySchema>
async function read(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-store' }),
    body: unknown = await response.json()
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body)
    throw new Error(
      parsed.success
        ? parsed.data.error
        : 'The retained boundary source could not be read.',
    )
  }
  return z.object({ data: z.unknown() }).parse(body).data
}
export default function BoundaryReview({
  projectId,
  parcelId,
  initialTraverseId = '',
}: {
  projectId: string
  parcelId: string
  initialTraverseId?: string
}) {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [page, setPage] = useState(1),
    [traverse, setTraverse] = useState(initialTraverseId),
    [source, setSource] = useState<BoundarySource | null>(null)
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [order, setOrder] = useState<string[]>([]),
    [pointPage, setPointPage] = useState(1),
    [readRetry, setReadRetry] = useState(0)
  const [picked, setPicked] = useState<
      Record<string, BoundarySource['points'][number]>
    >({}),
    [filter, setFilter] = useState(''),
    [filterDraft, setFilterDraft] = useState(''),
    [sourceReady, setSourceReady] = useState(false)
  const sourceContext = useRef(''),
    confirmedSource = useRef<BoundarySource | null>(null),
    pickedRef = useRef<Record<string, BoundarySource['points'][number]>>({})
  const [reviewed, setReviewed] = useState(false),
    [note, setNote] = useState(''),
    [saving, setSaving] = useState(false),
    [pending, setPending] = useState<BoundaryCommand | null>(null),
    [receipt, setReceipt] = useState<BoundaryReceipt | null>(null)
  const mounted = useRef(true),
    inFlight = useRef(false)
  const [recoveryId, setRecoveryId] = useState(''),
    [recovered, setRecovered] = useState<BoundaryReceipt | null>(null),
    [recovering, setRecovering] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!parcelId) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const query = new URLSearchParams({
          parcel_id: parcelId,
          page: String(page),
        })
        const data = boundaryDirectorySchema.parse(
          await read(
            `/api/project/${projectId}/scheme/parcel-boundary?${query}`,
            controller.signal,
          ),
        )
        if (
          data.projectId !== projectId ||
          data.parcelId !== parcelId ||
          data.page !== Math.min(page, Math.max(1, Math.ceil(data.total / 24)))
        )
          throw new Error(
            'The traverse directory does not match the selected parcel.',
          )
        if (active) setDirectory(data)
      } catch (failure) {
        if (active)
          setError(
            failure instanceof z.ZodError
              ? 'The retained source response is inconsistent. Keep the original evidence and retry.'
              : failure instanceof Error
                ? failure.message
                : 'Source read failed.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId, parcelId, page, refresh, readRetry])
  useEffect(() => {
    const context = `${projectId}:${parcelId}:${traverse}:${refresh}`
    if (sourceContext.current !== context) {
      sourceContext.current = context
      confirmedSource.current = null
      pickedRef.current = {}
      setSource(null)
      setSourceReady(false)
      setOrder([])
      setPicked({})
      setPointPage(1)
      setFilter('')
      setFilterDraft('')
      setReceipt(null)
      if (pointPage !== 1 || filter) return
    }
    setReviewed(false)
    setSourceReady(false)
    if (!traverse) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const query = new URLSearchParams({
          parcel_id: parcelId,
          traverse_id: traverse,
          coordinate_page: String(pointPage),
          ...(filter ? { coordinate_q: filter } : {}),
        })
        const data = boundarySourceSchema.parse(
          await read(
            `/api/project/${projectId}/scheme/parcel-boundary?${query}`,
            controller.signal,
          ),
        )
        if (
          data.projectId !== projectId ||
          data.parcelId !== parcelId ||
          data.traverseId !== traverse
        )
          throw new Error(
            'The retained coordinates do not match the selected source.',
          )
        if (
          data.pointWindow
            ? data.pointWindow.page !== pointPage ||
              data.pointWindow.filter !== filter
            : pointPage !== 1 || filter !== ''
        )
          throw new Error(
            'The coordinate window does not match the requested page and filter.',
          )
        if (active) {
          const previous = confirmedSource.current
          if (previous && previous.evidenceHash !== data.evidenceHash) {
            setOrder([])
            setPicked({})
            pickedRef.current = {}
            setError(
              'The retained source changed. Previous vertex selections were cleared; review the current source.',
            )
          } else if (
            data.points.some(
              (point) =>
                pickedRef.current[point.id] &&
                JSON.stringify(pickedRef.current[point.id]) !==
                  JSON.stringify(point),
            )
          )
            throw new Error(
              'A selected coordinate changed without a matching source fingerprint. Reload the source before review.',
            )
          confirmedSource.current = data
          setSource(data)
          setSourceReady(true)
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof z.ZodError
              ? 'The coordinate window could not be validated. Your chosen vertices were preserved; retry the read.'
              : failure instanceof Error
                ? failure.message
                : 'Source read failed.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId, parcelId, traverse, refresh, pointPage, filter, readRetry])
  const selected = source
    ? order.flatMap((id) => (picked[id] ? [picked[id]] : []))
    : []
  const reviewSource: BoundarySource | null = source
    ? { ...source, points: selected, pointWindow: undefined }
    : null
  let geometry: ReturnType<typeof prepareBoundary> | null = null,
    geometryError = 'Choose at least three boundary vertices in order.'
  if (reviewSource && order.length >= 3) {
    try {
      geometry = prepareBoundary(reviewSource, order, reviewSource.sourceCrs)
    } catch (failure) {
      geometryError =
        failure instanceof Error
          ? failure.message
          : 'Review the boundary order.'
    }
  }
  const locked = saving || pending !== null || receipt !== null
  const sourceLocked = locked || !sourceReady
  function move(index: number, delta: number) {
    setReviewed(false)
    setOrder((values) => {
      const next = [...values]
      ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
      return next
    })
  }
  async function save() {
    if (
      !source ||
      !reviewSource ||
      !sourceReady ||
      !geometry ||
      (!reviewed && !pending) ||
      inFlight.current
    )
      return
    const command = pending ?? {
      parcel_id: parcelId,
      traverse_id: source.traverseId,
      request_id: crypto.randomUUID(),
      evidence_hash: source.evidenceHash,
      source_crs: source.sourceCrs,
      ordered_coordinate_ids: [...order],
      reviewed: true as const,
      note,
    }
    setPending(command)
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const result = await createParcelFromTraverse(projectId, parcelId, {
        command,
        source: reviewSource,
      })
      if (mounted.current) {
        setReceipt(result)
        setPending(null)
      }
    } catch (failure) {
      if (mounted.current) {
        if (failure instanceof BoundarySaveRefusal) {
          setPending(null)
          setReviewed(false)
        }
        setError(
          failure instanceof Error
            ? failure.message
            : 'The draft save is unconfirmed. Retry the exact request.',
        )
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
    }
  }
  async function recover() {
    if (!z.string().uuid().safeParse(recoveryId.trim()).success) {
      setError('Enter the saved boundary request UUID.')
      return
    }
    setRecovering(true)
    setError('')
    setRecovered(null)
    try {
      const query = new URLSearchParams({
          parcel_id: parcelId,
          request_id: recoveryId.trim(),
        }),
        data = boundaryReceiptSchema.parse(
          await read(
            `/api/project/${projectId}/scheme/parcel-boundary?${query}`,
            new AbortController().signal,
          ),
        )
      if (
        data.projectId !== projectId ||
        data.parcelId !== parcelId ||
        data.requestId !== recoveryId.trim()
      )
        throw new Error(
          'The recovered receipt does not match this parcel and request.',
        )
      if (mounted.current) setRecovered(data)
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The retained receipt could not be read.',
        )
    } finally {
      if (mounted.current) setRecovering(false)
    }
  }
  return (
    <section
      className="mx-auto max-w-6xl min-w-0 space-y-5 px-4 py-6"
      aria-label="Boundary review"
    >
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          className="underline underline-offset-4"
          href={`/project/${projectId}/scheme/blocks`}
        >
          Blocks and parcels
        </Link>
        {source?.blockId && (
          <Link
            className="underline underline-offset-4"
            href={`/project/${projectId}/scheme/blocks/${source.blockId}`}
          >
            Selected parcel register
          </Link>
        )}
      </nav>
      <header>
        <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          Retained survey source
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
          <GeomaticsIcon symbol="parcel" className="h-6 w-6" />
          Boundary review{directory ? ` · ${directory.parcelNumber}` : ''}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Choose a retained parcel traverse, identify the boundary vertices and
          review their order. Saving retains a boundary draft and its source;
          parcel approval status stays unchanged.
        </p>
      </header>
      {!parcelId && (
        <p role="status">
          Open a parcel’s Boundary review action from its block register.
        </p>
      )}
      {loading && <p role="status">Reading retained survey records…</p>}
      {error && (
        <div
          role="alert"
          className="space-y-2 break-words rounded-lg border border-red-500/30 p-4 text-sm"
        >
          <p>{error}</p>
          {pending ? (
            <p>
              The result is unconfirmed. Exact request {pending.request_id}{' '}
              remains available for recovery; editing is locked until it is
              resolved.
            </p>
          ) : (
            <button
              type="button"
              className={action}
              disabled={loading || saving}
              onClick={() => setReadRetry((value) => value + 1)}
            >
              Retry retained source read
            </button>
          )}
        </div>
      )}
      {directory && (
        <div className="space-y-3 rounded-lg border border-[var(--border-color)] p-4">
          <label className="block space-y-1 text-sm">
            <span>Retained traverse for parcel {directory.parcelNumber}</span>
            <select
              value={traverse}
              disabled={locked || loading}
              onChange={(event) => {
                setPending(null)
                setTraverse(event.target.value)
              }}
              className="block w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2"
            >
              <option value="">Choose the source explicitly</option>
              {traverse &&
                !directory.traverses.some((row) => row.id === traverse) && (
                  <option value={traverse}>
                    Requested retained source · {traverse}
                  </option>
                )}
              {directory.traverses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name ?? 'Unnamed traverse'} · {row.id} · {row.pointCount}{' '}
                  coordinates · {row.status ?? 'unrecorded status'}
                </option>
              ))}
            </select>
          </label>
          {directory.total === 0 && (
            <p className="text-sm">
              No retained parcel traverse is available. Import or retain
              observations and compute this parcel’s source before boundary
              review.
            </p>
          )}
          <nav
            aria-label="Traverse source pages"
            className="flex flex-wrap items-center gap-3 text-xs"
          >
            <span>
              Page {directory.page} · {directory.total} parcel traverses
            </span>
            <button
              type="button"
              className={action}
              disabled={locked || loading || directory.page <= 1}
              onClick={() => {
                setTraverse('')
                setPage(directory.page - 1)
              }}
            >
              Previous sources
            </button>
            <button
              type="button"
              className={action}
              disabled={
                locked || loading || directory.page * 24 >= directory.total
              }
              onClick={() => {
                setTraverse('')
                setPage(directory.page + 1)
              }}
            >
              Next sources
            </button>
          </nav>
        </div>
      )}
      {parcelId && (
        <section className="space-y-3 rounded-lg border border-[var(--border-color)] p-4">
          <h2 className="font-medium">Recover a retained draft receipt</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Use the request ID from an interrupted save on this or another
            authorised device. A receipt proves that draft was saved; it may
            describe an earlier parcel revision.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 space-y-1 text-xs">
              <span>Saved boundary request ID</span>
              <input
                value={recoveryId}
                disabled={recovering}
                maxLength={36}
                onChange={(event) => setRecoveryId(event.target.value)}
                className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2"
              />
            </label>
            <button
              type="button"
              className={action}
              disabled={recovering}
              onClick={() => void recover()}
            >
              {recovering ? 'Reading receipt…' : 'Find retained receipt'}
            </button>
          </div>
          {recovered && (
            <p role="status" className="break-words text-sm">
              Retained draft receipt {recovered.receiptId}: parcel revision{' '}
              {recovered.parcelRevision}, {recovered.areaHa.toFixed(6)} ha,
              saved {recovered.parcelUpdatedAt}. Review the current source
              separately.
            </p>
          )}
        </section>
      )}
      {source && (
        <>
          {!source.storageReady && (
            <p
              role="status"
              className="rounded-lg border border-[var(--border-color)] p-4 text-sm"
            >
              Draft saving is temporarily unavailable. You can review the
              retained source and boundary order; reload the source after saving
              becomes available.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] p-4 text-sm">
            <div>
              <p>
                Saved project grid: <strong>{source.sourceCrs}</strong>
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {source.pointWindow?.total ?? source.points.length} retained
                coordinates · {source.observationCount} observation rows ·
                parcel revision {source.parcelRevision} · height may be unknown
              </p>
            </div>
            <button
              type="button"
              className={action}
              disabled={saving || pending !== null}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload source for a new review
            </button>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <section className="min-w-0 space-y-3 rounded-lg border border-[var(--border-color)] p-4">
              <h2 className="font-medium">Retained coordinates</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                List order does not define a boundary. Add the required
                vertices, then arrange their boundary order.
              </p>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  setReviewed(false)
                  setPointPage(1)
                  setFilter(filterDraft.trim())
                }}
              >
                <label className="min-w-0 flex-1 space-y-1 text-xs">
                  <span>Coordinate label or ID</span>
                  <input
                    value={filterDraft}
                    disabled={sourceLocked}
                    maxLength={80}
                    onChange={(event) => setFilterDraft(event.target.value)}
                    className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className={action}
                  disabled={sourceLocked}
                >
                  Find coordinates
                </button>
                {filter && (
                  <button
                    type="button"
                    className={action}
                    disabled={sourceLocked}
                    onClick={() => {
                      setFilter('')
                      setFilterDraft('')
                      setPointPage(1)
                      setReviewed(false)
                    }}
                  >
                    Show all coordinates
                  </button>
                )}
              </form>
              {source.pointWindow && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Page {source.pointWindow.page} of{' '}
                  {Math.max(
                    1,
                    Math.ceil(source.pointWindow.matchingCount / 50),
                  )}{' '}
                  · {source.pointWindow.matchingCount} matching of{' '}
                  {source.pointWindow.total} source coordinates · {order.length}{' '}
                  of {BOUNDARY_VERTEX_LIMIT} boundary vertices selected
                </p>
              )}
              {source.pointWindow?.matchingCount === 0 && (
                <p role="status" className="text-sm">
                  No coordinates match this filter. Chosen boundary vertices
                  remain available below.
                </p>
              )}
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {(source.pointWindow
                  ? source.points
                  : source.points.slice((pointPage - 1) * 50, pointPage * 50)
                ).map((point) => (
                  <div
                    key={point.id}
                    className="flex min-w-0 items-center justify-between gap-2 rounded border border-[var(--border-color)] p-2 text-xs"
                  >
                    <div className="min-w-0 break-words">
                      <p className="font-medium">
                        {point.station ?? 'Unlabelled coordinate'}
                      </p>
                      <p className="font-mono">
                        E {point.easting} · N {point.northing} · H{' '}
                        {point.elevation ?? 'unknown'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={action}
                      aria-label={`Add vertex ${point.station ?? point.id}`}
                      disabled={
                        sourceLocked ||
                        order.includes(point.id) ||
                        order.length >= BOUNDARY_VERTEX_LIMIT
                      }
                      onClick={() => {
                        if (
                          pickedRef.current[point.id] ||
                          Object.keys(pickedRef.current).length >=
                            BOUNDARY_VERTEX_LIMIT
                        )
                          return
                        setReviewed(false)
                        pickedRef.current = {
                          ...pickedRef.current,
                          [point.id]: point,
                        }
                        setPicked(pickedRef.current)
                        setOrder((values) => [...values, point.id])
                      }}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <nav
                aria-label="Coordinate review pages"
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  className={action}
                  disabled={sourceLocked || pointPage <= 1}
                  onClick={() => setPointPage((value) => value - 1)}
                >
                  Previous coordinates
                </button>
                <button
                  type="button"
                  className={action}
                  disabled={
                    sourceLocked ||
                    pointPage * 50 >=
                      (source.pointWindow?.matchingCount ??
                        source.points.length)
                  }
                  onClick={() => setPointPage((value) => value + 1)}
                >
                  Next coordinates
                </button>
              </nav>
            </section>
            <section className="min-w-0 space-y-3 rounded-lg border border-[var(--border-color)] p-4">
              <h2 className="font-medium">Chosen boundary order</h2>
              <ol className="max-h-96 space-y-2 overflow-y-auto">
                {selected.map((point, index) => (
                  <li
                    key={point.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-color)] p-2 text-xs"
                  >
                    <span className="break-words">
                      {index + 1}. {point.station ?? point.id}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move vertex ${index + 1} up`}
                        className={action}
                        disabled={sourceLocked || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move vertex ${index + 1} down`}
                        className={action}
                        disabled={sourceLocked || index === selected.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove vertex ${index + 1}`}
                        className={action}
                        disabled={sourceLocked}
                        onClick={() => {
                          setReviewed(false)
                          const next = { ...pickedRef.current }
                          delete next[point.id]
                          pickedRef.current = next
                          setPicked(next)
                          setOrder((values) =>
                            values.filter((id) => id !== point.id),
                          )
                        }}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-[var(--text-secondary)]">
                The final edge returns to vertex 1 automatically. Interior
                traverse stations need not become boundary corners.
              </p>
            </section>
          </div>
          {geometry ? (
            <div className="grid gap-4 rounded-lg border border-[var(--border-color)] p-4 sm:grid-cols-2">
              <BoundaryPreview ring={geometry.polygon.coordinates[0]} />
              <div className="space-y-2 text-sm">
                <h2 className="font-medium">Draft grid measurements</h2>
                <p>
                  {geometry.gridAreaSqM.toLocaleString()} m² ·{' '}
                  {geometry.areaHa.toFixed(6)} ha
                </p>
                <p>{geometry.gridPerimeterM.toLocaleString()} m perimeter</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Planar measurements in {source.sourceCrs}. This review does
                  not provide independent field checks, adopted accuracy
                  criteria or cadastral approval.
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Preview labels are spaced for legibility. The complete chosen
                  vertex order is shown above.
                </p>
              </div>
            </div>
          ) : (
            <p
              role="status"
              className="rounded-lg border border-[var(--border-color)] p-4 text-sm"
            >
              {geometryError}
            </p>
          )}
          <div className="space-y-3 rounded-lg border border-[var(--border-color)] p-4">
            <label className="block space-y-1 text-sm">
              <span>Boundary review note</span>
              <textarea
                maxLength={500}
                value={note}
                disabled={locked}
                onChange={(event) => {
                  setReviewed(false)
                  setNote(event.target.value)
                }}
                className="block min-h-20 w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2"
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={sourceLocked || !geometry}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>
                I checked that these source coordinates use {source.sourceCrs},
                and reviewed the chosen boundary vertices and order.
              </span>
            </label>
            <button
              type="button"
              className={action}
              disabled={
                !source.storageReady ||
                !sourceReady ||
                saving ||
                receipt !== null ||
                !geometry ||
                (!reviewed && !pending)
              }
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving
                ? 'Saving boundary draft…'
                : pending
                  ? 'Retry exact draft save'
                  : 'Save reviewed boundary draft'}
            </button>
          </div>
          {receipt && (
            <div
              role="status"
              className="space-y-2 break-words rounded-lg border border-[var(--border-color)] p-4 text-sm"
            >
              <p className="font-medium">
                Boundary draft saved and acknowledged.
              </p>
              <p>
                Receipt {receipt.receiptId} · request {receipt.requestId} ·
                parcel revision {receipt.parcelRevision} ·{' '}
                {receipt.areaHa.toFixed(6)} ha
              </p>
              <p>
                The source, chosen order, prior geometry and exact request
                receipt were retained. Reload the source before another
                revision.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
function BoundaryPreview({ ring }: { ring: Array<[number, number]> }) {
  const xs = ring.map((point) => point[0]),
    ys = ring.map((point) => point[1]),
    minX = Math.min(...xs),
    minY = Math.min(...ys),
    size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY)
  const points = ring
    .map(
      ([x, y]) =>
        `${20 + ((x - minX) / size) * 260},${280 - ((y - minY) / size) * 260}`,
    )
    .join(' ')
  // Keep annotations legible at the fixed preview scale; the complete order
  // remains in the register above and every vertex stays in the polygon.
  const labels: Array<{ index: number; x: number; y: number }> = []
  ring.slice(0, -1).forEach(([easting, northing], index) => {
    const x = 20 + ((easting - minX) / size) * 260,
      y = 274 - ((northing - minY) / size) * 260
    if (
      labels.length < 16 &&
      labels.every((label) => Math.hypot(label.x - x, label.y - y) >= 32)
    )
      labels.push({ index, x, y })
  })
  return (
    <svg
      viewBox="0 0 300 300"
      role="img"
      aria-label="Reviewed boundary shape in the project grid"
      className="w-full max-w-80 rounded border border-[var(--border-color)]"
    >
      <polygon
        points={points}
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {labels.map(({ x, y, index }) => (
        <text key={index} x={x} y={y} fontSize="10" fill="currentColor">
          {index + 1}
        </text>
      ))}
    </svg>
  )
}
