'use client'
import { useEffect, useState } from 'react'
import type { SavedFieldbook } from '@/app/fieldbook/types'
import type { FieldbookSnapshot } from '@/lib/fieldbook/delivery'
import { listBookEdits, sendBookEdit, exportBookEditRecords } from '@/lib/offline/bookEdits'
import { exportBookRequestRecords } from '@/lib/offline/bookDeliveryJournal'
import { getPendingOperations } from '@/lib/offline/syncQueue'
import { legacyBookContent, legacyBookSourceHash, confirmLegacyBookDelivery, verifiedLegacyBookDelivery } from '@/lib/offline/legacyBookRecovery'
import { canonicalDeliveryJson } from '@/lib/fieldbook/delivery'
import { readReviewedBook } from '@/lib/fieldbook/deliveryClient'
import { FieldbookArchiveRecovery } from './FieldbookArchiveRecovery'
export interface RecoveryBook extends SavedFieldbook { user_id: string; project_id: string; localEditId?: string }
interface Match { requestId: string; bookId: string; revision: string; name: string; data: Record<string, unknown> }
interface Item { key: string; book: RecoveryBook; delivered: string | null; legacy: boolean; legacyId?: number; sourceHash?: string; recoveredBookId?: string; matches?: Match[] }
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url)
}
export function FieldbookRecovery(props: { actorId: string; projectId: string; refreshKey: number; onOpen: (book: RecoveryBook) => Promise<void>; onReviewed: (book: RecoveryBook, revision: string) => Promise<void>; onCopy?: (book: RecoveryBook) => Promise<void>; onCount: (count: number) => void }) {
  const [items, setItems] = useState<Item[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0)
  const [comparison, setComparison] = useState<{ local: RecoveryBook; server: FieldbookSnapshot } | null>(null), [reviewed, setReviewed] = useState(false)
  const [unreadable, setUnreadable] = useState(0)
  const [linkReview, setLinkReview] = useState<{ item: Item; match: Match } | null>(null), [linkReviewed, setLinkReviewed] = useState(false)
  const { actorId, projectId } = props
  useEffect(() => {
    let active = true
    Promise.all([listBookEdits(actorId, projectId), getPendingOperations(projectId)]).then(async ([edits, old]) => {
      const next: Item[] = edits.map(({ edit, result }) => ({ key: edit.requestId, legacy: false, delivered: result?.receipt.savedRevision ?? null,
        book: { id: edit.bookId, user_id: actorId, project_id: projectId, localEditId: edit.requestId, type: edit.type, name: edit.name, data: edit.data } }))
      let unknown = 0
      for (const op of old) {
        if (op.table !== 'fieldbooks' || op.data.user_id !== actorId || op.data.project_id !== projectId) continue
        const data = op.data
        if (typeof data.id !== 'string' || !['leveling', 'traverse', 'control'].includes(String(data.type)) || !data.data || typeof data.data !== 'object') { unknown++; continue }
        const link = await verifiedLegacyBookDelivery(actorId, projectId, op)
        const sourceHash = await legacyBookSourceHash(op).catch(() => undefined)
        const matches: Match[] = []
        for (const { edit, result } of edits) {
          if (!result) continue
          try {
            if (legacyBookContent(op) === canonicalDeliveryJson({ type: edit.type, name: edit.name, data: edit.data })) matches.push({ requestId: edit.requestId,
              bookId: result.receipt.bookId, revision: result.receipt.savedRevision, name: edit.name, data: edit.data })
          } catch { /* Unreadable sources remain available through the raw archive. */ }
        }
        next.push({ key: `legacy-${op.id}`, legacy: true, legacyId: op.id, sourceHash, delivered: link?.savedRevision ?? null, recoveredBookId: link?.savedBookId, matches: sourceHash ? matches : [],
          book: { id: data.id, user_id: actorId, project_id: projectId, name: String(data.name ?? 'Retained older book'), type: data.type as RecoveryBook['type'], data: data.data as Record<string, unknown> } })
      }
      if (active) { setItems(next); setUnreadable(unknown); props.onCount(next.filter(item => !item.delivered).length + unknown) }
    }).catch(() => { if (active) setError('Recovery inventory could not be read. Retained records were kept. Export the device archive before changing storage.') })
    return () => { active = false }
    // onCount reports inventory; callback identity must not repeatedly reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, projectId, props.refreshKey, refresh])
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Recovery was not confirmed. Your retained work remains available.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Fieldbook recovery" className="my-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
    <h2 className="text-base font-semibold">Device recovery</h2>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">Retained snapshots are separate from server delivery and field verification. Older queued work requires review; it is never overwritten or deleted here.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn btn-secondary min-h-11" disabled={busy} onClick={() => { setError(null); setRefresh(value => value + 1) }}>Refresh recovery</button>
      <button className="btn btn-secondary min-h-11" disabled={busy} onClick={() => void run(async () => {
        const [edits, requests, legacy] = await Promise.all([exportBookEditRecords(actorId, projectId), exportBookRequestRecords(actorId, projectId), getPendingOperations(projectId)])
        download({ version: 1, projectId, actorId, edits, requests, legacy: legacy.filter(op => op.table === 'fieldbooks' && op.data.user_id === actorId && op.data.project_id === projectId) }, 'metardu-device-recovery.json')
      })}>Export device archive</button>
    </div>
    <FieldbookArchiveRecovery actorId={actorId} projectId={projectId} onRestored={() => setRefresh(value => value + 1)} />
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    {unreadable > 0 && <p className="mt-3 text-sm">{unreadable} older record could not be opened. It remains on this device and is included in Export device archive for inspection.</p>}
    {!items.length && !unreadable && !error && <p className="mt-3 text-sm">No retained book snapshots found for this account and project.</p>}
    <ul className="mt-3 space-y-3">{items.map(item => <li key={item.key} className="rounded-lg border border-[var(--border-color)] p-3">
      <h3 className="font-medium">{item.book.name}</h3>
      <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{item.legacy ? item.delivered ? `Legacy snapshot recovered · revision ${item.delivered} · book ${item.recoveredBookId}` : 'Legacy operation · needs review' : item.delivered ? `Delivered revision ${item.delivered}` : 'Delivery unconfirmed'} · snapshot {item.key.slice(0, 8)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void run(() => props.onOpen(item.book))}>Open retained copy</button>
        {props.onCopy && <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void run(async () => { await props.onCopy?.(item.book) })}>Continue as a separate draft</button>}
        <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => download({ version: 1, id: item.book.id, projectId, name: item.book.name, type: item.book.type, data: item.book.data }, 'metardu-retained-book.json')}>Export snapshot JSON</button>
        {!item.legacy && !item.delivered && <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void run(async () => { await sendBookEdit(actorId, projectId, item.key); setRefresh(value => value + 1) })}>Retry delivery</button>}
        {item.legacy && !item.delivered && item.matches?.map(match => <button key={match.requestId} className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => { setLinkReviewed(false); setLinkReview({ item, match }) }}>Review matching delivery</button>)}
        <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void run(async () => {
          setComparison(null); setReviewed(false)
          const server = await readReviewedBook(actorId, projectId, item.book.id)
          if (server.status !== 'active' || server.type !== item.book.type) throw new Error('This server book is archived or has a different type. Retain both copies for separate review.')
          setComparison({ local: item.book, server })
        })}>Compare with server</button>
      </div>
    </li>)}</ul>
    {linkReview && <div className="mt-4 border-t border-[var(--border-color)] pt-4">
      <h3 className="font-semibold">Confirm recovery of this legacy snapshot</h3>
      <p className="mt-1 break-all text-sm">The exact retained content matches delivered book {linkReview.match.bookId}, revision {linkReview.match.revision}. The original queued book {linkReview.item.book.id} remains on this device. This records delivery of a copy, not field verification or approval.</p>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ name: linkReview.item.book.name, data: linkReview.item.book.data }, null, 2)}</pre>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={linkReviewed} onChange={event => setLinkReviewed(event.target.checked)} />I reviewed this legacy snapshot and the matching delivered book and want to record their recovery link.</label>
      <button className="btn btn-primary mt-2 min-h-11" disabled={busy || !linkReviewed} onClick={() => void run(async () => {
        if (linkReview.item.legacyId === undefined || !linkReview.item.sourceHash) throw new Error('This source has no verified retained queue identity. Export its archive for inspection.')
        await confirmLegacyBookDelivery(actorId, projectId, linkReview.item.legacyId, linkReview.match.requestId, linkReview.item.sourceHash)
        setLinkReview(null); setLinkReviewed(false); setRefresh(value => value + 1)
      })}>Confirm delivered copy</button>
    </div>}
    {comparison && <div className="mt-4 border-t border-[var(--border-color)] pt-4">
      <h3 className="font-semibold">Review both copies</h3>
      <p className="mt-1 text-sm">This keeps the local observations and creates a new edit against the revision you review. The server may refuse it if that revision changes. Original snapshots stay retained.</p>
      <div className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
        <div><h4 className="text-sm font-medium">Local copy</h4><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ name: comparison.local.name, data: comparison.local.data }, null, 2)}</pre></div>
        <div><h4 className="text-sm font-medium">Server revision {comparison.server.revision}</h4><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ name: comparison.server.name, data: comparison.server.data }, null, 2)}</pre></div>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed both copies and want to continue editing the local copy against this server revision.</label>
      <button className="btn btn-primary mt-2 min-h-11" disabled={busy || !reviewed} onClick={() => void run(async () => { await props.onReviewed(comparison.local, comparison.server.revision); setComparison(null); setReviewed(false) })}>Open local copy with reviewed revision</button>
    </div>}
  </section>
}
