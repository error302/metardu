'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { z } from 'zod'
import { readProjectDrawingSource } from '@/lib/topo/drawingSource'
import { buildSurfaceRevisionDrawing } from '@/lib/topo/surfaceDrawing'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { sha256Hex } from '@/lib/crypto/sha256'
import { surfaceRequestSchema, surfaceExportRequestSchema, surfaceRequestPayload, surfaceExportPayload, surfaceReviewValue, terrainDomainSchema, surfaceBreakline } from '@/lib/topo/surfaceRequest'
import { preparePending, readPending, acknowledgePending, type PendingSurfaceRequest } from '@/lib/topo/surfacePending'
import { emptyTerrainDefinition, readTerrainDefinition } from '@/lib/topo/terrainDefinitionDraft'
import { TerrainDefinitionEditor } from '@/components/topo/TerrainDefinitionEditor'

const Canvas = dynamic(() => import('@/components/drawing/TopoEntityCanvas').then(module => module.TopoEntityCanvas), { ssr: false })
const historySchema = z.object({ data: z.object({ revisions: z.array(z.object({ revision_id: z.string().guid(), name: z.string(), revision: z.number().int().positive() })), historyLimited: z.boolean() }) })
const savedSchema = z.object({ data: z.object({ projectId: z.string().guid(), revisionId: z.string().guid(), revision: z.number().int().positive(), name: z.string(), crs: z.string(), verticalDatum: z.string(), inputHash: z.string(), fieldVerified: z.literal(false),
  contours: z.array(z.object({ elevation: z.number().finite(), isIndex: z.boolean(), coordinates: z.array(z.array(z.tuple([z.number().finite(), z.number().finite()]))) })),
  snapshot: z.object({ observations: z.array(z.object({ id: z.string().guid(), pointName: z.string().nullable(), x: z.number().finite(), y: z.number().finite(), z: z.number().finite(), code: z.string().nullable() })),
    terrainDomain: terrainDomainSchema.nullable().optional(), breaklines: z.array(surfaceBreakline).optional() }),
  domain: z.object({ area:z.number().finite().positive(),derivedVertexCount:z.number().int().nonnegative(),supportCounts:z.object({inside:z.number().int().nonnegative(),outside:z.number().int().nonnegative(),exclusion:z.number().int().nonnegative()}) }).nullable().optional(),
}) })
type Source = ReturnType<typeof readProjectDrawingSource>
type Saved = z.infer<typeof savedSchema>['data']
async function read(response: Response): Promise<unknown> {
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Request failed. Reload and try again.')
  return value
}

export default function TopoPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session, status } = useSession()
  if (status === 'loading') return <p role="status">Loading your project…</p>
  if (!session?.user?.id) return <p>Sign in to review saved project surfaces.</p>
  return <SurfaceWorkspace key={`${session.user.id}:${id}`} projectId={id} ownerId={session.user.id} />
}

