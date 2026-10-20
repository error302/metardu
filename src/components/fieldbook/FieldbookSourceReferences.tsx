'use client'

import { useState } from 'react'
import type { SourceImport } from '@/lib/fieldbook/captureDraft'
import { captureReferenceColumns } from '@/lib/fieldbook/captureReferences'

export function FieldbookSourceReferences({ imported, rows }: { imported: SourceImport; rows: Record<string, string>[] }) {
  const [selected, setSelected] = useState(imported.sources[0].batchId)
  const source = imported.sources.find(item => item.batchId === selected) ?? imported.sources[0]
  const row = rows.find(item => item.id === source.rowId)
  const changed = row ? captureReferenceColumns(imported, row).SourceBookRowChanged === 'yes' : null
  return <details className="my-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)]">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">Original capture references ({imported.sources.length}) · draft</summary>
    <p className="my-2 text-sm">These are retained source snapshots, not a fresh archive check or field verification. Editing or removing book rows does not change the original captures. JSON includes the full snapshots; CSV and PDF include source references.</p>
    <label className="block text-sm">Original capture<select className="input my-2 w-full" value={source.batchId} onChange={event => setSelected(event.target.value)}>
      {imported.sources.map((item, index) => <option key={item.batchId} value={item.batchId}>{index + 1}. {item.clientId}</option>)}
    </select></label>
    <p className="text-xs">Capture author: {source.capturedBy ?? 'unknown'}. Draft reviewer: {imported.reviewedBy}.</p>
    <p className="my-2 text-xs">{changed === null ? 'The source row is no longer in this book.' : changed ? 'The book row has changed since draft creation.' : 'The book row matches its initial draft values.'} Setup changes require separate review.</p>
    <dl className="space-y-1 break-all text-xs"><dt>Batch</dt><dd>{source.batchId}</dd><dt>Observation</dt><dd>{source.observationId}</dd><dt>Input hash</dt><dd className="font-mono">{source.inputHash}</dd><dt>Adopted bearing format</dt><dd>{imported.bearingEncoding}</dd></dl>
    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(source.raw, null, 2)}</pre>
  </details>
}
