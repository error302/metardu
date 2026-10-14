'use client'
import { useEffect, useRef, useState } from 'react'
import type { SavedPipelineBatch, PipelineHistorySummary } from '@/lib/engineering/pipelineCapture'
import { PageHeader } from '@/components/shared/PageHeader'
import { analyzePipelineAsBuilt, type PipelineAnalysisResult, type PipelineCoverCriterion } from '@/lib/engineering/pipelineAsBuilt'
import { fieldPointNumber } from '@/lib/field/pointEntry'
import { parsePipelineAsBuiltCsv, pipelineAsBuiltTemplate, pipelineAsBuiltReportCsv, pipelineAsBuiltReportHtml, pipelineCoverLabel, type PipelineReportMetadata } from '@/lib/engineering/pipelineAsBuiltCsv'

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function canonicalLogo(): Promise<string> {
  const response = await fetch('/metardu-icon.png')
  if (!response.ok) throw new Error('Unable to load the company mark for the printable report.')
  const blob = await response.blob()
  if (blob.type !== 'image/png' || blob.size > 1_000_000) throw new Error('The company mark response is invalid.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the company mark.'))
    reader.onerror = () => reject(new Error('Unable to read the company mark.'))
    reader.readAsDataURL(blob)
  })
}
const labels: Record<keyof PipelineReportMetadata, string> = { route: 'Project / route', designReference: 'Design drawing / revision', verticalReference: 'Height reference / benchmark', observer: 'Observer', instrument: 'Instrument / serial' }
const value = (number: number | null) => number === null ? 'Not recorded' : number.toFixed(3)
interface PipelineResponse { data?: SavedPipelineBatch | PipelineHistorySummary[]; error?: string; nextCursor?: string | null; replayed?: boolean }
export default function PipelineWorkspace({ projectId, onDirty, onBusy }: { projectId: string | null; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const [csv, setCsv] = useState('')
  const [minimum, setMinimum] = useState('')
  const [source, setSource] = useState('')
  const [revision, setRevision] = useState('')
  const [metadata, setMetadata] = useState<PipelineReportMetadata>({ route: '', designReference: '', verticalReference: '', observer: '', instrument: '' })
  const [result, setResult] = useState<PipelineAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [history, setHistory] = useState<PipelineHistorySummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedPipelineBatch | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const batchId = useRef<string | null>(null)
  const saveLock = useRef(false)
  const alive = useRef(true)
  const inputRevision = useRef(0)
  useEffect(() => { const revisions = inputRevision; alive.current = true; return () => { alive.current = false; revisions.current++ } }, [])
  useEffect(() => { onBusy(saving || historyBusy) }, [saving, historyBusy, onBusy])
  useEffect(() => {
    if (!projectId) return
    let active = true
    setHistoryBusy(true)
    fetch(`/api/project/${encodeURIComponent(projectId)}/pipeline-asbuilt`, { cache: 'no-store' }).then(async response => {
      const payload = await response.json() as PipelineResponse
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error || 'Could not load project pipeline history.')
      if (active) { setHistory(payload.data); setCursor(payload.nextCursor ?? null) }
    }).catch(cause => { if (active) setHistoryError(cause instanceof Error ? cause.message : 'Could not load history.') })
      .finally(() => { if (active) setHistoryBusy(false) })
    return () => { active = false }
  }, [projectId])
  const invalidate = () => { inputRevision.current++; batchId.current = null; setSaved(null); setNotice(null); setResult(null); setError(null); onDirty(true) }
  const historyAction = async (id: string | null, older = false) => {
    if (!projectId || saveLock.current || historyBusy) return
    if (id && csv && !saved && !window.confirm('Opening a saved batch replaces this form. Download or save your current draft first if needed. Continue?')) return
    const request = inputRevision.current
    setHistoryBusy(true); setHistoryError(null)
    try {
      const query = id ? `batchId=${encodeURIComponent(id)}` : older && cursor ? `beforeId=${encodeURIComponent(cursor)}` : ''
      const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/pipeline-asbuilt${query ? `?${query}` : ''}`, { cache: 'no-store' })
      const payload = await response.json() as PipelineResponse
      if (!response.ok) throw new Error(payload.error || 'Could not load project pipeline history.')
      if (!alive.current || request !== inputRevision.current) return
      if (id) {
        const record = payload.data as SavedPipelineBatch
        if (!record?.capture?.rawCsv || record.project_id !== projectId || record.id !== id || record.capture.schemaVersion !== 1) throw new Error('Saved batch response does not match this project. The current draft was retained.')
        inputRevision.current++; batchId.current = record.client_batch_id
        setCsv(record.capture.rawCsv); setMetadata(record.capture.metadata); setResult(record.capture.result)
        setMinimum(record.capture.criterion ? String(record.capture.criterion.minimumCoverM) : '')
        setSource(record.capture.criterion?.source ?? ''); setRevision(record.capture.criterion?.revision ?? '')
        setSaved(record); setError(null); setNotice('Opened the retained batch. Editing creates a new revision.'); onDirty(false)
      } else {
        if (!Array.isArray(payload.data)) throw new Error('Invalid history response.')
        const rows = payload.data
        setHistory(previous => query ? [...previous, ...rows.filter(row => !previous.some(old => old.id === row.id))] : rows)
        setCursor(payload.nextCursor ?? null)
      }
    } catch (cause) { if (alive.current && request === inputRevision.current) setHistoryError(cause instanceof Error ? cause.message : 'Could not load history.') }
    finally { if (alive.current) setHistoryBusy(false) }
  }
  const save = async () => {
    if (!projectId || !result || saved || saveLock.current) return
    saveLock.current = true; setSaving(true); setError(null); setNotice(null)
    const request = inputRevision.current
    try {
      batchId.current ??= crypto.randomUUID()
      const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/pipeline-asbuilt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientBatchId: batchId.current, rawCsv: csv, metadata, criterion: result.criterion }),
      })
      const payload = await response.json() as PipelineResponse
      if (!response.ok) throw new Error(payload.error || 'The project batch was not saved. Retain or export this draft.')
      const record = payload.data as SavedPipelineBatch
      if (!record?.id || record.project_id !== projectId || record.client_batch_id !== batchId.current || !record.capture?.result) throw new Error('The save response did not identify this project batch. Keep this draft and retry.')
      if (!alive.current || request !== inputRevision.current) return
      setSaved(record); setResult(record.capture.result); onDirty(false)
      setNotice(payload.replayed ? 'This batch was already recorded. The original was reopened.' : 'Measured profile recorded privately in this project.')
      setHistory(previous => [{ id: record.id, recorded_at: record.recorded_at, route: record.capture.metadata.route, point_count: record.capture.result.points.length, algorithm_version: record.capture.result.algorithmVersion }, ...previous.filter(row => row.id !== record.id)])
    } catch (cause) { if (alive.current && request === inputRevision.current) setError(cause instanceof Error ? cause.message : 'Save failed. Retain or export this draft.') }
    finally { saveLock.current = false; if (alive.current) setSaving(false) }
  }
  const compute = () => {
    setResult(null); setError(null)
    try {
      const criterion: PipelineCoverCriterion | null = minimum.trim() || source.trim() || revision.trim()
        ? { minimumCoverM: fieldPointNumber(minimum, 'Minimum cover'), source, revision } : null
      setResult(analyzePipelineAsBuilt(parsePipelineAsBuiltCsv(csv), criterion))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const upload = async (file: File) => {
    invalidate()
    setCsv('')
    const request = inputRevision.current
    try {
      if (file.size > 1_000_000) throw new Error('CSV exceeds the 1 MB import limit.')
      const text = await file.text()
      if (request !== inputRevision.current) return
      invalidate()
      setCsv(text)
    } catch (cause) { if (request === inputRevision.current) setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const exportHtml = async () => {
    if (!result || exporting) return
    const request = inputRevision.current
    setExporting(true); setError(null)
    try {
      const logo = await canonicalLogo()
      if (request === inputRevision.current) download(pipelineAsBuiltReportHtml(result, metadata, logo), 'metardu-pipeline-asbuilt.html', 'text/html;charset=utf-8')
    } catch (cause) { if (request === inputRevision.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setExporting(false) }
  }
  const inputClass = 'w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]'
  const buttonClass = 'min-h-11 rounded border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50'
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Pipeline As-Built" subtitle="Measured internal invert, outside crown, signed cover and downstream fall" />
      <p className="mb-6 text-sm text-[var(--text-secondary)]">{projectId ? 'Project profile: analyze and explicitly save each measured batch. Editing a saved batch creates a new record.' : 'Local draft: observations are not saved to a project.'} Use a common route chainage and height reference. Ground between observations, utilities, observation uncertainty and approved design compliance remain unassessed.</p>
      {projectId && <section aria-label="Saved pipeline history" className="mb-6 space-y-2 rounded border border-[var(--border-color)] p-4">
        <h2 className="font-semibold">Saved project profiles</h2>
        {historyBusy && <p role="status">Loading project history…</p>}
        {historyError && <p role="alert">{historyError}</p>}
        {!historyBusy && !historyError && !history.length && <p>No measured profiles have been saved to this project.</p>}
        <button className={buttonClass} disabled={historyBusy || saving} onClick={() => void historyAction(null)}>Refresh history</button>
        {history.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] py-2">
          <span>{row.route || 'Unnamed measured route'} · {row.point_count} observations · Recorded {row.recorded_at} · Algorithm {row.algorithm_version}</span>
          <button className={buttonClass} aria-label={`Open profile: ${row.route || 'Unnamed measured route'}, recorded ${row.recorded_at}`} disabled={historyBusy || saving} onClick={() => void historyAction(row.id)}>Open profile</button>
        </div>)}
        {cursor && <button disabled={historyBusy || saving} className={buttonClass} onClick={() => void historyAction(null, true)}>Load older batches</button>}
        <p className="text-xs text-[var(--text-secondary)]">Recorded time is server receipt time, not the field observation time. History is append-only. The saved project reference is a declaration; measured levels are not automatically transformed or matched to it.</p>
      </section>}
      <fieldset disabled={saving || historyBusy}>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4" aria-label="Measured pipeline observations">
          <div className="flex flex-wrap items-center gap-3">
            <button className={buttonClass} onClick={() => download(pipelineAsBuiltTemplate(), 'metardu-pipeline-observations-template.csv', 'text/csv;charset=utf-8')}>Download CSV template</button>
            <label className={buttonClass}>Import CSV<input aria-label="Import pipeline CSV" type="file" accept=".csv,text/csv" className="block max-w-full text-xs" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file) }} /></label>
          </div>
          <div><label className="mb-2 block text-sm text-[var(--text-secondary)]" htmlFor="pipeline-points">Measured pipe observations CSV</label>
            <textarea id="pipeline-points" value={csv} onChange={event => { invalidate(); setCsv(event.target.value) }} rows={8} spellCheck={false} placeholder={pipelineAsBuiltTemplate().trim()} className={`${inputClass} font-mono text-xs`} />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Header required; at most 1000 observations / 1 MB. point_id, chainage_m and invert_rl_m are required. Blank ground or diameters stay unknown. Use actual internal and manufacturer outside dimensions, not nominal diameter. Chainage must increase in the entered downstream order.</p>
        </section>
        <section className="space-y-4" aria-label="Profile reference and criteria">
          <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as Array<keyof PipelineReportMetadata>).map(key => <div key={key}>
            <label htmlFor={`pipeline-${key}`} className="mb-1 block text-xs text-[var(--text-secondary)]">{labels[key]}</label>
            <input id={`pipeline-${key}`} value={metadata[key]} className={inputClass} onChange={event => { invalidate(); setMetadata(previous => ({ ...previous, [key]: event.target.value })) }} />
          </div>)}</div>
          <p className="text-sm text-[var(--text-secondary)]">Optional cover comparison: supply the issued minimum, source and revision together. No country or universal minimum is assumed.</p>
          {([
            ['minimum', 'Minimum cover (m)', minimum, setMinimum], ['source', 'Cover specification reference', source, setSource], ['revision', 'Cover specification revision', revision, setRevision],
          ] as const).map(([id, label, text, setter]) => <div key={id}><label htmlFor={`pipeline-${id}`} className="mb-1 block text-xs text-[var(--text-secondary)]">{label}</label><input id={`pipeline-${id}`} inputMode={id === 'minimum' ? 'decimal' : undefined} value={text} className={inputClass} onChange={event => { invalidate(); setter(event.target.value) }} /></div>)}
        </section>
      </div>
      <button onClick={compute} className="my-6 min-h-11 rounded bg-[var(--accent)] px-5 py-3 font-semibold text-black">Analyze Pipeline</button>
      </fieldset>
      {error && <p role="alert" className="mb-4 rounded border border-red-500 p-3 text-sm text-[var(--text-primary)]">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-[var(--text-primary)]">{notice}</p>}
      {saved && <p className="mb-4 text-xs text-[var(--text-secondary)]">Retained batch {saved.id} · Project {saved.project_name} · Recorded {saved.recorded_at}. Download evidence JSON to retain the project reference snapshot, batch identity and input hash with this record.</p>}
      {result && <section data-result="pipeline-profile" className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">{result.summary}</p>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded border border-[var(--border-color)] p-4">Minimum signed cover: <strong>{value(result.minCover)}{result.minCover === null ? '' : ' m'}</strong></div><div className="rounded border border-[var(--border-color)] p-4">Maximum absolute invert grade: <strong>{value(result.maxGrade)}{result.maxGrade === null ? '' : '%'}</strong></div></div>
        <p className="text-xs text-[var(--text-secondary)]">Positive grade means fall to the next observation; negative means rise. Cover = ground RL − [internal invert RL + (actual ID + actual OD) / 2000]. The last row has no next-segment grade. Numerical comparison does not certify acceptance.</p>
        <div className="flex flex-wrap gap-3">
          {projectId && <button className={buttonClass} disabled={saving || historyBusy || !!saved} onClick={() => void save()}>{saving ? 'Recording batch…' : saved ? 'Batch recorded' : 'Save measured batch to project'}</button>}
          <button data-export="pipeline-csv" className={buttonClass} onClick={() => download(pipelineAsBuiltReportCsv(result, metadata), 'metardu-pipeline-asbuilt.csv', 'text/csv;charset=utf-8')}>Download full CSV</button>
          <button className={buttonClass} onClick={() => download(JSON.stringify(saved ?? { schemaVersion: 1, metadata, rawCsv: csv, result }, null, 2), 'metardu-pipeline-asbuilt.json', 'application/json')}>Download evidence JSON</button>
          <button className={buttonClass} disabled={exporting} onClick={() => void exportHtml()}>{exporting ? 'Preparing report…' : 'Download printable HTML'}</button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Open the HTML report and use your browser’s Print / Save as PDF. CSV and JSON retain numerical precision. Missing references remain marked as unknown.</p>
        {result.issues.map(issue => <p key={issue} role="status" className="text-sm text-[var(--text-primary)]">{issue}</p>)}
        <div className="overflow-x-auto rounded border border-[var(--border-color)]"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[var(--bg-secondary)]"><tr>{['Observation', 'Chainage m', 'Internal invert RL m', 'Ground RL m', 'ID / OD mm', 'Outside crown RL m', 'Signed cover m', 'Next grade %', 'Cover comparison'].map(header => <th key={header} className="p-2 font-medium">{header}</th>)}</tr></thead>
          {result.points.map((point, index) => <tbody key={point.id ?? index} className="border-t border-[var(--border-color)]"><tr>{[point.id || 'Not recorded', value(point.chainage), value(point.invertElevation), value(point.groundElevation), `${value(point.pipeDiameter)} / ${value(point.outsideDiameter)}`, value(point.outsideCrownRl), value(point.coverDepth), value(point.grade), pipelineCoverLabel(point.coverAdequate)].map((cell, column) => <td key={column} className="p-2 align-top font-mono text-xs">{cell}</td>)}</tr><tr><td colSpan={9} className="p-2 text-xs text-[var(--text-secondary)]">Joint: {point.jointType || 'Not recorded'} · Remarks: {point.remarks || 'Not recorded'} · {point.assessmentNote}</td></tr></tbody>)}
        </table></div>
      </section>}
    </div>
  )
}
