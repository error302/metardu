'use client'
import { useEffect, useRef, useState } from 'react'
import { BOOK_ARCHIVE_MAX_BYTES, previewBookArchive, restoreBookArchive, listBookArchives, readBookArchive, type ArchivePreview, type ArchiveSummary } from '@/lib/offline/bookArchiveRecovery'

interface Props { actorId: string; projectId: string; onRestored: () => void }
// Remount the entire scope, including pending file reads and user review state.
export function FieldbookArchiveRecovery(props: Props) {
  return <ScopedArchiveRecovery key={`${props.actorId}:${props.projectId}`} {...props} />
}
function ScopedArchiveRecovery({ actorId, projectId, onRestored }: Props) {
  const [archives, setArchives] = useState<ArchiveSummary[]>([]), [selection, setSelection] = useState<{ bytes: Uint8Array; preview: ArchivePreview } | null>(null)
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [status, setStatus] = useState<string | null>(null)
  const active = useRef(false), sequence = useRef(0)
  async function refresh() {
    const values = await listBookArchives(actorId, projectId)
    if (active.current) setArchives(values)
  }
  useEffect(() => {
    active.current = true
    void refresh().catch(() => { if (active.current) setError('Retained archives could not be read. Keep device storage intact for inspection.') })
    return () => { active.current = false }
    // This component is keyed by the account and project scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function choose(load: () => Promise<Uint8Array>, expectedHash?: string) {
    const token = ++sequence.current
    setSelection(null); setReviewed(false); setError(null); setStatus(null); setBusy(true)
    try {
      const bytes = await load()
      if (!active.current || token !== sequence.current) return
      const preview = await previewBookArchive(actorId, projectId, bytes)
      if (!active.current || token !== sequence.current) return
      if (expectedHash && preview.hash !== expectedHash) throw new Error('The retained source changed. Keep device storage intact for inspection.')
      setSelection({ bytes, preview })
    } catch (cause) { if (active.current && token === sequence.current) setError(cause instanceof Error ? cause.message : 'This archive could not be reviewed. Keep the original file.') }
    finally { if (active.current && token === sequence.current) setBusy(false) }
  }
  async function restore() {
    if (!selection || !reviewed || busy) return
    const selected = selection
    setBusy(true); setError(null); setStatus(null); setReviewed(false)
    try {
      await restoreBookArchive(actorId, projectId, selected.bytes, selected.preview.hash)
      if (!active.current) return
      setStatus('Eligible records restored. Imported delivery claims require server confirmation; pending work is available in recovery below. Unreadable material remains in the original archive.')
      onRestored()
    } catch (cause) { if (active.current) setError(`${cause instanceof Error ? cause.message : 'Restoration was interrupted.'} Keep the original file. If it was retained, review and resume it below; completed records are preserved.`) }
    finally {
      if (active.current) {
        await refresh().catch(() => { if (active.current) setError('Archive inventory could not be refreshed. Keep the original file and device storage intact.') })
        if (active.current) setBusy(false)
      }
    }
  }
  async function download(hash: string) {
    setBusy(true); setError(null)
    try {
      const bytes = await readBookArchive(actorId, projectId, hash)
      if (!active.current) return
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `metardu-device-${hash.slice(0, 12)}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'The original archive could not be downloaded. Keep device storage intact.') }
    finally { if (active.current) setBusy(false) }
  }
  return <section aria-label="Restore device archive" className="mt-4 border-t border-[var(--border-color)] pt-4">
    <h3 className="font-semibold">Restore a device archive</h3>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose an archive exported for this account and project. Its original bytes are retained before restoration. Existing records are preserved; conflicts require inspection. Restoring does not send work to the server.</p>
    <label className="mt-3 block text-sm">Choose device archive
      <input className="mt-2 block min-h-11 w-full" type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        void choose(async () => { if (file.size > BOOK_ARCHIVE_MAX_BYTES) throw new Error('Device archives must be at most 50 MiB.'); return new Uint8Array(await file.arrayBuffer()) })
      }} />
    </label>
    {busy && <p className="mt-2 text-sm" aria-live="polite">Reading or retaining archive…</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    {selection && <div className="mt-3 rounded-lg border border-[var(--border-color)] p-3">
      <p className="text-sm">{selection.preview.edits} edits · {selection.preview.requests} requests · {selection.preview.legacy} older snapshots · {selection.preview.unreadable} unreadable records</p>
      <p className="mt-1 break-all text-xs text-[var(--text-muted)]">SHA-256: {selection.preview.hash}</p>
      <p className="mt-2 text-sm">Imported receipts remain inspection material. Older snapshots need a reviewed server revision before delivery. Unreadable records stay downloadable in the original file.</p>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />I reviewed this archive and want to restore its eligible records into this account and project.</label>
      <button className="btn btn-primary min-h-11" disabled={busy || !reviewed} onClick={() => void restore()}>Restore reviewed archive</button>
    </div>}
    {archives.length > 0 && <div className="mt-4">
      <h4 className="text-sm font-medium">Retained source archives</h4>
      <ul className="mt-2 space-y-2">{archives.map(archive => <li key={archive.hash} className="rounded-lg border border-[var(--border-color)] p-3">
        <p className="text-sm">{archive.complete ? 'Eligible records restored' : 'Restoration incomplete'} · {archive.unreadable} unreadable records kept for inspection</p>
        <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{archive.hash}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void choose(() => readBookArchive(actorId, projectId, archive.hash), archive.hash)}>{archive.complete ? 'Review and recheck' : 'Review and resume'}</button>
          <button className="btn btn-secondary min-h-11 text-sm" disabled={busy} onClick={() => void download(archive.hash)}>Download original archive</button>
        </div>
      </li>)}</ul>
    </div>}
  </section>
}
