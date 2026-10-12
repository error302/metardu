'use client'
import { useState } from 'react'
import Link from 'next/link'
export function PublicControlSubmission() {
  const [form, setForm] = useState({ name: '', beaconType: 'control', easting: '', northing: '', elevation: '', horizontalCrs: '', verticalDatum: '', sourceReference: '', authority: '', country: '', description: '' })
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null)
    try {
      const response = await fetch('/api/public-beacons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, easting: Number(form.easting), northing: Number(form.northing), elevation: form.elevation.trim() ? Number(form.elevation) : null, verticalDatum: form.verticalDatum.trim() || null }) })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Submission could not be confirmed')
      setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Submission failed') }
    finally { setSaving(false) }
  }
  return <div className="max-w-3xl mx-auto px-4 py-10 space-y-5">
    <Link href="/beacons" className="text-sm text-[var(--accent)]">← Reference control catalogue</Link>
    <h1 className="text-2xl font-semibold">Submit a reference mark</h1>
    <p className="text-sm text-[var(--text-secondary)]">Enter the published coordinate and its source. A separate reviewer checks the catalogue basis. Field verification and project suitability remain separate work.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {saved ? <div role="status" className="card p-6 space-y-3"><p>Submission recorded for independent catalogue review.</p><Link href="/beacons" className="btn btn-primary">Review my submissions</Link></div> : <form onSubmit={event => void submit(event)} className="card p-5 space-y-4">
      {([['name', 'Reference name'], ['horizontalCrs', 'Published horizontal grid (EPSG code)'], ['easting', 'Published easting (m)'], ['northing', 'Published northing (m)'], ['elevation', 'Published height (m, optional)'], ['verticalDatum', 'Published vertical datum'], ['sourceReference', 'Source document, sheet, revision or publication reference'], ['authority', 'Source publisher or authority'], ['country', 'Country']] as const).map(([key, label]) => <label key={key} className="block text-sm">{label}<input required={key !== 'elevation' && (key !== 'verticalDatum' || Boolean(form.elevation.trim()))} type={['easting', 'northing', 'elevation'].includes(key) ? 'number' : 'text'} step="any" value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} className="input mt-1 w-full" /></label>)}
      <label className="block text-sm">Mark type<select value={form.beaconType} onChange={event => setForm({ ...form, beaconType: event.target.value })} className="input mt-1 w-full">{['control', 'trig', 'benchmark', 'tidal', 'gnss', 'boundary', 'other'].map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="block text-sm">Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="input mt-1 w-full" /></label>
      <button disabled={saving} className="btn btn-primary">{saving ? 'Submitting…' : 'Submit for catalogue review'}</button>
    </form>}
  </div>
}
