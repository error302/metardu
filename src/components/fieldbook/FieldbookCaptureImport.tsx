'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { createCaptureBook, inspectCaptureSource, listCaptureSources, type CapturedBook, type CaptureInventoryItem } from '@/lib/fieldbook/captureBookClient'
import type { BookCaptureSource, CaptureBearingEncoding, CaptureBookRequest, CaptureBookType } from '@/lib/fieldbook/captureDraft'
import { getPendingCaptureDraft, reserveCaptureDraft, completeCaptureDraft } from '@/lib/offline/captureDraftIntent'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
interface Props { actorId: string; projectId: string; onPrepare: () => Promise<boolean>; onCreated: (book: CapturedBook) => Promise<boolean> | boolean }
export function FieldbookCaptureImport(props: Props) {
  const session = useSession()
  if (session.status !== 'authenticated' || session.data.user.id !== props.actorId) return <p className="p-3 text-sm">Sign in as this book’s owner before reviewing captured sources.</p>
  return <CaptureReview key={`${props.actorId}:${props.projectId}`} {...props} />
}
function CaptureReview({ actorId, projectId, onPrepare, onCreated }: Props) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [page, setPage] = useState<{items: CaptureInventoryItem[]; next: string | null} | null>(null)
  const [inspected, setInspected] = useState<BookCaptureSource | null>(null)
  const [selected, setSelected] = useState<BookCaptureSource[]>([])
  const [type, setType] = useState<CaptureBookType>('leveling'), [name, setName] = useState('Captured field readings')
  const [encoding, setEncoding] = useState<CaptureBearingEncoding>('uninterpreted'), [acknowledged, setAcknowledged] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<CaptureBookRequest | null>(null)
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const frozen = busy || !!pendingRequest
  const button = 'min-h-11 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-50'
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(null); setMessage(null)
    try { await work() }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'The source request was not confirmed. Your current book and original sources were retained.') }
    finally { if (active.current) setBusy(false) }
  }
  async function load(cursor?: string) {
    const result = await listCaptureSources(actorId, projectId, cursor)
    if (active.current) { setPage(result); setInspected(null) }
  }
  async function inspect(batchId: string) {
    const result = await inspectCaptureSource(actorId, projectId, batchId)
    if (active.current) setInspected(result)
  }
  async function restoreOrLoad() {
    const retained = await getPendingCaptureDraft(actorId, projectId)
    if (!active.current) return
    if (retained) { setPendingRequest(retained); return }
    if (!pendingRequest) await load()
  }
  async function create() {
    if (!pendingRequest && (!acknowledged || !selected.length)) return
    if (!await onPrepare()) throw new Error('The current book could not be preserved. Save or export it before creating a source-linked draft.')
    if (!active.current) return
    const proposed = pendingRequest ?? { bookId: crypto.randomUUID(), projectId, name: name.trim(), type, bearingEncoding: encoding,
      acknowledgement: 'create-draft-from-raw-v1', sources: selected.map(source => ({ batchId: source.batchId, inputHash: source.inputHash })) } satisfies CaptureBookRequest
    const request = await reserveCaptureDraft(actorId, proposed)
    if (!active.current) return
    setPendingRequest(request)
    if (canonicalJson(request) !== canonicalJson(proposed)) {
      setMessage('Another tab already retained a draft request for this project. Review its details and retry that exact request before starting another draft.')
      return
    }
    let book: CapturedBook
    try { book = await createCaptureBook(actorId, request) }
    catch (cause) {
      // These codes occur only after the server checked this book ID was absent
      // and rolled the mapping transaction back. Access/schema/transport errors
      // cannot disprove an earlier commit whose acknowledgement was lost.
      if (cause instanceof Error && 'status' in cause && cause.status === 422 && 'code' in cause
        && ['FIELD_CAPTURE_MAPPING', 'FIELD_CAPTURE_SIZE'].includes(String(cause.code))) {
        await completeCaptureDraft(actorId, request)
        if (active.current) setPendingRequest(null)
      }
      throw cause
    }
    if (!active.current) return
    const opened = await onCreated(book)
    if (!active.current) return
    await completeCaptureDraft(actorId, request)
    if (!active.current) return
    setMessage(opened ? 'Source-linked draft created and opened. Original observations remain retained; complete and review the book setup before calculation.'
      : 'The source-linked draft was saved to the project. Your current edits were kept; open it from saved books when ready.')
    setPendingRequest(null); setSelected([]); setInspected(null); setAcknowledged(false)
  }
  function move(index: number, offset: number) {
    const next = [...selected], target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSelected(next); setAcknowledged(false)
  }
  return <section aria-label="Captured readings to Fieldbook" className="my-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)]">
    <button type="button" className={button} aria-expanded={open} disabled={busy} onClick={() => {
      if (open) { setOpen(false); return }
      setOpen(true); void run(restoreOrLoad)
    }}>{open ? 'Hide captured readings' : 'Review captured readings'}</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm">Delivered raw captures can form a new editable book. Inspect each source and confirm the reading order. Device-only captures appear after delivery; originals are never replaced or marked field verified.</p>
      {busy && <p role="status" className="text-sm">Checking captured sources…</p>}
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-red-500">{error}</p>{!pendingRequest && <button type="button" className={button} disabled={busy} onClick={() => { void run(restoreOrLoad) }}>Retry source list</button>}</div>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {pendingRequest && <div className="space-y-2 rounded-lg border border-[var(--border-color)] p-3">
        <p className="text-sm font-medium">Retained draft request: {pendingRequest.name}</p>
        <p className="break-all text-xs">Book ID: {pendingRequest.bookId}</p>
        <p className="text-xs">{pendingRequest.type} · bearing format: {pendingRequest.bearingEncoding}</p>
        <ol className="space-y-1 break-all font-mono text-xs">{pendingRequest.sources.map(source => <li key={source.batchId}>{source.batchId} · {source.inputHash}</li>)}</ol>
        <p className="text-sm">Creation is unconfirmed. This reviewed request is retained on this device for this account and project. Retry it to recover the same draft; do not start another copy.</p>
        <button type="button" className={button} disabled={busy} onClick={() => { void run(create) }}>Retry draft creation</button>
      </div>}
      {!pendingRequest && <>
        {page?.items.length === 0 && <p className="text-sm">No delivered raw captures are available for this project. Sync your collector readings first.</p>}
        {page && <ul className="space-y-2">{page.items.map(source => <li key={source.batchId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
          <div><p className="text-sm font-medium">{source.station || source.clientId}</p><p className="text-xs">{source.mode || 'Capture mode unknown'} · {source.capturedBy ? 'Capture author recorded' : 'Capture author unknown'}</p></div>
          <button type="button" className={button} disabled={frozen} onClick={() => { void run(() => inspect(source.batchId)) }}>Inspect {source.station || source.clientId}</button>
        </li>)}</ul>}
        {page && <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={frozen} onClick={() => { void run(() => load()) }}>First source page</button>
          {page.next && <button type="button" className={button} disabled={frozen} onClick={() => { void run(() => load(page.next ?? undefined)) }}>More captured sources</button>}</div>}
        {inspected && <div className="space-y-2 rounded-lg border border-[var(--border-color)] p-3">
          <p className="text-sm font-medium">Original source: {inspected.clientId} · {inspected.capturedBy ? 'author recorded' : 'author unknown'}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(inspected.raw, null, 2)}</pre>
          <p className="break-all font-mono text-xs">Source hash: {inspected.inputHash}</p>
          <button type="button" className={button} disabled={frozen || selected.some(source => source.batchId === inspected.batchId) || selected.length >= 500} onClick={() => {
            setSelected(items => [...items, inspected]); setAcknowledged(false)
          }}>Use this source</button>
        </div>}
      </>}
      {selected.length > 0 && !pendingRequest && <div className="space-y-3 border-t border-[var(--border-color)] pt-3">
        <p className="text-sm font-medium">Selected order ({selected.length})</p>
        <ol className="space-y-1">{selected.map((source, index) => <li key={source.batchId} className="flex flex-wrap items-center gap-2 text-sm"><span>{index + 1}. {String(source.raw.pointName ?? source.raw.station ?? source.clientId)}</span>
          <button type="button" className={button} disabled={frozen || index === 0} aria-label={`Move source ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className={button} disabled={frozen || index === selected.length - 1} aria-label={`Move source ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className={button} disabled={frozen} onClick={() => { setSelected(items => items.filter(item => item.batchId !== source.batchId)); setAcknowledged(false) }}>Remove from selection</button>
        </li>)}</ol>
        <label className="block text-sm">New book name<input className="input mt-1 w-full" value={name} disabled={frozen} onChange={event => { setName(event.target.value); setAcknowledged(false) }} /></label>
        <label className="block text-sm">Book type<select className="input mt-1 w-full" value={type} disabled={frozen} onChange={event => { setType(event.target.value as CaptureBookType); setAcknowledged(false) }}>
          <option value="leveling">Leveling</option><option value="traverse">Traverse</option><option value="control">Polar control</option>
        </select></label>
        <label className="block text-sm">Adopted bearing format<select className="input mt-1 w-full" value={encoding} disabled={frozen} onChange={event => { setEncoding(event.target.value as CaptureBearingEncoding); setAcknowledged(false) }}>
          <option value="uninterpreted">Not adopted — leave book bearings blank</option><option value="decimal_degrees">Decimal degrees</option><option value="packed_dms">Packed DMS (DDD.MMSS)</option><option value="separated_dms">Separated degrees, minutes and seconds</option>
        </select></label>
        <p className="text-xs">Setup coordinates, opening levels and missing heights remain blank. GNSS coordinate-only sources are not polar shots. Original text remains attached even when an adopted bearing is converted for the book.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={frozen} onChange={event => setAcknowledged(event.target.checked)} />I reviewed the selected source order and adopted bearing format. Create a draft; this does not verify measurements or approve survey points.</label>
        <button type="button" className={button} disabled={busy || !acknowledged || !name.trim()} onClick={() => { void run(create) }}>Create source-linked draft</button>
      </div>}
    </div>}
  </section>
}
