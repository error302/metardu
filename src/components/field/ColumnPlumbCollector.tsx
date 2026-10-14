'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { createVerticalityCapture, type VerticalityCaptureSnapshot } from '@/lib/field/verticalityCapture'
import { deliverDevicePlumbReading, exportDevicePlumbCsv, listDevicePlumbReadings, plumbScope, retainDevicePlumbReading, type DevicePlumbReading } from '@/lib/field/verticalityQueue'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'

const EMPTY = { label: '', level: '', baseE: '', baseN: '', baseRL: '', topE: '', topN: '', topRL: '', horizontalUncertainty: '', heightUncertainty: '', observedReference: '', capturedAt: '', instrument: '', notes: '', criteriaName: '', criteriaReference: '', criteriaVersion: '', criteriaApprover: '', maxOffset: '', minRatio: '', criteriaAcknowledged: '', crsConfirmed: '' }
type Draft = typeof EMPTY
type Reference = { code: string; verticalDatum: string | null; cachedAt: string; cached: boolean }
const inputClass = 'w-full min-h-11 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]'
const actionClass = 'min-h-11 rounded border border-[var(--border-color)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40'
function number(value: string, label: string, required = false): number | null {
  if (!value.trim()) { if (required) throw new RangeError(`Enter ${label}.`); return null }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value))) throw new RangeError(`${label} must be a finite decimal value.`)
  return Number(value)
}
function initialDraft(key: string): { form: Draft; error: string | null } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { form: { ...EMPTY }, error: null }
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; fields?: Record<string, unknown> }
    if (parsed.schemaVersion !== 1 || !parsed.fields || Object.keys(parsed.fields).length !== Object.keys(EMPTY).length || Object.keys(EMPTY).some(field => typeof parsed.fields?.[field] !== 'string')) throw new Error('The device form draft is unreadable. Export its device backup for review before recording.')
    return { form: parsed.fields as Draft, error: null }
  } catch (error) { return { form: { ...EMPTY }, error: error instanceof Error ? error.message : 'Device storage unavailable.' } }
}
function cachedReference(key: string): Reference | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const row = JSON.parse(raw) as Partial<Reference>
  if (typeof row.code !== 'string' || typeof row.cachedAt !== 'string' || !Number.isFinite(Date.parse(row.cachedAt)) || row.verticalDatum !== null && typeof row.verticalDatum !== 'string') throw new Error('Cached project reference is unreadable; refresh the declaration before recording.')
  return { code: assertProjectedCrs(row.code).code, verticalDatum: row.verticalDatum ?? null, cachedAt: row.cachedAt, cached: true }
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function ColumnPlumbCollector({ projectId }: { projectId: string }) {
  const session = useSession()
  const ownerId = session.data?.user.id
  if (!projectId) return <p className="p-4">Select a project from the field collector to record column plumb observations.</p>
  if (session.status === 'loading') return <p role="status" className="p-4">Loading account…</p>
  if (!ownerId || session.status !== 'authenticated') return <p className="p-4">Sign in to access this account’s device readings. <Link href={`/login?next=${encodeURIComponent(`/field/setout?projectId=${projectId}&mode=plumb`)}`}>Sign in</Link></p>
  return <OwnedCollector key={plumbScope(ownerId, projectId)} ownerId={ownerId} projectId={projectId} />
}
function OwnedCollector({ ownerId, projectId }: { ownerId: string; projectId: string }) {
  const prefix = plumbScope(ownerId, projectId), draftKey = prefix + 'form', referenceKey = prefix + 'reference'
  const [initial] = useState(() => initialDraft(draftKey))
  const [form, setForm] = useState<Draft>(initial.form)
  const [storageError, setStorageError] = useState<string | null>(initial.error)
  const [reference, setReference] = useState<Reference | null>(null)
  const [cachedConfirmed, setCachedConfirmed] = useState(false)
  const [rows, setRows] = useState<DevicePlumbReading[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const working = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (storageError) return
    try { localStorage.setItem(draftKey, JSON.stringify({ schemaVersion: 1, fields: form })) }
    catch { setStorageError('Device storage could not retain this form. Recording is blocked; copy the measurements or export the device backup.') }
  }, [draftKey, form, storageError])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const load = async () => {
      try { if (active) setRows(listDevicePlumbReadings(ownerId, projectId)) }
      catch (error) { if (active) setStorageError(error instanceof Error ? error.message : 'Device readings unavailable.') }
      try {
        const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/reference-system`, { signal: controller.signal, cache: 'no-store' })
        if ([401, 403, 404].includes(response.status)) {
          if (active) { setReference(null); setMessage('Current project access could not be confirmed. Existing device drafts remain available for backup; sign in and review project access before capturing new readings.') }
          return
        }
        if (!response.ok) throw new Error(`Project reference unavailable (${response.status}).`)
        const body = await response.json() as { referenceSystem?: { prs?: { horizontalCrs?: unknown; verticalDatum?: unknown } } | null }
        if (!active) return
        const prs = body.referenceSystem?.prs
        if (!prs || typeof prs.horizontalCrs !== 'string') { setMessage('Declare the project reference system in project settings before recording.'); setReference(null); return }
        const fresh: Reference = { code: assertProjectedCrs(prs.horizontalCrs).code, verticalDatum: typeof prs.verticalDatum === 'string' && prs.verticalDatum.trim() ? prs.verticalDatum : null, cachedAt: new Date().toISOString(), cached: false }
        setReference(fresh)
        try { localStorage.setItem(referenceKey, JSON.stringify(fresh)) }
        catch { setMessage('The current reference loaded, but could not be cached for offline use.') }
      } catch {
        if (!active) return
        try {
          const cached = cachedReference(referenceKey); setReference(cached)
          setMessage(cached ? 'Connection unavailable. Review and confirm the cached reference before capturing; server checks still govern delivery.' : 'Project reference unavailable and no device copy exists. Reconnect to load the declaration.')
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Reference unavailable.') }
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [ownerId, projectId, referenceKey])
  const preview = useMemo((): { snapshot: VerticalityCaptureSnapshot | null; error: string | null } => {
    if (!reference) return { snapshot: null, error: 'A declared project reference is required.' }
    try {
      const provided = [form.criteriaName, form.criteriaReference, form.criteriaVersion, form.criteriaApprover, form.maxOffset, form.minRatio].some(value => value.trim()) || form.criteriaAcknowledged === 'yes'
      const snapshot = createVerticalityCapture({ projectId, definitionId: null, label: form.label, level: form.level.trim() || null,
        horizontalCrs: reference.code, capturedCrs: form.crsConfirmed === 'yes' ? reference.code : null, verticalDatum: reference.verticalDatum,
        capturedVerticalDatum: form.observedReference.trim() || null, capturedAt: form.capturedAt.trim() || null,
        base: { easting: number(form.baseE, 'base easting', true) as number, northing: number(form.baseN, 'base northing', true) as number, rl: number(form.baseRL, 'base RL') },
        top: { easting: number(form.topE, 'top easting', true) as number, northing: number(form.topN, 'top northing', true) as number, rl: number(form.topRL, 'top RL') },
        horizontalUncertaintyM: number(form.horizontalUncertainty, 'displacement uncertainty'), heightUncertaintyM: number(form.heightUncertainty, 'height uncertainty'),
        criteria: provided ? { name: form.criteriaName, reference: form.criteriaReference, version: form.criteriaVersion, approvedBy: form.criteriaApprover, maxOffsetM: number(form.maxOffset, 'maximum offset'), minTiltRatio: number(form.minRatio, 'minimum ratio'), acknowledged: form.criteriaAcknowledged === 'yes' } : null,
        instrument: form.instrument.trim() || null, notes: [form.notes.trim(), reference.cached ? `Captured with a user-confirmed cached project reference loaded on this device at ${reference.cachedAt}.` : ''].filter(Boolean).join('\n') || null })
      return { snapshot, error: null }
    } catch (error) { return { snapshot: null, error: error instanceof Error ? error.message : 'Complete the observation.' } }
  }, [form, reference, projectId])
  const refreshRows = () => { setRows(listDevicePlumbReadings(ownerId, projectId)); setPage(0) }
  const record = async () => {
    if (working.current || !preview.snapshot || storageError || reference?.cached && !cachedConfirmed) return
    working.current = true
    setBusy(true)
    try {
      const stored = retainDevicePlumbReading(ownerId, preview.snapshot)
      refreshRows()
      setForm(current => ({ ...current, label: '', baseE: '', baseN: '', baseRL: '', topE: '', topN: '', topRL: '', capturedAt: '', notes: '', horizontalUncertainty: '', heightUncertainty: '', observedReference: '', crsConfirmed: '' }))
      const delivered = await deliverDevicePlumbReading(ownerId, projectId, stored.id)
      if (!active.current) return
      refreshRows()
      setMessage(delivered.state === 'synced' ? 'Server confirmed the original observation. This is a draft numerical comparison.' : delivered.state === 'rejected' ? `Retained on this device; server review required: ${delivered.message}` : `Only on this device; retry when connected. ${delivered.message ?? ''}`)
    } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'Recording failed; preserve the measurements and retry.') }
    finally { working.current = false; if (active.current) setBusy(false) }
  }
  const retry = async () => {
    if (working.current) return
    working.current = true
    setBusy(true)
    try { for (const row of rows.filter(row => row.state === 'queued')) { if (!active.current) break; await deliverDevicePlumbReading(ownerId, projectId, row.id) }; if (active.current) { refreshRows(); setMessage('Delivery attempted; check each reading’s register status below.') } }
    catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'Device readings remain pending.') }
    finally { working.current = false; if (active.current) setBusy(false) }
  }
  const backup = () => {
    const entries: Record<string, string> = {}
    let backupError: string | null = null
    try { for (let index = 0; index < localStorage.length; index++) { const key = localStorage.key(index); if (key?.startsWith(prefix)) entries[key] = localStorage.getItem(key) ?? '' } }
    catch { backupError = 'Device storage could not be read; the visible form is included below.' }
    download(`metardu-plumb-device-${projectId}.json`, JSON.stringify({ schemaVersion: 1, status: 'DEVICE BACKUP - NOT CONSTRUCTION ACCEPTANCE', ownerId, projectId, liveForm: form, displayedReference: reference, backupError, entries }, null, 2), 'application/json')
  }
  const field = (key: keyof Draft, label: string, numeric = false) => <label key={key} className="space-y-1 text-sm"><span>{label}</span><input aria-label={label} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className={`${inputClass}${numeric ? ' font-mono tabular-nums text-right' : ''}`} inputMode={numeric ? 'decimal' : 'text'} disabled={busy || Boolean(storageError)} /></label>
  const checkbox = (key: keyof Draft, label: string) => <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form[key] === 'yes'} onChange={event => setForm(current => ({ ...current, [key]: event.target.checked ? 'yes' : '' }))} disabled={busy || Boolean(storageError)} />{label}</label>
  return <section aria-label="Column plumb collector" className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-28 text-[var(--text-primary)]">
    <header className="space-y-2 border-b border-[var(--border-color)] pb-4"><nav aria-label="Field workflow" className="flex flex-wrap gap-4"><Link href={`/field/setout?projectId=${encodeURIComponent(projectId)}`} className="text-sm text-[var(--accent)]">Back to set-out points</Link><Link href={`/project/${encodeURIComponent(projectId)}/settings`} className="text-sm text-[var(--accent)]">Project reference settings</Link></nav><h1 className="text-xl font-semibold">Column plumb observations</h1><p className="text-sm text-[var(--text-muted)]">Record measured base/top centres and levels. Numerical limits require project criteria; these readings do not certify survey control or construction acceptance.</p></header>
    <section className="space-y-2 text-sm" aria-label="Project reference"><p>Project CRS: {reference?.code ?? 'Not loaded'} · Height reference: {reference?.verticalDatum ?? 'Not declared'}</p>{reference?.cached && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={cachedConfirmed} onChange={event => setCachedConfirmed(event.target.checked)} />I reviewed the cached project reference ({reference.cachedAt}) for this observation.</label>}{checkbox('crsConfirmed', 'The observed coordinates use the displayed project grid.')}</section>
    {storageError && <p role="alert" className="text-[var(--error)]">{storageError}</p>}
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Observation identity</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field('label', 'Column label')}{field('level', 'Storey / level')}{field('instrument', 'Instrument')}{field('capturedAt', 'Device capture UTC (ISO timestamp)')}</div><button type="button" className={actionClass} disabled={busy || Boolean(storageError)} onClick={() => setForm(current => ({ ...current, capturedAt: new Date().toISOString() }))}>Use current device time</button><p className="text-xs text-[var(--text-muted)]">Leave time blank when unknown. The device timestamp is reported evidence, not independently verified field time.</p></fieldset>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Measured centres · metres</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{field('baseE', 'Base easting', true)}{field('baseN', 'Base northing', true)}{field('baseRL', 'Base RL', true)}{field('topE', 'Top easting', true)}{field('topN', 'Top northing', true)}{field('topRL', 'Top RL', true)}</div></fieldset>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Observation uncertainty and reference</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{field('horizontalUncertainty', 'Displacement uncertainty (m)', true)}{field('heightUncertainty', 'Height-difference uncertainty (m)', true)}{field('observedReference', 'Observed height reference')}</div><p className="text-xs text-[var(--text-muted)]">Enter uncertainty for the displacement and height difference, accounting for both readings. One fix’s horizontal accuracy cannot establish level accuracy.</p></fieldset>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Project plumb criteria · optional for unassessed records</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('criteriaName', 'Criteria name')}{field('criteriaReference', 'Drawing / specification reference')}{field('criteriaVersion', 'Criteria revision')}{field('criteriaApprover', 'Named project approver')}{field('maxOffset', 'Maximum offset (m)', true)}{field('minRatio', 'Minimum tilt ratio denominator', true)}</div>{checkbox('criteriaAcknowledged', 'I transcribed these criteria from the applicable project specification.')}<p className="text-xs text-[var(--text-muted)]">Complete all supplied criteria, or leave them all blank to retain an unassessed observation. Named approval is a transcription, not independent verification.</p></fieldset>
    {field('notes', 'Observation notes')}
    <section className="space-y-2 border-t border-[var(--border-color)] pt-4" aria-label="Numerical preview">
      <h2 className="font-semibold">Numerical preview</h2>
      {preview.snapshot ? <>
        <p>Numerical result: {preview.snapshot.assessment.result === 'INFO' ? 'Not assessed (INFO)' : preview.snapshot.assessment.result}</p>
        <p className="font-mono text-sm">Grid offset: {preview.snapshot.assessment.offsetM.toFixed(6)} m · Height: {preview.snapshot.assessment.heightM == null ? 'Not assessed' : `${preview.snapshot.assessment.heightM.toFixed(6)} m`} · Approximate ratio: {preview.snapshot.assessment.tiltRatioKind === 'infinite' ? 'Infinite (zero measured offset)' : preview.snapshot.assessment.tiltRatio == null ? 'Not assessed' : `1:${preview.snapshot.assessment.tiltRatio.toPrecision(6)}`}</p>
        <p className="text-xs text-[var(--text-muted)]">Preview values are rounded. Exports preserve raw captured precision. Enter limits applicable to these grid coordinates; no grid-to-ground correction or construction acceptance is inferred.</p>
        <p className="text-sm text-[var(--text-muted)]">{preview.snapshot.assessment.message}</p>
      </> : <p className="text-sm text-[var(--text-muted)]">{preview.error}</p>}
    </section>
    <div className="flex flex-wrap gap-3"><button type="button" data-action="record-plumb" disabled={busy || Boolean(storageError) || !preview.snapshot || Boolean(reference?.cached && !cachedConfirmed)} onClick={() => void record()} className={`${actionClass} bg-[var(--accent)] text-[var(--bg-primary)]`}>{busy ? 'Working…' : preview.snapshot?.assessment.result === 'INFO' ? 'Record unassessed reading' : 'Record field reading'}</button><button type="button" disabled={busy || Boolean(storageError) || !rows.some(row => row.state === 'queued')} onClick={() => void retry()} className={actionClass}>Retry pending delivery</button><button type="button" onClick={backup} className={actionClass}>Export device backup</button><button type="button" disabled={!rows.length || Boolean(storageError)} onClick={() => download(`metardu-plumb-device-${projectId}.csv`, exportDevicePlumbCsv(rows), 'text/csv;charset=utf-8')} className={actionClass}>Export device CSV</button></div>
    {message && <p role="status" className="text-sm text-[var(--text-muted)]">{message}</p>}
    <section className="space-y-3"><h2 className="font-semibold">This account’s device readings · {rows.length}</h2><p className="text-xs text-[var(--text-muted)]">Device-only readings are not on the project register. A confirmed save remains a draft numerical comparison. Export a backup regularly; browser storage can be cleared by the device.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--border-color)]"><th className="p-2 text-left">Column</th><th className="p-2 text-left">Capture UTC</th><th className="p-2 text-left">Numerical result</th><th className="p-2 text-left">Register status</th></tr></thead><tbody>{rows.slice(page * 20, (page + 1) * 20).map(row => <tr key={row.id} className="border-b border-[var(--border-color)]"><td className="p-2">{row.snapshot.label}<br /><span className="text-xs">{row.id}</span></td><td className="p-2">{row.snapshot.capturedAt ?? 'Unknown'}</td><td className="p-2">{row.snapshot.assessment.result}</td><td className="p-2">{row.state === 'synced' ? `Server confirmed (${row.serverId})` : row.state === 'rejected' ? 'Device only · needs review' : 'Only on this device'}{row.message && <p className="text-xs">{row.message}</p>}</td></tr>)}</tbody></table></div>{rows.length > 20 && <div className="flex gap-3"><button className={actionClass} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous readings</button><button className={actionClass} disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(value => value + 1)}>Next readings</button></div>}</section>
  </section>
}
