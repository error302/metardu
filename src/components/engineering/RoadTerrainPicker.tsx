'use client'
import {useEffect,useState} from 'react'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {roadTerrainListSchema,roadTerrainReplySchema,type RoadTerrainData,type RoadTerrainScope} from '@/lib/engineering/roadTerrain'
type Revision=import('zod').infer<typeof import('@/lib/engineering/roadTerrain').roadTerrainRevisionSchema>
const describe=(cause:unknown)=>cause instanceof Error&&cause.name!=='ZodError'?cause.message:'The terrain response could not be verified. Keep the road draft and retry the exact selection.'
export default function RoadTerrainPicker({scope,value,onChange,onLoaded,disabled}:{scope:RoadTerrainScope;value:string;onChange:(value:string)=>void;onLoaded:(data:RoadTerrainData|undefined)=>void;disabled:boolean}){
  const [revisions,setRevisions]=useState<Revision[]>([]),[listing,setListing]=useState(true),[loading,setLoading]=useState(false),[error,setError]=useState(''),[limited,setLimited]=useState(false),[retry,setRetry]=useState(0)
  const key=canonicalJson(scope)
  useEffect(()=>{
    const controller=new AbortController()
    setListing(true);setError('');setRevisions([])
    void fetch(`/api/engineering/road-terrain?${new URLSearchParams(scope)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const input:unknown=await response.json()
      if(!response.ok)throw Error('Saved terrain revisions could not be read. Keep the road draft and review its saved source before retrying.')
      const data=roadTerrainListSchema.parse(input)
      if(canonicalJson(data.scope)!==key)throw Error('The terrain list did not match the original account and road source.')
      if(!controller.signal.aborted){setRevisions(data.revisions);setLimited(data.limited)}
    }).catch((cause:unknown)=>{if(!controller.signal.aborted)setError(describe(cause))}).finally(()=>{if(!controller.signal.aborted)setListing(false)})
    return()=>controller.abort()
  },[key,scope,retry])
  useEffect(()=>{
    const controller=new AbortController()
    onLoaded(undefined);setLoading(!!value);setError('')
    if(!value)return()=>controller.abort()
    void fetch(`/api/engineering/road-terrain?${new URLSearchParams({...scope,revisionId:value})}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const input:unknown=await response.json()
      if(!response.ok)throw Error('The exact terrain revision is unavailable or its reference changed. No previous terrain is shown as the current selection.')
      const data=roadTerrainReplySchema.parse(input)
      if(canonicalJson(data.scope)!==key||data.terrain.identity.projectId!==scope.projectId||data.terrain.identity.revisionId!==value)throw Error('Terrain response did not match the selected source.')
      if(!controller.signal.aborted)onLoaded(data.terrain)
    }).catch((cause:unknown)=>{if(!controller.signal.aborted)setError(describe(cause))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[key,scope,value,onLoaded,retry])
  return <section aria-label="Retained terrain selection" className="mt-4 min-w-0 space-y-2 border-t border-[var(--border-color)] pt-4">
    <label className="block min-w-0 text-xs">Retained terrain revision
      <select aria-label="Retained terrain revision" className="mt-1 min-h-11 w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 text-sm" value={value} disabled={disabled||listing} onChange={e=>onChange(e.target.value)}>
        <option value="">Measured sections only</option>
        {value&&!revisions.some(r=>r.revisionId===value)&&<option value={value}>Retained selection · {value.slice(0,8)}</option>}
        {revisions.map(r=><option key={r.revisionId} value={r.revisionId}>{r.name} · R{r.revision} · {r.triangleCount} faces</option>)}
      </select>
    </label>
    <p role="status" className="text-xs text-[var(--text-secondary)]">{listing?'Reading saved surface revisions…':loading?'Validating the exact retained terrain…':value?'Terrain sections are computed previews; original measured stations remain saved.':revisions.length?'Select a saved revision for computed terrain review.':'No saved surface revisions. Review observations and compute a surface in the project survey map.'}</p>
    {limited&&<p className="text-xs">Showing 200 revisions. Retain the exact selected revision ID for older work.</p>}
    {error&&<><p role="alert" className="break-words border-l-2 border-amber-500 pl-2 text-xs">{error}</p><button type="button" className="min-h-11 rounded border border-[var(--border-color)] px-3 text-xs" disabled={listing||loading||disabled} onClick={()=>setRetry(n=>n+1)}>Retry terrain read</button></>}
  </section>
}
