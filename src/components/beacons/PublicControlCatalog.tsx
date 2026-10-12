'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { RegistryProjectField, type RegistryProject } from './RegistryProjectField'

const ReferenceMap = dynamic(() => import('./PublicControlMap'), { ssr: false })
interface ReferenceMark {
  id: string; name: string; beacon_type: string; easting: number; northing: number;
  elevation: number | null; horizontal_crs: string | null; vertical_datum: string | null;
  source_reference: string | null; authority: string | null; country: string | null;
  description: string | null; status: string; distance_m?: number; bearing_dms?: string | null;
}
type CatalogueMode = 'reviewed' | 'mine' | 'queue'

export function PublicControlCatalog() {
  const { data: session } = useSession()
  const canReview = ['admin', 'super_admin'].includes(session?.user?.role ?? '')
  const [mode, setMode] = useState<CatalogueMode>('reviewed')
  const [q, setQ] = useState(''), [crs, setCrs] = useState(''), [e, setE] = useState(''), [n, setN] = useState(''), [radius, setRadius] = useState('10000')
  const [rows, setRows] = useState<ReferenceMark[]>([]), [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReferenceMark | null>(null), [project, setProject] = useState<RegistryProject | null>(null)
  const [pointName, setPointName] = useState(''), [saving, setSaving] = useState(false), [reason, setReason] = useState(''), [showMap, setShowMap] = useState(false)
  const [importedProject, setImportedProject] = useState<string | null>(null)
  const sequence = useRef(0), pending = useRef<{ key: string; requestId: string } | null>(null)

  const search = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (q.trim()) params.set('q', q.trim())
      if (mode === 'mine') params.set('mine', 'true')
      if (e.trim() || n.trim()) {
        if (!e.trim() || !n.trim() || !crs.trim()) throw new Error('Enter both coordinates and their declared EPSG grid')
        params.set('easting', e); params.set('northing', n); params.set('crs', crs); params.set('radius', radius)
      }
      const response = await fetch(mode === 'queue' ? '/api/public-beacons/review-queue' : `/api/public-beacons?${params}`)
      const payload = await response.json() as { error?: string; data?: { beacons?: ReferenceMark[] } }
      if (!response.ok) throw new Error(payload.error ?? 'Reference records could not be loaded')
      if (request === sequence.current) setRows(payload.data?.beacons ?? [])
    } catch (cause) {
      if (request === sequence.current) { setRows([]); setError(cause instanceof Error ? cause.message : 'Search failed') }
    } finally { if (request === sequence.current) setLoading(false) }
  }, [mode, q, e, n, crs, radius])
  const cancelSearch = useCallback(() => { sequence.current++ }, [])
  useEffect(() => {
    void search()
    return cancelSearch
    // Search is explicit after edits; a view change reloads its records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cancelSearch])

  async function importMark(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !project) return
    const key = JSON.stringify({ sourceId: selected.id, projectId: project.id, pointName: pointName.trim() })
    if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() }
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/public-beacons/${selected.id}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, pointName: pointName.trim(), requestId: pending.current.requestId }) })
      const payload = await response.json() as { error?: string; data?: { captureId?: string } }
      if (!response.ok) throw new Error(payload.error ?? 'Import was not confirmed')
      setNotice('Source control registered with its reference evidence. Field verification is still required.')
      setImportedProject(project.id)
      setSelected(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The import could not be confirmed; retry the same request') }
    finally { setSaving(false) }
  }
  async function reviewMark(id: string, decision: 'verified' | 'rejected') {
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/public-beacons/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason }) })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Review was not recorded')
      setNotice('Catalogue review recorded. This does not certify an on-site verification.'); setReason(''); void search()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed') }
    finally { setSaving(false) }
  }
  const mismatch = selected && project && (project.horizontalCrs !== selected.horizontal_crs || (selected.elevation !== null && project.verticalDatum !== selected.vertical_datum))
  const fields = [
    { label: 'Search grid', value: crs, change: setCrs, type: 'text' },
    { label: 'Search easting (m)', value: e, change: setE, type: 'number' },
    { label: 'Search northing (m)', value: n, change: setN, type: 'number' },
    { label: 'Radius (grid metres)', value: radius, change: setRadius, type: 'number' },
  ]
  return <section className="space-y-5" aria-labelledby="reference-catalog-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="reference-catalog-heading" className="text-2xl font-semibold">Reference control catalogue</h1><p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">Review source records before using a mark. Catalogue review records the reference basis; check the physical mark and its suitability for your survey.</p></div>
      <Link href="/beacons/submit" className="btn btn-primary">Submit a reference mark</Link>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Catalogue views">{(['reviewed', 'mine', ...(canReview ? ['queue'] : [])] as CatalogueMode[]).map(value => <button key={value} onClick={() => { setMode(value); setSelected(null); setShowMap(false) }} className={`btn ${mode === value ? 'btn-primary' : 'btn-secondary'}`}>{value === 'reviewed' ? 'Reviewed sources' : value === 'mine' ? 'My submissions' : 'Review submissions'}</button>)}</div>
    {mode !== 'queue' && <form onSubmit={event => { event.preventDefault(); void search() }} className="card p-4 space-y-3">
      <label className="block text-sm">Reference name<input value={q} onChange={event => setQ(event.target.value)} className="input mt-1 w-full" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(field => <label key={field.label} className="text-sm">{field.label}<input type={field.type} step="any" value={field.value} onChange={event => field.change(event.target.value)} className="input mt-1 w-full" /></label>)}</div>
      <p className="text-xs text-[var(--text-muted)]">Coordinates are optional. Nearby search compares records in the same declared grid and reports grid distance.</p>
      <button disabled={loading} className="btn btn-primary">{loading ? 'Searching…' : 'Search reference marks'}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}{notice && <p role="status" className="text-sm text-[var(--text-secondary)] break-words">{notice}</p>}
    {importedProject && <Link href={`/project/${importedProject}/control`} className="text-sm text-[var(--accent)]">Open project control register</Link>}
    {selected && <form onSubmit={event => void importMark(event)} className="card p-4 space-y-3">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">Import source control · {selected.name}</h2><button type="button" onClick={() => setSelected(null)} disabled={saving}>Close</button></div>
      <RegistryProjectField value={project} onChange={setProject} />
      <label className="block text-sm">Project point name<input required maxLength={100} value={pointName} onChange={event => setPointName(event.target.value)} className="input mt-1 w-full" /></label>
      <p className="text-sm">Source grid: {selected.horizontal_crs}. Height datum: {selected.vertical_datum ?? 'not observed'}. Source coordinates and the import capture are retained; this operation does not transform them or verify the physical mark.</p>
      {mismatch && <p role="alert" className="text-amber-400 text-sm">The source and project reference systems must match.</p>}
      <button disabled={saving || !project?.horizontalCrs || Boolean(mismatch)} className="btn btn-primary">{saving ? 'Importing…' : 'Register source control'}</button>
    </form>}
    {mode === 'queue' && <label className="block text-sm">Review reason and source checks<textarea value={reason} onChange={event => setReason(event.target.value)} className="input mt-1 w-full" /></label>}
    {rows.some(row => row.horizontal_crs) && <button type="button" onClick={() => setShowMap(!showMap)} className="btn btn-secondary">{showMap ? 'Hide reference map' : 'Show reference map'}</button>}
    {showMap && <ReferenceMap marks={rows} />}
    <div className="space-y-3">{!loading && rows.length === 0 ? <p className="card p-6 text-sm text-[var(--text-secondary)]">No {mode === 'reviewed' ? 'reviewed references match this search' : mode === 'mine' ? 'submitted references found' : 'submissions await your review'}. No example coordinates are presented as control.</p> : rows.map(mark => <article key={mark.id} className="card p-4 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-mono font-semibold break-all">{mark.name}</h2><span className="text-xs text-[var(--text-muted)]">{mark.beacon_type} · {mark.status === 'verified' ? 'catalogue reviewed' : mark.status}</span></div>
      <p className="font-mono text-sm break-words">E {mark.easting} · N {mark.northing}{mark.elevation === null ? '' : ` · Height ${mark.elevation} m`}</p>
      <p className="text-sm">{mark.horizontal_crs ?? 'Reference not declared'}{mark.elevation === null ? '' : ` · ${mark.vertical_datum ?? 'Height datum missing'}`}</p>
      <p className="text-xs text-[var(--text-secondary)] break-words">{mark.authority} · {mark.country} · Source: {mark.source_reference ?? 'source evidence missing'}</p>
      {mark.distance_m != null && <p className="text-sm">{mark.distance_m.toFixed(3)} m grid distance{mark.bearing_dms ? ` · Grid bearing ${mark.bearing_dms}` : ''}</p>}{mark.description && <p className="text-sm text-[var(--text-secondary)]">{mark.description}</p>}
      {mode === 'reviewed' && <button className="btn btn-secondary" onClick={() => { setSelected(mark); setProject(null); setPointName(mark.name); setError(null) }}>Import with provenance</button>}
      {mode === 'queue' && <div className="flex flex-wrap gap-2"><button disabled={saving || reason.trim().length < 5} onClick={() => void reviewMark(mark.id, 'verified')} className="btn btn-primary">Approve catalogue basis</button><button disabled={saving || reason.trim().length < 5} onClick={() => void reviewMark(mark.id, 'rejected')} className="btn btn-secondary">Reject submission</button></div>}
    </article>)}</div>
    {rows.length === 100 && <p className="text-xs text-[var(--text-muted)]">Showing the first 100 matching records. Refine the name or location search.</p>}
  </section>
}