function SurfaceWorkspace({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const [source, setSource] = useState<Source | null>(null)
  const [sourceError, setSourceError] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reviewed, setReviewed] = useState(false)
  const [terrainDraft,setTerrainDraft] = useState(emptyTerrainDefinition)
  const [name, setName] = useState('Existing ground')
  const [interval, setInterval] = useState(1)
  const [spacing, setSpacing] = useState(1)
  const [history, setHistory] = useState<z.infer<typeof historySchema>['data']>({ revisions: [], historyLimited: false })
  const [saved, setSaved] = useState<Saved | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [receipt, setReceipt] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [pending, setPending] = useState<PendingSurfaceRequest | null>(null)
  const [deviceError, setDeviceError] = useState('')
  const operation = useRef(0)
  const definition = useMemo(() => {
    if(!source)return {data:{},issue:null}
    try { return {data:readTerrainDefinition(terrainDraft,{horizontalCrs:source.reference.code??'',referenceHash:source.referenceHash,points:source.points,selectedIds:selected}),issue:null} }
    catch(failure) { return {data:{},issue:failure instanceof Error?failure.message:'Review the terrain definitions.'} }
  },[source,terrainDraft,selected])
  useEffect(() => {
    const sync = () => {
      try { setPending(readPending(ownerId, projectId)); setDeviceError('') }
      catch (failure) { setDeviceError(failure instanceof Error ? failure.message : 'Device recovery storage is unavailable.') }
    }
    sync(); window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [ownerId, projectId])
  useEffect(() => {
    const abort = new AbortController(), options = { cache: 'no-store' as const, signal: abort.signal }
    const ticket = ++operation.current
    setBusy(true); setSource(null); setSaved(null); setHistory({ revisions: [], historyLimited: false }); setReviewed(false); setError(''); setSourceError(''); setReceipt(''); setDownloadUrl('')
    setTerrainDraft(current=>({...current,reviewed:false}))
    void Promise.allSettled([
      Promise.all([fetch(`/api/project/${projectId}/points?includeIncomplete=true`, options).then(read), fetch(`/api/project/${projectId}/point-imports`, options).then(read)])
        .then(([points, context]) => readProjectDrawingSource(projectId, points, context)),
      fetch(`/api/project/${projectId}/surfaces`, options).then(read).then(value => historySchema.parse(value).data),
    ]).then(([points, revisions]) => {
      if (abort.signal.aborted || operation.current !== ticket) return
      if (points.status === 'fulfilled') { setSource(points.value); setSelected(new Set(points.value.points.filter(point => point.elevation !== undefined).map(point => point.id))) }
      else setSourceError(points.reason instanceof Error ? points.reason.message : 'Project observations could not be loaded.')
      if (revisions.status === 'fulfilled') setHistory(revisions.value)
      else setError(revisions.reason instanceof Error ? revisions.reason.message : 'Saved revisions could not be loaded.')
      setBusy(false)
    })
    // This ref is a request generation counter, not a rendered DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { abort.abort(); operation.current++ }
  }, [projectId, reload])

  async function loadRevision(revisionId: string, ticket: number) {
    const value = savedSchema.parse(await read(await fetch(`/api/project/${projectId}/surfaces?contourRevision=${encodeURIComponent(revisionId)}`, { cache: 'no-store' }))).data
    if (value.projectId !== projectId || value.revisionId !== revisionId) throw new Error('The saved record does not match the selected project and revision.')
    if (operation.current === ticket) {
      setSaved(value); setReceipt(''); setDownloadUrl('')
      setHistory(current => current.revisions.some(revision => revision.revision_id === value.revisionId) ? current : {
        revisions: [{ revision_id: value.revisionId, name: value.name, revision: value.revision }, ...current.revisions].slice(0, 200),
        historyLimited: current.historyLimited || current.revisions.length >= 200,
      })
    }
  }
  async function choose(revisionId: string) {
    const ticket = ++operation.current
    setSaved(null); setError(''); setReceipt('')
    if (!revisionId) return
    setBusy(true)
    try { await loadRevision(revisionId, ticket) } catch (failure) { if (operation.current === ticket) setError(failure instanceof Error ? failure.message : 'Revision could not be loaded.') }
    finally { if (operation.current === ticket) setBusy(false) }
  }
  async function sendPending(command: PendingSurfaceRequest, ticket: number, lookupOnly = false) {
    const expectedHash = await sha256Hex(canonicalJson(command.kind === 'surface' ? surfaceRequestPayload(command.body) : surfaceExportPayload(command.body)))
    if (operation.current !== ticket) return
    const path = command.kind === 'surface' ? `/api/project/${projectId}/surfaces` : '/api/topo/export/dxf'
    const query = command.kind === 'surface' ? new URLSearchParams({ requestId: command.body.requestId, requestHash: expectedHash })
      : new URLSearchParams({ ...command.body })
    const response = await fetch(lookupOnly ? `${path}?${query}` : path, lookupOnly ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command.body) })
    if (!response.ok) {
      const value: unknown = await response.json()
      const rejection = z.object({ details: z.object({ requestOutcome: z.literal('rejected'), requestId: z.string(), payloadHash: z.string() }) }).safeParse(value)
      if (!lookupOnly && rejection.success && rejection.data.details.requestId === command.body.requestId && rejection.data.details.payloadHash === expectedHash) {
        await acknowledgePending(command)
        if (operation.current === ticket) { setPending(readPending(ownerId, projectId)); setReviewed(false) }
      }
      throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'The request was not acknowledged. Recover the retained device request before starting another.')
    }
    if (command.kind === 'surface') {
      const ack = z.object({ data: z.object({ revisionId: z.string().guid(), requestId: z.string(), requestHash: z.string() }) }).parse(await response.json()).data
      if (ack.requestId !== command.body.requestId || ack.requestHash !== expectedHash) throw new Error('The saved acknowledgement does not match this device request.')
      await loadRevision(ack.revisionId, ticket)
    } else {
      if (response.headers.get('X-Metardu-Request') !== command.body.requestId || response.headers.get('X-Metardu-Request-Hash') !== expectedHash
        || response.headers.get('X-Metardu-Surface-Revision') !== command.body.surfaceRevisionId || !response.headers.get('X-Metardu-Deliverable')) throw new Error('The export acknowledgement does not match this device request.')
      const blob = await response.blob()
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
      const contentHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (contentHash !== response.headers.get('X-Metardu-Content-SHA256')) throw new Error('The downloaded bytes do not match the registered file hash.')
      if (operation.current !== ticket) return
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'retained-surface.dxf'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      const retainedUrl = response.headers.get('X-Metardu-Download') ?? ''
      if (retainedUrl.startsWith('/api/storage?path=')) setDownloadUrl(retainedUrl)
      setReceipt(`Draft DXF retained in the document register, revision ${response.headers.get('X-Metardu-Deliverable-Revision')}. Download requested.`)
    }
    await acknowledgePending(command)
    if (operation.current === ticket) { setPending(readPending(ownerId, projectId)); setReviewed(false) }
  }
  async function recover(lookupOnly: boolean) {
    if (!pending || busy) return
    const ticket = ++operation.current
    setBusy(true); setError('')
    try { await sendPending(pending, ticket, lookupOnly) }
    catch (failure) { if (operation.current === ticket) setError(failure instanceof Error ? failure.message : 'The original request remains retained for recovery.') }
    finally { if (operation.current === ticket) setBusy(false) }
  }
  async function compute() {
    if (!source || !reviewed || selected.size < 3 || busy || pending || deviceError || definition.issue) return
    const ticket = ++operation.current
    setBusy(true); setSaved(null); setError(''); setReceipt('')
    try {
      const expectedSourceHash = await sha256Hex(canonicalJson(surfaceReviewValue(source.referenceHash, source.points.filter(point => selected.has(point.id)).map(point => ({ id: point.id,
        pointName: point.pointNumber ?? null, x: point.easting, y: point.northing, z: point.elevation as number, code: point.code,
        horizontalCrs: source.reference.code as string, verticalDatum: source.reference.verticalDatum as string })))))
      if (operation.current !== ticket) return
      const command = await preparePending(ownerId, projectId, 'surface', surfaceRequestSchema.parse({ requestId: crypto.randomUUID(), expectedUserId: ownerId, name, interval, resolution: spacing,
        pointIds: [...selected], expectedReferenceHash: source.referenceHash, expectedSourceHash, useStoredBreaklines: false, ...definition.data }))
      if (operation.current !== ticket) return
      setPending(command)
      await sendPending(command, ticket)
      const inventory = historySchema.parse(await read(await fetch(`/api/project/${projectId}/surfaces`, { cache: 'no-store' }))).data
      if (operation.current === ticket) setHistory(inventory)
    } catch (failure) { if (operation.current === ticket) { setReviewed(false); setError(`${failure instanceof Error ? failure.message : 'The computation was not acknowledged.'} Use request recovery before starting another computation.`) } }
    finally { if (operation.current === ticket) setBusy(false) }
  }
  async function exportDxf() {
    if (!saved || busy || pending || deviceError) return
    const ticket = ++operation.current, revisionId = saved.revisionId
    setBusy(true); setError(''); setReceipt('')
    try {
      const command = await preparePending(ownerId, projectId, 'dxf', surfaceExportRequestSchema.parse({ projectId, surfaceRevisionId: revisionId, expectedUserId: ownerId, requestId: crypto.randomUUID() }))
      if (operation.current !== ticket) return
      setPending(command)
      await sendPending(command, ticket)
    } catch (failure) { if (operation.current === ticket) setError(failure instanceof Error ? failure.message : 'Export failed. No download was acknowledged.') }
    finally { if (operation.current === ticket) setBusy(false) }
  }
  const preview = useMemo(() => saved ? buildSurfaceRevisionDrawing(saved) : null, [saved])

  return <main className="space-y-6 p-4 max-w-6xl mx-auto">
    <div className="flex justify-between flex-wrap gap-3"><div><h1 className="text-xl font-semibold">Saved terrain surfaces</h1><p className="text-sm text-[var(--text-muted)]">Review the ground observations, then compute an immutable draft revision.</p></div><Link href={`/project/${projectId}`}>Back to project</Link></div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {deviceError && <p role="alert">{deviceError}</p>}
    {pending && <section aria-label="Pending request recovery" className="border rounded p-4 space-y-2"><h2 className="font-semibold">Request awaiting confirmation</h2>
      <p className="break-all">{pending.kind === 'surface' ? 'Surface computation' : 'Draft DXF'} · {pending.body.requestId}</p>
      <p>Retained on this device for this account and project. Checking reads saved work; retrying sends the same original request and reuses any committed result.</p>
      <div className="flex gap-3 flex-wrap"><button disabled={busy} className="border rounded p-2" onClick={() => void recover(true)}>Check saved result</button><button disabled={busy} className="border rounded p-2" onClick={() => void recover(false)}>Retry original request</button></div></section>}
    <button disabled={busy} onClick={() => setReload(value => value + 1)} className="border rounded px-3 py-2">Reload observations and saved revisions</button>
    <section className="space-y-3"><h2 className="font-semibold">Ground source review</h2>
      {sourceError && <p role="alert">{sourceError}</p>}
      {source && <><p>{source.reference.code} · Height reference: {source.reference.verticalDatum} · metres</p>
        <p className="text-sm">Select measured ground observations. Unknown heights stay visible and cannot enter this surface. Without an explicit boundary, the surface uses the observation hull. Added boundary heights are derived from the retained TIN, never recorded as new measurements.</p>
        <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Select</th><th>Point</th><th>Easting</th><th>Northing</th><th>Height</th><th>Code</th></tr></thead><tbody>{source.points.map(point => <tr key={point.id}>
          <td><input type="checkbox" aria-label={`Ground point ${point.pointNumber}`} disabled={busy || point.elevation === undefined} checked={selected.has(point.id)} onChange={event => { setReviewed(false); setTerrainDraft(current=>({...current,reviewed:false})); setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(point.id); else next.delete(point.id); return next }) }} /></td>
          <td>{point.pointNumber}</td><td>{point.easting}</td><td>{point.northing}</td><td>{point.elevation ?? 'Unknown'}</td><td>{point.code}</td></tr>)}</tbody></table></div>
        <label className="flex gap-2"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />I reviewed these {selected.size} observations as the ground source for this draft.</label>
        <TerrainDefinitionEditor value={terrainDraft} points={source.points} selectedIds={selected} disabled={busy||!!pending} issue={definition.issue} onChange={value=>{
          setTerrainDraft({...value,referenceHash:value.referenceHash||source.referenceHash,horizontalCrs:value.horizontalCrs||source.reference.code||''})
          if(!value.reviewed)setReviewed(false)
        }}/></>}
      <div className="flex flex-wrap gap-4 items-end">
        <label>Surface name<input className="block border rounded p-2 bg-transparent" value={name} maxLength={150} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <label>Contour interval (m)<select className="block border rounded p-2 bg-[var(--bg-secondary)]" value={interval} disabled={busy} onChange={event => setInterval(Number(event.target.value))}>{[0.25, 0.5, 1, 2, 5, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Maximum vertex spacing (m)<select className="block border rounded p-2 bg-[var(--bg-secondary)]" value={spacing} disabled={busy} onChange={event => setSpacing(Number(event.target.value))}>{[0.5, 1, 2, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <button className="border rounded p-2 disabled:opacity-50" disabled={busy || !!pending || !!deviceError || !!definition.issue || !source || !reviewed || selected.size < 3 || !name.trim()} onClick={() => void compute()}>Compute new draft revision</button>
      </div>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Saved revision review</h2>
      <label>Choose an exact saved revision<select aria-label="Saved revision" className="block border rounded p-2 max-w-full bg-[var(--bg-secondary)]" value={saved?.revisionId ?? ''} disabled={busy} onChange={event => void choose(event.target.value)}><option value="">Select a revision</option>{history.revisions.map(revision => <option key={revision.revision_id} value={revision.revision_id}>{revision.name} R{revision.revision} · {revision.revision_id}</option>)}</select></label>
      {history.historyLimited && <p>Showing the latest 200 saved revisions. Older records remain retained.</p>}
      {busy && <p role="status">Working… wait for the saved-record acknowledgement.</p>}
      {saved && preview && <><p>{saved.name} R{saved.revision} · {saved.snapshot.observations.length} retained observations · {saved.contours.length} contour levels</p><p>{saved.crs} · {saved.verticalDatum} · metres</p><p className="text-sm break-all">Input SHA-256: {saved.inputHash}</p><p className="text-sm">Computed draft. Professional review, receiving-CAD checks and field acceptance remain required.</p><Canvas {...preview} /><button className="border rounded p-2" disabled={busy || !!pending || !!deviceError} onClick={() => void exportDxf()}>Export registered draft DXF (Pro)</button></>}
      {saved?.domain&&<p className="text-sm">Reviewed footprint: {saved.domain.area.toFixed(3)} m² · {saved.domain.derivedVertexCount} derived clip vertices. Original support observations: {saved.domain.supportCounts.inside} inside, {saved.domain.supportCounts.outside} outside, {saved.domain.supportCounts.exclusion} inside exclusions.</p>}
      {receipt && <p role="status">{receipt}</p>}
      {downloadUrl && <a href={downloadUrl} className="underline">Download the retained file again</a>}
    </section>
  </main>
}
