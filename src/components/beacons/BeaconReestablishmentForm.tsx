'use client'
import { useRef, useState } from 'react'
import { RegistryProjectField, type RegistryProject } from './RegistryProjectField'

export function BeaconReestablishmentForm({ beacon, onClose, onSaved }: {
  beacon: { id: string; beacon_number: string; easting: number; northing: number; project_id?: string | null; horizontal_crs?: string | null }
  onClose: () => void; onSaved: () => void
}) {
  const [project, setProject] = useState<RegistryProject | null>(null)
  const [easting, setEasting] = useState(''), [northing, setNorthing] = useState(''), [elevation, setElevation] = useState('')
  const [originalCrs, setOriginalCrs] = useState(beacon.horizontal_crs ?? '')
  const [ties, setTies] = useState(''), [instrument, setInstrument] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState('')
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null)
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!project?.horizontalCrs || !easting.trim() || !northing.trim() || !date) return
    const instant = new Date(date)
    if (!Number.isFinite(instant.getTime())) { setError('Enter the observation date and time.'); return }
    const body = { projectId: project.id, easting: Number(easting), northing: Number(northing), elevation: elevation.trim() ? Number(elevation) : null,
      horizontalCrs: project.horizontalCrs, originalHorizontalCrs: originalCrs, verticalDatum: elevation.trim() ? project.verticalDatum : null,
      ties, instrument, note, observationDate: instant.toISOString() }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() }
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/beacons/${beacon.id}/reestablish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: pending.current.requestId }) })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'The replacement was not recorded.')
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The replacement could not be confirmed. Retry with the same observations.') }
    finally { setSaving(false) }
  }
  return <form onSubmit={event => void save(event)} className="card p-4 space-y-3">
    <div className="flex justify-between gap-3"><h3 className="font-semibold">Record replacement for {beacon.beacon_number}</h3><button type="button" onClick={onClose} disabled={saving} className="text-sm text-[var(--text-muted)]">Close</button></div>
    <p className="text-xs text-[var(--text-muted)]">Original coordinate: E {beacon.easting}, N {beacon.northing}. The original record will remain intact. The replacement receives a local reference and still needs control verification.</p>
    <RegistryProjectField value={project} onChange={setProject} onlyId={beacon.project_id} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-xs">Observed easting (m)<input required type="number" step="any" value={easting} onChange={event => setEasting(event.target.value)} className="input mt-1 w-full" /></label>
      <label className="text-xs">Observed northing (m)<input required type="number" step="any" value={northing} onChange={event => setNorthing(event.target.value)} className="input mt-1 w-full" /></label>
      <label className="text-xs">Observed height (m, optional)<input type="number" step="any" value={elevation} onChange={event => setElevation(event.target.value)} className="input mt-1 w-full" /></label>
    </div>
    <label className="block text-xs">Original coordinate grid<input required value={originalCrs} onChange={event => setOriginalCrs(event.target.value)} placeholder="EPSG code from the original record" className="input mt-1 w-full" /></label>
    <label className="block text-xs">Observation date and time (device local time)<input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="input mt-1 w-full" /></label>
    <label className="block text-xs">Instrument and serial/reference<input required value={instrument} onChange={event => setInstrument(event.target.value)} className="input mt-1 w-full" /></label>
    <label className="block text-xs">Observed ties to control<textarea required value={ties} onChange={event => setTies(event.target.value)} className="input mt-1 w-full" /></label>
    <label className="block text-xs">Reason and field notes<textarea required value={note} onChange={event => setNote(event.target.value)} className="input mt-1 w-full" /></label>
    {elevation.trim() && !project?.verticalDatum && <p role="alert" className="text-xs text-amber-400">Declare the project vertical datum before recording a height.</p>}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <button type="submit" disabled={saving || !project?.horizontalCrs || Boolean(elevation.trim() && !project?.verticalDatum)} className="btn btn-primary">{saving ? 'Recording…' : 'Record observed replacement'}</button>
  </form>
}
