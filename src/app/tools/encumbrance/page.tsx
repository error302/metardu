'use client'
import { useRef, useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EncumbranceCoverageDrawing } from '@/components/cadastral/EncumbranceCoverageDrawing'
import { parseEncumbranceCoordinates, reviewEncumbranceRecords } from '@/lib/cadastral/encumbranceRecords'
import type { Encumbrance, EncumbranceParcel, EncumbranceResult, EncumbranceType } from '@/lib/cadastral/encumbranceRecords'

interface DraftRecord { id: string; type: EncumbranceType | ''; description: string; holder: string; geometryType: 'centreline' | 'polygon' | ''; width: string; coords: string; date: string; reference: string }
const measurement = (text: string, label: string) => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text))) throw new RangeError(`${label}: enter a complete finite decimal.`)
  return Number(text)
}
const displayArea = (value: number | null) => value == null ? 'Not assessed' : `${value.toFixed(3)} m²`

export default function EncumbrancePage() {
  const [sourceArea, setSourceArea] = useState(''), [crsCode, setCrsCode] = useState(''), [boundaryText, setBoundaryText] = useState('')
  const [useCorridorModel, setUseCorridorModel] = useState(false)
  const [records, setRecords] = useState<DraftRecord[]>([])
  const [snapshot, setSnapshot] = useState<{ result: EncumbranceResult; parcel?: EncumbranceParcel } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const invalidate = () => { revision.current++; setSnapshot(null); setError('') }
  const update = (id: string, field: keyof Omit<DraftRecord, 'id'>, value: string) => { invalidate(); setRecords(old => old.map(r => r.id === id ? { ...r, [field]: value } : r)) }
  const assess = async () => {
    invalidate(); const requestedRevision = revision.current; setBusy(true)
    try {
      if (records.length > 100) throw new RangeError('Assess at most 100 source records per draft.')
      // Geometry is loaded on demand; the initial form does not load Turf or DXF generation.
      const rings = parseEncumbranceCoordinates(boundaryText)
      const parcel: EncumbranceParcel | undefined = rings.length ? { boundary: rings[0], holes: rings.slice(1), crsCode: crsCode.trim(),
        ...(useCorridorModel ? { corridorModel: 'butt-bevel' as const } : {}) } : undefined
      let observationCount = 0
      const supplied: Encumbrance[] = records.map((record, i) => {
        const geometry = parseEncumbranceCoordinates(record.coords)
        observationCount += geometry.reduce((sum, ring) => sum + ring.length, 0)
        if (observationCount > 5000) throw new RangeError('Assess at most 5,000 record geometry observations per draft.')
        if (record.geometryType === 'centreline' && geometry.length > 1) throw new RangeError(`Record ${i + 1}: centreline geometry must be one continuous line; use a polygon for holes.`)
        return { id: record.id, type: record.type as EncumbranceType, description: record.description.trim(), holder: record.holder.trim(),
          geometryType: record.geometryType || undefined, coordinates: geometry[0] ?? [], holes: geometry.slice(1),
          corridorWidth: record.width.trim() ? measurement(record.width, `Record ${i + 1} full width`) : undefined,
          registeredDate: record.date || undefined, referenceNumber: record.reference.trim() || undefined }
      })
      const declaredArea = sourceArea.trim() ? measurement(sourceArea, 'Source parcel area') : undefined
      const review = reviewEncumbranceRecords(supplied, declaredArea)
      const result = parcel ? (await import('@/lib/cadastral/encumbranceAnalysis')).analyzeEncumbrances(supplied, declaredArea, parcel) : review
      if (requestedRevision === revision.current) setSnapshot({ result, parcel })
    } catch (failure) { if (requestedRevision === revision.current) setError(failure instanceof Error ? failure.message : 'Review the supplied records and parcel geometry.') }
    finally { setBusy(false) }
  }
  const download = async (kind: 'schedule' | 'geometry' | 'dxf') => {
    if (!snapshot) return
    const requestedRevision = revision.current; setBusy(true); setError('')
    try {
      const exports = await import('@/lib/cadastral/encumbranceExports')
      const content = kind === 'dxf' ? exports.generateEncumbranceDxf(snapshot.result, snapshot.parcel)
        : kind === 'geometry' ? exports.buildEncumbranceGeometryCsv(snapshot.result, snapshot.parcel) : exports.buildEncumbranceCsv(snapshot.result, snapshot.parcel)
      if (requestedRevision !== revision.current) return
      const url = URL.createObjectURL(new Blob([kind === 'dxf' ? content : `\uFEFF${content}`], { type: kind === 'dxf' ? 'application/dxf' : 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `metardu-encumbrance-${kind}.${kind === 'dxf' ? 'dxf' : 'csv'}`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 250)
    } catch (failure) { if (requestedRevision === revision.current) setError(failure instanceof Error ? failure.message : 'The draft export could not be prepared.') }
    finally { setBusy(false) }
  }
  const inputClass = 'mt-1 min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-white'
  const result = snapshot?.result
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <PageHeader title="Encumbrance Record Review" subtitle="Supplied records, parcel geometry and draft coverage schedules" reference="Declared project CRS · source records · professional review required" />
    <p className="text-sm text-zinc-400">Record source information and assess spatial footprints against a measured parcel. This page does not register an interest, search a registry or verify title restrictions. Missing records, dates and geometry remain unknown.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-zinc-400">Source parcel area (m², optional)<input type="number" step="any" value={sourceArea} onChange={e => { invalidate(); setSourceArea(e.target.value) }} className={inputClass} /></label>
      <label className="text-sm text-zinc-400">Declared projected CRS<input value={crsCode} onChange={e => { invalidate(); setCrsCode(e.target.value) }} placeholder="Enter the project's registered EPSG code" className={inputClass} /></label>
    </div>
    <label className="block text-sm text-zinc-400">Parcel boundary coordinates<textarea rows={5} value={boundaryText} onChange={e => { invalidate(); setBoundaryText(e.target.value) }} className={inputClass + ' font-mono'} /></label>
    <p className="text-xs text-zinc-400">Easting,northing in metres, one pair per line. The first ring is the outer parcel boundary. Separate optional hole rings with a blank line. Enter the same CRS for every supplied geometry. A source/title area does not replace boundary coordinates.</p>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={useCorridorModel} onChange={e => { invalidate(); setUseCorridorModel(e.target.checked) }} />Use butt ends and bevel joins</label>
    <p className="text-xs text-zinc-400">For centreline records only: full width is centred on the line, with butt ends and bevel corners. This is a declared geometric model, not a legal wayleave standard. Supply the authoritative polygon when its geometry differs.</p>
    <div className="flex items-center justify-between"><h2 className="font-semibold">Supplied records</h2><button type="button" onClick={() => { invalidate(); setRecords(old => [...old, { id: crypto.randomUUID(), type: '', description: '', holder: '', geometryType: '', width: '', coords: '', date: '', reference: '' }]) }} className="min-h-11 rounded border border-zinc-700 px-4">+ Add record</button></div>
    {records.map((record, i) => <section key={record.id} className="space-y-3 rounded border border-zinc-700 p-4">
      <div className="flex justify-between"><h3>Record {i + 1}</h3><button type="button" aria-label={`Remove record ${i + 1}`} onClick={() => { invalidate(); setRecords(old => old.filter(r => r.id !== record.id)) }} className="min-h-11 px-3 text-red-300">Remove</button></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-zinc-400">Supplied type<select aria-label={`Record ${i + 1} type`} value={record.type} onChange={e => update(record.id, 'type', e.target.value)} className={inputClass}><option value="">Select type</option>{['wayleave', 'easement', 'restriction', 'caveat', 'lease', 'charge'].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="text-sm text-zinc-400">Geometry<select aria-label={`Record ${i + 1} geometry`} value={record.geometryType} onChange={e => update(record.id, 'geometryType', e.target.value)} className={inputClass}><option value="">No spatial footprint supplied</option><option value="centreline">Centreline with full width</option><option value="polygon">Source polygon</option></select></label>
        <label className="text-sm text-zinc-400">Full corridor width (m)<input aria-label={`Record ${i + 1} full corridor width (m)`} type="number" step="any" value={record.width} onChange={e => update(record.id, 'width', e.target.value)} className={inputClass} /></label>
        <label className="text-sm text-zinc-400">Description<input aria-label={`Record ${i + 1} description`} value={record.description} onChange={e => update(record.id, 'description', e.target.value)} className={inputClass} /></label>
        <label className="text-sm text-zinc-400">Holder / beneficiary<input aria-label={`Record ${i + 1} holder`} value={record.holder} onChange={e => update(record.id, 'holder', e.target.value)} className={inputClass} /></label>
        <label className="text-sm text-zinc-400">Source reference<input aria-label={`Record ${i + 1} source reference`} value={record.reference} onChange={e => update(record.id, 'reference', e.target.value)} className={inputClass} /></label>
        <label className="text-sm text-zinc-400">Registration date from source (optional)<input aria-label={`Record ${i + 1} source registration date`} type="date" value={record.date} onChange={e => update(record.id, 'date', e.target.value)} className={inputClass} /></label>
      </div>
      <label className="block text-sm text-zinc-400">Supplied geometry coordinates<textarea aria-label={`Record ${i + 1} coordinates`} rows={4} value={record.coords} onChange={e => update(record.id, 'coords', e.target.value)} className={inputClass + ' font-mono'} /></label>
    </section>)}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void assess()} className="min-h-11 rounded bg-[var(--accent)] px-5 font-semibold text-black disabled:opacity-50">{busy ? 'Preparing…' : 'Assess supplied records'}</button>
    {result && <section className="space-y-4">
      <h2 className="font-semibold">Draft coverage of supplied records</h2>
      <div className="grid gap-3 sm:grid-cols-3"><p>Computed parcel area: {displayArea(result.parcelArea)}</p><p>Union of assessed footprints: {displayArea(result.assessedUnionArea)}</p><p aria-label="Complete supplied-record coverage">Complete supplied-record coverage: {displayArea(result.totalAffectedArea)}</p></div>
      <p className="text-sm">Coverage percentage: {result.affectedPercent == null ? 'Not assessed' : `${result.affectedPercent.toFixed(4)}%`} · Registry status: not verified.</p>
      <p className="text-sm text-zinc-400">{result.summary}</p>
      {result.declaredAreaDifference != null && <p className="text-sm text-zinc-400">Supplied source area minus computed grid area: {result.declaredAreaDifference.toFixed(3)} m². Review the measurement basis and source; no legal tolerance is assessed.</p>}
      {snapshot?.parcel && <EncumbranceCoverageDrawing result={result} parcel={snapshot.parcel} />}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Record', 'Type', 'Source reference', 'Source date', 'Whole footprint (m²)', 'Inside parcel (m²)', 'Assessment'].map(h => <th key={h} className="border-b border-zinc-700 p-2 text-left">{h}</th>)}</tr></thead><tbody>{result.records.map((row, i) => <tr key={row.id}><td className="p-2">{i + 1}</td><td className="p-2">{result.encumbrances[i].type}</td><td className="p-2">{result.encumbrances[i].referenceNumber || 'Unknown'}</td><td className="p-2">{result.encumbrances[i].registeredDate || 'Unknown'}</td><td className="p-2">{displayArea(row.footprintArea)}</td><td className="p-2">{displayArea(row.withinParcelArea)}</td><td className="p-2">{row.issue || 'Geometry assessed; source not verified'}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-3">{!!result.encumbrances.length && <button type="button" disabled={busy} onClick={() => void download('schedule')} className="min-h-11 rounded border border-zinc-700 px-4">Download records CSV</button>}{snapshot?.parcel && result.records.some(r => r.withinParcelArea != null) && <><button type="button" disabled={busy} onClick={() => void download('geometry')} className="min-h-11 rounded border border-zinc-700 px-4">Download geometry CSV</button><button type="button" disabled={busy} onClick={() => void download('dxf')} className="min-h-11 rounded border border-zinc-700 px-4">Download coverage DXF</button></>}</div>
    </section>}
  </div>
}
