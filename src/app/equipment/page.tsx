'use client'

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Telescope, Plus, Archive, NotebookPen, Pencil, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BRANDS, INTERVALS, getEquipmentTypes, type EquipmentDetails, type EquipmentWithStatus } from '@/lib/integrations/equipment'
import { createEquipmentApi, fetchAllEquipment, fetchCalibrationLogs, logCalibrationApi, updateEquipmentApi, type CalibrationEntry } from '@/lib/integrations/equipmentApi'
import { calendarDay, type CalibrationStatus } from '@/lib/equipment/calibration'

const labels: Record<CalibrationStatus, string> = { ok: 'Schedule current', due_soon: 'Due soon', overdue: 'Overdue', not_recorded: 'Not recorded', invalid: 'Review dates', failed: 'Failed calibration', review_required: 'Review result' }
const statusStyle = (status: CalibrationStatus) => status === 'failed' || status === 'overdue' ? 'border-red-700 text-red-200 bg-red-950/30' : status === 'ok' ? 'border-emerald-700 text-emerald-200 bg-emerald-950/30' : 'border-amber-700 text-amber-100 bg-amber-950/30'
const message = (error: unknown) => error instanceof Error ? error.message : 'The operation could not be confirmed. Refresh before retrying.'
const fmtDate = (value?: string | null) => value && calendarDay(value) !== null ? new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return <div className="min-w-0"><label htmlFor={id} className="mb-1 block text-sm text-[var(--text-secondary)]">{label}</label>{children(id)}</div>
}
function SaveError({ error }: { error: string }) {
  return error ? <p role="alert" className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null
}
function DetailsForm({ initial, busy, save, cancel }: { initial?: EquipmentWithStatus; busy: boolean; save: (data: EquipmentDetails) => Promise<void>; cancel: () => void }) {
  const [form, setForm] = useState<EquipmentDetails>({
    name: initial?.name ?? '', type: initial?.type ?? 'total_station', brand: initial?.brand ?? '', model: initial?.model ?? '',
    serialNumber: initial?.serialNumber ?? '', purchaseDate: initial?.purchaseDate ?? '', intervalDays: initial && Number.isInteger(initial.intervalDays) && initial.intervalDays > 0 ? initial.intervalDays : 365,
    location: initial?.location ?? '', notes: initial?.notes ?? '',
  })
  const [error, setError] = useState('')
  const types = getEquipmentTypes()
  const today = new Date().toISOString().slice(0, 10)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try { await save(form) } catch (error) { setError(message(error)) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <SaveError error={error} />
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Instrument name">{id => <input id={id} required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input w-full" />}</Field></div>
      <Field label="Instrument type">{id => <select id={id} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input w-full">
        {!types.some(type => type.id === form.type) && <option value={form.type}>{form.type}</option>}
        {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
      </select>}</Field>
      <Field label="Brand">{id => <><input id={id} list={id + '-brands'} maxLength={200} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="input w-full" /><datalist id={id + '-brands'}>{BRANDS.map(brand => <option key={brand} value={brand} />)}</datalist></>}</Field>
      <Field label="Model">{id => <input id={id} maxLength={200} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="input w-full" />}</Field>
      <Field label="Serial number">{id => <input id={id} maxLength={200} value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className="input w-full" />}</Field>
      <Field label="Purchase date">{id => <input id={id} type="date" max={today} value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} className="input w-full" />}</Field>
      <Field label="Adopted calibration interval">{id => <select id={id} value={form.intervalDays} onChange={e => setForm({ ...form, intervalDays: Number(e.target.value) })} className="input w-full">
        {!INTERVALS.some(item => item.days === form.intervalDays) && <option value={form.intervalDays}>{form.intervalDays} days</option>}
        {INTERVALS.map(item => <option key={item.days} value={item.days}>{item.label}</option>)}
      </select>}</Field>
      <div className="sm:col-span-2"><Field label="Location or office">{id => <input id={id} maxLength={200} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input w-full" />}</Field></div>
      <div className="sm:col-span-2"><Field label="Notes">{id => <textarea id={id} maxLength={5000} rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input w-full" />}</Field></div>
    </fieldset>
    <p className="text-sm text-[var(--text-secondary)]">Record the actual calibration date and result using Log calibration. Changing the interval does not rewrite an existing record's due date.</p>
    <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={cancel} disabled={busy} className="btn btn-secondary">Cancel</button><button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : initial ? 'Save instrument' : 'Register instrument'}</button></div>
  </form>
}
function CalibrationForm({ equipment, busy, save, cancel }: { equipment: EquipmentWithStatus; busy: boolean; save: (data: CalibrationEntry) => Promise<void>; cancel: () => void }) {
  const [date, setDate] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [result, setResult] = useState<CalibrationEntry['result'] | ''>('')
  const [technician, setTechnician] = useState('')
  const [certificate, setCertificate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!result) { setError('Choose the recorded calibration result.'); return }
    try { await save({ equipmentId: equipment.id, date, nextDate: nextDate || undefined, result, technician, certificate, notes }) } catch (error) { setError(message(error)) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <SaveError error={error} />
    <fieldset disabled={busy} className="space-y-4">
      <Field label="Recorded calibration date">{id => <input id={id} type="date" required max={new Date().toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} className="input w-full" />}</Field>
      <Field label="Recorded result">{id => <select id={id} required value={result} onChange={e => { const value = e.target.value; if (value === 'passed' || value === 'failed' || value === 'adjusted' || value === '') setResult(value) }} className="input w-full">
        <option value="">Choose the recorded result</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="adjusted">Adjusted, review required</option>
      </select>}</Field>
      <Field label="Next calibration date from the record, if specified">{id => <input id={id} type="date" min={date || undefined} value={nextDate} onChange={e => setNextDate(e.target.value)} className="input w-full" />}</Field>
      <p className="text-sm text-[var(--text-secondary)]">{Number.isInteger(equipment.intervalDays) && equipment.intervalDays > 0 ? 'If no due date is specified, the server uses the adopted interval of ' + String(equipment.intervalDays) + ' days from the recorded calibration date.' : 'Declare an interval in instrument details, or supply the due date from the retained record.'}</p>
      <Field label="Technician or laboratory">{id => <input id={id} maxLength={200} value={technician} onChange={e => setTechnician(e.target.value)} className="input w-full" />}</Field>
      <Field label="Certificate reference">{id => <input id={id} maxLength={200} value={certificate} onChange={e => setCertificate(e.target.value)} className="input w-full" />}</Field>
      <Field label="Record notes">{id => <textarea id={id} rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} className="input w-full" />}</Field>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={cancel} disabled={busy} className="btn btn-secondary">Cancel</button><button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Retaining record…' : 'Save calibration record'}</button></div>
  </form>
}
function InstrumentDetail({ item, ownerId, edit, log, archive }: { item: EquipmentWithStatus; ownerId: string; edit: () => void; log: () => void; archive: () => void }) {
  const history = useQuery({ queryKey: ['calibrationLogs', ownerId, item.id], queryFn: () => fetchCalibrationLogs(item.id) })
  return <div className="space-y-5">
    <div className={'rounded-lg border p-4 ' + statusStyle(item.status)}><p className="font-semibold">{labels[item.status]}</p><p className="mt-1 text-sm">{item.statusReason}</p></div>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{[
      ['Serial number', item.serialNumber || 'Not recorded'], ['Location', item.location || 'Not recorded'],
      ['Last calibration', fmtDate(item.lastCalibrationDate)], ['Retained next due date', fmtDate(item.nextCalibrationDate)],
      ['Adopted interval', Number.isInteger(item.intervalDays) && item.intervalDays > 0 ? String(item.intervalDays) + ' days' : 'Not recorded'], ['Instrument state', item.lifecycleStatus || 'active'],
    ].map(([name, value]) => <div key={name}><dt className="text-[var(--text-muted)]">{name}</dt><dd className="break-words text-[var(--text-primary)]">{value}</dd></div>)}</dl>
    {item.notes && <p className="whitespace-pre-wrap break-words text-sm">{item.notes}</p>}
    <div className="flex flex-wrap gap-3"><button onClick={log} className="btn btn-primary"><NotebookPen size={16} aria-hidden />Log calibration</button><button onClick={edit} className="btn btn-secondary"><Pencil size={16} aria-hidden />Edit details</button><button onClick={archive} className="btn btn-secondary">{item.lifecycleStatus === 'inactive' ? <RotateCcw size={16} aria-hidden /> : <Archive size={16} aria-hidden />}{item.lifecycleStatus === 'inactive' ? 'Restore instrument' : 'Archive instrument'}</button></div>
    <section aria-label="Calibration history" className="space-y-3"><h3 className="font-semibold">Calibration history</h3>
      {history.isLoading && <p role="status">Loading retained history…</p>}
      {history.isError && <div role="alert"><p>Calibration history could not be loaded.</p><button className="btn btn-secondary mt-2" onClick={() => void history.refetch()}>Retry history</button></div>}
      {history.isSuccess && history.data.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No calibration records are retained.</p>}
      {history.data?.map(record => <article key={record.id} className="space-y-1 rounded-lg border border-[var(--border-color)] p-3 text-sm"><p className="font-medium">{fmtDate(record.date)} · {record.result === 'unknown' ? 'Result not recorded' : record.result}</p><p>Next due: {fmtDate(record.nextDate)}</p>{record.technician && <p>{record.technician}</p>}{record.certificate && <p>Certificate: {record.certificate}</p>}{record.notes && <p className="whitespace-pre-wrap break-words">{record.notes}</p>}</article>)}
    </section>
  </div>
}
type Modal = { kind: 'add' | 'edit' | 'calibration' | 'detail' | 'archive'; id?: string; ownerId: string }

export default function EquipmentPage() {
  const { data: session, status: sessionStatus } = useSession()
  const ownerId = session?.user?.id
  const client = useQueryClient()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState<Modal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['equipment', ownerId, includeArchived], queryFn: () => fetchAllEquipment(includeArchived), enabled: Boolean(ownerId) })
  const items = query.data ?? []
  const active = modal && modal.ownerId === ownerId ? items.find(item => item.id === modal.id) : undefined
  const open = (kind: Modal['kind'], id?: string) => { if (ownerId) { setError(''); setModal({ kind, id, ownerId }) } }
  const close = () => { if (!busy) setModal(null) }
  const save = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await operation(); await client.invalidateQueries({ queryKey: ['equipment', ownerId] }); await client.invalidateQueries({ queryKey: ['calibrationLogs', ownerId] }); setModal(null) }
    finally { setBusy(false) }
  }
  if (sessionStatus === 'loading') return <main className="mx-auto max-w-5xl p-6"><p role="status">Checking account…</p></main>
  if (!ownerId) return <main className="mx-auto max-w-5xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Instrument register</h1><p>Sign in to view your instrument and calibration records.</p><Link href="/login?next=%2Fequipment" className="btn btn-primary">Sign in</Link></main>
  const visible = items.filter(item => filter === 'all' || item.status === filter)
  const dialogOpen = modal?.ownerId === ownerId && (modal.kind === 'add' || Boolean(active))
  const titles = { add: 'Register instrument', edit: 'Edit instrument details', calibration: 'Log calibration', detail: active?.name ?? 'Instrument details', archive: active?.lifecycleStatus === 'inactive' ? 'Restore instrument' : 'Archive instrument' }
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Field equipment</p><h1 className="flex items-center gap-3 text-2xl font-semibold"><Telescope aria-hidden size={26} />Instrument register</h1><p className="max-w-2xl text-sm text-[var(--text-secondary)]">Retain instrument details and calibration history. A schedule reflects recorded information and requires professional review before field use.</p></div><button className="btn btn-primary" onClick={() => open('add')}><Plus aria-hidden size={18} />Register instrument</button></header>
    <div className="flex flex-wrap items-end justify-between gap-4"><Field label="Calibration status">{id => <select id={id} value={filter} onChange={e => setFilter(e.target.value)} className="input"><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</Field><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />Include archived instruments</label></div>
    {query.isLoading && <p role="status">Loading instrument records…</p>}
    {query.isError && <div role="alert" className="rounded-lg border border-red-700 p-4"><p>{message(query.error)}</p><button className="btn btn-secondary mt-3" onClick={() => void query.refetch()}>Retry instrument records</button></div>}
    {query.isSuccess && items.length === 0 && <section className="space-y-3 rounded-xl border border-dashed border-[var(--border-color)] px-6 py-12 text-center"><Telescope className="mx-auto text-[var(--text-muted)]" size={36} aria-hidden /><h2 className="text-lg font-semibold">No instruments registered</h2><p className="text-sm text-[var(--text-secondary)]">Register your instrument, then retain its actual calibration record.</p><button className="btn btn-primary" onClick={() => open('add')}>Register your first instrument</button></section>}
    {items.length > 0 && visible.length === 0 && <p>No instruments match this status.</p>}
    <ul className="space-y-3">{visible.map(item => <li key={item.id}><button onClick={() => open('detail', item.id)} className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h2 className="break-words font-semibold">{item.name}{item.lifecycleStatus === 'inactive' && <span className="ml-2 text-sm text-[var(--text-muted)]">Archived</span>}</h2><p className="break-words text-sm text-[var(--text-secondary)]">{[item.brand, item.model, item.serialNumber].filter(Boolean).join(' · ') || item.type}</p></div><span className={'rounded-full border px-3 py-1 text-xs ' + statusStyle(item.status)}>{labels[item.status]}</span></div>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{item.daysUntilDue === null ? item.statusReason : item.daysUntilDue < 0 ? String(Math.abs(item.daysUntilDue)) + ' days overdue' : item.daysUntilDue === 0 ? 'Due today' : String(item.daysUntilDue) + ' days until due'}</p>
    </button></li>)}</ul>
    <Dialog open={Boolean(dialogOpen)} onOpenChange={value => { if (!value) close() }}><DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] sm:max-w-2xl">
      <DialogHeader><DialogTitle>{modal ? titles[modal.kind] : 'Instrument register'}</DialogTitle><DialogDescription>{modal?.kind === 'calibration' ? active?.name : modal?.kind === 'archive' ? 'Archiving retains the instrument and its calibration history. It can be restored later.' : 'Account-owned instrument details and retained, user-reported calibration information.'}</DialogDescription></DialogHeader>
      {modal?.kind === 'add' && <DetailsForm busy={busy} save={data => save(() => createEquipmentApi(data))} cancel={close} />}
      {modal?.kind === 'edit' && active && <DetailsForm key={active.id} initial={active} busy={busy} save={data => save(() => updateEquipmentApi(active.id, data))} cancel={close} />}
      {modal?.kind === 'calibration' && active && <CalibrationForm key={active.id} equipment={active} busy={busy} save={data => save(() => logCalibrationApi(data))} cancel={close} />}
      {modal?.kind === 'detail' && active && <InstrumentDetail item={active} ownerId={ownerId} edit={() => open('edit', active.id)} log={() => open('calibration', active.id)} archive={() => open('archive', active.id)} />}
      {modal?.kind === 'archive' && active && <div className="space-y-4"><SaveError error={error} /><div className="flex flex-wrap justify-end gap-3"><button className="btn btn-secondary" disabled={busy} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { try { await save(() => updateEquipmentApi(active.id, { status: active.lifecycleStatus === 'inactive' ? 'active' : 'inactive' })) } catch (error) { setError(message(error)) } }}>{busy ? 'Saving…' : active.lifecycleStatus === 'inactive' ? 'Restore instrument' : 'Archive instrument'}</button></div></div>}
    </DialogContent></Dialog>
  </main>
}
