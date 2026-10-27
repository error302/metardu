'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { MAX_SCHEME_IMPORT_BYTES, MAX_SCHEME_IMPORT_ROWS, prepareSchemeMetadataCsv, schemeImportReceiptSchema, type SchemeImportReceipt, type SchemeMetadataRow } from '@/lib/parcel/schemeMetadataImport'

interface Props { projectId: number | string; blockId: number | string; blockName: string; onImportComplete?: () => void }
interface Preview { scope: string; file: File; rows: SchemeMetadataRow[]; sourceHash: string }

export default function ParcelMetadataImport({ projectId, blockId, blockName, onImportComplete }: Props) {
  const inputId = useId(), scope = `${projectId}:${blockId}`
  const scopeRef = useRef(scope), operation = useRef(0), mounted = useRef(true), busy = useRef(false)
  scopeRef.current = scope
  const [preview, setPreview] = useState<Preview | null>(null)
  const [requestId, setRequestId] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [result, setResult] = useState<{ scope: string; receipt: SchemeImportReceipt } | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    operation.current++; busy.current = false
    setPreview(null); setRequestId(''); setReviewed(false); setLoading(false); setError(''); setAttempted(false); setResult(null)
  }, [scope])

  async function chooseFile(file: File) {
    if (busy.current) return
    const token = ++operation.current, selectedScope = scope
    const current = () => mounted.current && operation.current === token && scopeRef.current === selectedScope
    setPreview(null); setResult(null); setError(''); setReviewed(false); setAttempted(false); setRequestId('')
    try {
      if (!file.size || file.size > MAX_SCHEME_IMPORT_BYTES) throw new Error('Choose a nonempty CSV of at most 4 MiB.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength !== file.size) throw new Error('The complete file could not be read. Choose it again.')
      const rows = prepareSchemeMetadataCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))).map(value => value.toString(16).padStart(2, '0')).join('')
      if (!current()) return
      // Upload the reviewed byte snapshot even if the disk file later changes.
      const snapshot = new File([Uint8Array.from(bytes)], file.name, { type: 'text/csv', lastModified: file.lastModified })
      setPreview({ scope: selectedScope, file: snapshot, rows, sourceHash }); setRequestId(crypto.randomUUID())
    } catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : 'The CSV could not be read.') }
  }

  async function confirmImport() {
    if (!preview || preview.scope !== scope || !reviewed || busy.current || !z.string().guid().safeParse(requestId).success) return
    busy.current = true; setLoading(true); setError(''); setAttempted(true)
    const selected = preview, selectedRequest = requestId, token = ++operation.current
    const current = () => mounted.current && operation.current === token && scopeRef.current === selected.scope
    try {
      const form = new FormData()
      form.set('project_id', String(projectId)); form.set('block_id', String(blockId)); form.set('request_id', selectedRequest); form.set('file', selected.file)
      const response = await fetch('/api/scheme/import', { method: 'POST', body: form })
      const body: unknown = await response.json()
      if (!response.ok) { const message = z.object({ error: z.string() }).safeParse(body); throw new Error(message.success ? message.data.error : 'The import could not be confirmed.') }
      const parsed = z.object({ data: schemeImportReceiptSchema }).safeParse(body)
      if (!parsed.success) throw new Error('The import acknowledgement is incomplete. Keep this request reference and retry.')
      const receipt = parsed.data.data
      if (receipt.requestId !== selectedRequest || receipt.projectId !== String(projectId) || receipt.blockId !== String(blockId) || receipt.sourceFileHash !== selected.sourceHash || receipt.sourceFileName !== selected.file.name || receipt.total_rows !== selected.rows.length) throw new Error('The import acknowledgement does not match the reviewed file. Keep this request reference and retry.')
      if (!current()) return
      setResult({ scope: selected.scope, receipt })
      if (receipt.created > 0) onImportComplete?.()
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : 'The import result could not be confirmed. Retry with the same request reference.')
    } finally { if (current()) { busy.current = false; setLoading(false) } }
  }

  function downloadTemplate() {
    const csv = 'parcel_number,lr_number_proposed,area_ha,notes\r\nSYNTHETIC-001,,0.125000,Fictional demonstration metadata only\r\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'METARDU-synthetic-parcel-template.csv'; link.click(); URL.revokeObjectURL(url)
  }

  const selected = preview?.scope === scope ? preview : null
  const receipt = result?.scope === scope ? result.receipt : null
  return <section className="border border-[var(--border-color)] rounded-xl bg-[var(--bg-card)] overflow-hidden" aria-label="Parcel metadata import">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />Import parcel metadata</h3>
      <button type="button" onClick={downloadTemplate} className="text-xs underline underline-offset-4">Download synthetic template</button>
    </div>
    <div className="p-4 space-y-4 text-sm">
      <p className="text-[var(--text-secondary)]">Block {blockName}. This creates parcel register metadata. Areas are supplied hectares; this does not import boundaries, observations or approval evidence.</p>
      <p className="text-xs text-[var(--text-muted)]">UTF-8 CSV, up to {MAX_SCHEME_IMPORT_ROWS.toLocaleString()} parcels and 4 MiB per import. Required: parcel_number. Optional: lr_number_proposed, area_ha, notes. Identical existing records stay unchanged; any conflict refuses the whole file.</p>
      <label htmlFor={inputId} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-[var(--border-color)] p-4 focus-within:ring-2 focus-within:ring-[var(--accent)]">
        <Upload className="h-5 w-5 shrink-0" aria-hidden="true" /><span>Choose parcel metadata CSV</span>
        <input id={inputId} type="file" accept=".csv,text/csv" disabled={loading} className="min-w-0 max-w-full text-xs" onChange={event => { const file = event.target.files?.[0]; if (file) void chooseFile(file); event.target.value = '' }} />
      </label>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 p-3 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" /><span>{error}</span></div>}
      {selected && !receipt && <div className="space-y-3">
        <p className="font-medium">{selected.rows.length.toLocaleString()} {selected.rows.length === 1 ? 'parcel' : 'parcels'} ready for review</p>
        <p className="break-all text-xs text-[var(--text-secondary)]">{selected.file.name} · SHA-256 {selected.sourceHash}</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Parcel</th><th className="p-2">Proposed LR</th><th className="p-2">Area (ha)</th><th className="p-2">Notes</th></tr></thead><tbody>{selected.rows.slice(0,10).map(row => <tr key={row.parcel_number} className="border-t border-[var(--border-color)]"><td className="p-2">{row.parcel_number}</td><td className="p-2">{row.lr_number_proposed ?? 'Not supplied'}</td><td className="p-2">{row.area_ha ?? 'Not supplied'}</td><td className="p-2 max-w-64 break-words">{row.notes ?? 'Not supplied'}</td></tr>)}</tbody></table></div>
        {selected.rows.length > 10 && <p className="text-xs text-[var(--text-muted)]">First 10 rows shown; every record was checked for CSV validity. Review the complete source file before confirming.</p>}
        <label className="block space-y-1 text-xs"><span>Request reference</span><input value={requestId} disabled={loading || attempted} onChange={event => { setRequestId(event.target.value.trim()); setReviewed(false) }} className="w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 font-mono" /></label>
        <p className="text-xs text-[var(--text-muted)]">Keep this reference and original file. A retry recovers the historical receipt. After reopening this page, select the same file and enter the saved reference before confirmation.</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} disabled={loading || attempted} onChange={event => setReviewed(event.target.checked)} className="mt-1" /><span>I reviewed this metadata, hectare units and destination block against the complete source file.</span></label>
        <button type="button" disabled={loading || !reviewed || !z.string().guid().safeParse(requestId).success} onClick={() => void confirmImport()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-black font-medium disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{loading ? 'Confirming import…' : attempted ? 'Retry same import' : 'Confirm parcel import'}</button>
      </div>}
      {receipt && <div className="rounded-lg border border-emerald-500/30 p-3 space-y-2" role="status">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{receipt.replayed ? 'Import receipt recovered' : 'Import receipt confirmed'}</p>
        <p>{receipt.created.toLocaleString()} created; {receipt.unchanged.toLocaleString()} identical records retained; {receipt.total_rows.toLocaleString()} records accounted for.</p>
        <p className="break-all text-xs font-mono">Request {receipt.requestId}</p><p className="text-xs text-[var(--text-secondary)]">This receipt records the completed intake. Later edits remain separate. Metadata import does not certify field observations or boundaries.</p>
      </div>}
    </div>
  </section>
}
