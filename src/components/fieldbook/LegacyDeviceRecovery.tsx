'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { LegacyQueueSummary } from '@/lib/mobile/offlineStorage'
import { canReviewLegacyItem } from '@/lib/mobile/legacyReview'
import { exportLegacySnapshot, listLegacyWork, selectLegacyWork, reviewLegacyWork, type LegacySelection } from '@/lib/mobile/recoveryService'

interface Props { actorId: string; projectId: string; onRefresh?: () => Promise<void> }
export function LegacyDeviceRecovery(props: Props) {
  return <RecoveryPanel key={`${props.actorId}:${props.projectId}`} {...props} />
}

function RecoveryPanel({ actorId, projectId, onRefresh }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<{ items: LegacyQueueSummary[]; next: string | null } | null>(null)
  const [selection, setSelection] = useState<LegacySelection | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const checkboxId = useId()
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const button = 'min-h-11 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-50'

  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(null); setMessage(null)
    try { await work() }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Recovery could not complete. Your device source was retained.') }
    finally { if (active.current) setBusy(false) }
  }
  async function load(after?: string) {
    const next = await listLegacyWork(actorId, projectId, after)
    if (!active.current) return
    setPage(next); setSelection(null); setAcknowledged(false)
  }
  async function inspect(id: string) {
    const result = await selectLegacyWork(actorId, projectId, id)
    if (!active.current) return
    setSelection(result); setAcknowledged(false)
  }
  async function download(photo = false) {
    if (!selection) return
    const output = await exportLegacySnapshot(actorId, projectId, selection, photo)
    if (!active.current) return
    const url = URL.createObjectURL(output.blob)
    const link = document.createElement('a')
    link.href = url; link.download = output.name
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setMessage('Download requested. Keep and inspect the saved source; its capture author remains unknown.')
  }
  async function review() {
    if (!selection || !acknowledged) return
    const result = await reviewLegacyWork(actorId, projectId, selection)
    if (!active.current) return
    setMessage(result.message); setAcknowledged(false)
    if (onRefresh) { try { await onRefresh() } catch { if (active.current) setError('The review finished, but the collector count could not refresh. Your retained source was not removed.') } }
  }
  const payload = selection?.item.data as Record<string, unknown> | undefined
  const canQueue = selection && canReviewLegacyItem(selection.item, projectId)
    && (!selection.item.recoveryReview || selection.item.recoveryReview.actorId === actorId)

  return <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)]">
    <button type="button" className={button} disabled={busy} aria-expanded={open} onClick={() => {
      if (open) { setOpen(false); setPage(null); setSelection(null); setMessage(null); setError(null); return }
      setOpen(true); void run(() => load())
    }}>{open ? 'Close recovery' : 'Recover older device work'}</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm">Review retained work for this project. Capture authorship is unknown. Recovery does not verify measurements or approve survey points.</p>
      {busy && <p role="status" className="text-sm">Checking recovery…</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {page && page.items.length === 0 && <p className="text-sm">No older unattributed queue entries were found for this project.</p>}
      {page && page.items.length > 0 && <ul className="space-y-2">{page.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
        <div><p className="text-sm font-medium">{item.name}</p><p className="text-xs">{item.type === 'photo' ? 'Original photo' : 'Device record'} · author unknown{!item.canQueue ? ' · export for manual review' : ''}</p>{item.error && <p className="text-xs text-red-500">{item.error}</p>}</div>
        <button type="button" className={button} disabled={busy} onClick={() => { void run(() => inspect(item.id)) }}>Inspect {item.name}</button>
      </li>)}</ul>}
      {page && <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => { void run(() => load()) }}>First page / refresh</button>
        {page.next && <button type="button" className={button} disabled={busy} onClick={() => { void run(() => load(page.next ?? undefined)) }}>More records</button>}
      </div>}
      {selection && <div className="space-y-3 border-t border-[var(--border-color)] pt-3">
        <p className="text-sm font-medium">Selected source: {selection.item.recordId} · author unknown</p>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg p-2 text-xs">{JSON.stringify(selection.item.type === 'photo' ? { ...payload, data: '[original image bytes retained; export below]' } : payload, null, 2).slice(0, 8000)}</pre>
        <p className="break-all font-mono text-xs">Source hash: {selection.sourceHash}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => { void run(() => download()) }}>Export source JSON</button>
          {selection.item.type === 'photo' && <button type="button" className={button} disabled={busy} onClick={() => { void run(() => download(true)) }}>Export original photo</button>}
        </div>
        {canQueue ? <>
          <label htmlFor={checkboxId} className="flex items-start gap-2 text-sm"><input id={checkboxId} type="checkbox" className="mt-1" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />The capture author is unknown. I have reviewed this original source for raw delivery to the selected project.</label>
          <button type="button" className={button} disabled={busy || !acknowledged} onClick={() => { void run(review) }}>Review and attempt raw delivery</button>
        </> : <p className="text-sm">This source remains held for manual reconciliation. Export the original; no point, photo ownership or measurement is automatically approved.</p>}
      </div>}
    </div>}
  </section>
}
