'use client'
import {useEffect,useId,useRef,useState} from 'react'
import Link from 'next/link'
import {z} from 'zod'
const inventory=z.object({data:z.object({projectId:z.string().guid(),viewerId:z.string().min(1),limited:z.boolean(),revisions:z.array(z.object({
  revision_id:z.string().guid(),name:z.string(),revision:z.number().int().positive(),crs:z.string().nullable(),point_count:z.number().int().nonnegative().nullable(),triangle_count:z.number().int().nonnegative().nullable(),
}))})})
type Revision=z.infer<typeof inventory>['data']['revisions'][number]
async function failure(response:Response){
  try{const body:unknown=await response.json();if(body&&typeof body==='object'&&'error'in body&&typeof body.error==='string')return body.error}catch{/* HTTP status remains authoritative. */}
  return `Saved surface request failed (HTTP ${response.status}).`
}
export function CivilSurfaceDownload({projectId}:{projectId:string}){
  const id=useId(),[revisions,setRevisions]=useState<Revision[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[limited,setLimited]=useState(false)
  const [attempt,setAttempt]=useState(0)
  const [manual,setManual]=useState('')
  const [inventoryLoaded,setInventoryLoaded]=useState(false)
  const mounted=useRef(false),downloadRequest=useRef<AbortController|null>(null)
  useEffect(()=>{
    let active=true
    mounted.current=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
    downloadRequest.current?.abort();downloadRequest.current=null
    setLoading(true);setInventoryLoaded(false);setBusy(false);setMessage('');setLimited(false);setError('');setSelected('');setManual('');setRevisions([])
    void fetch(`/api/project/${encodeURIComponent(projectId)}/civil-surface-export`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error(await failure(response))
      const value=inventory.parse(await response.json()).data
      if(value.projectId!==projectId)throw new Error('Saved surface inventory belongs to a different project.')
      if(active&&!controller.signal.aborted){setRevisions(value.revisions);setLimited(value.limited);setInventoryLoaded(true)}
    }).catch(err=>{if(active)setError(controller.signal.aborted?'Loading saved revisions timed out. Reload the revision list to retry.':err instanceof Error?err.message:'Saved revisions could not be loaded.')})
      .finally(()=>{clearTimeout(timer);if(active)setLoading(false)})
    return()=>{active=false;mounted.current=false;clearTimeout(timer);controller.abort();downloadRequest.current?.abort();downloadRequest.current=null}
  },[projectId,attempt])
  const download=async()=>{
    if(busy)return
    const revisionId=selected||manual.trim()
    if(!z.string().guid().safeParse(revisionId).success){setError('Choose a saved revision or enter its complete revision ID.');return}
    const controller=new AbortController();downloadRequest.current=controller
    const isCurrent=()=>mounted.current&&downloadRequest.current===controller
    const timer=setTimeout(()=>controller.abort(),30000);setBusy(true);setError('');setMessage('')
    try{
      const response=await fetch(`/api/project/${encodeURIComponent(projectId)}/civil-surface-export?revisionId=${encodeURIComponent(revisionId)}`,{cache:'no-store',signal:controller.signal})
      if(!response.ok)throw new Error(await failure(response))
      if(!response.headers.get('content-type')?.includes('application/xml'))throw new Error('The server did not return a LandXML artifact. No file was downloaded.')
      const blob=await response.blob()
      if(!isCurrent()||controller.signal.aborted)return
      const url=URL.createObjectURL(blob),link=document.createElement('a')
      link.href=url;link.download=`surface-${revisionId}.xml`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage('Retained surface revision downloaded as a computed draft. Check it in the receiving application before design use.')
    }catch(err){if(isCurrent())setError(controller.signal.aborted?'The saved revision download timed out. Your selection is retained; retry when the service is available.':err instanceof Error?err.message:'The surface download was not confirmed.')}
    finally{clearTimeout(timer);if(isCurrent()){setBusy(false);downloadRequest.current=null}}
  }
  return <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-3" aria-label="Retained surface handoff">
    <h2 className="text-sm font-semibold">Saved surface revision</h2>
    <p className="text-sm text-[var(--text-secondary)]">Export the retained TIN vertices and faces in that revision’s original grid and height reference. Point filters and today’s survey table do not change this mesh.</p>
    {loading?<p role="status">Loading saved revisions…</p>:inventoryLoaded?<>
      <label htmlFor={id} className="block text-sm">Surface revision</label>
      <select id={id} className="input w-full" value={selected} onChange={event=>{setSelected(event.target.value);setManual('');setError('');setMessage('')}} disabled={busy}>
        <option value="">Choose a saved revision</option>
        {revisions.map(row=><option key={row.revision_id} value={row.revision_id}>{row.name} · R{row.revision} · {row.crs??'reference needs review'} · {row.triangle_count??'unknown'} faces</option>)}
      </select>
      {!revisions.length&&<p>No saved surface revisions were found. <Link href={`/project/${projectId}/topo`} className="underline">Review observations and compute a surface</Link>.</p>}
      {limited&&<><p className="text-sm">Showing the latest 200 revisions. An older retained revision can be retrieved by its exact ID.</p>
        <label htmlFor={`${id}-older`} className="block text-sm">Older revision ID</label><input id={`${id}-older`} className="input w-full" value={manual} disabled={busy} onChange={event=>{setManual(event.target.value);setSelected('');setError('');setMessage('')}}/></>}
    </>:null}
    {error&&<p role="alert" className="rounded-lg border border-red-400 bg-red-950 p-3 text-sm text-red-100">{error}</p>}
    {error&&<button type="button" className="underline text-sm" disabled={loading||busy} onClick={()=>setAttempt(value=>value+1)}>Reload revision list</button>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    <button type="button" className="btn btn-primary" disabled={loading||busy||!selected&&!manual.trim()} onClick={()=>void download()}>{busy?'Preparing saved revision…':'Download retained TIN (LandXML)'}</button>
    <p className="text-xs text-[var(--text-muted)]">Computed draft. Field verification, receiving-software acceptance and professional approval remain required. Legacy or inconsistent saved evidence is refused.</p>
  </section>
}
