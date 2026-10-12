'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RegistryProjectField, type RegistryProject } from '@/components/beacons/RegistryProjectField'
import type { ControlSourceType } from '@/lib/survey/fieldControlSources'
import type { FieldControlInput } from '@/lib/engine/fieldControlCheck'
interface Mark {id:string;name:string;easting:number;northing:number;elevation:number|null;horizontal_crs:string|null;vertical_datum:string|null;basisHash:string;issue:string|null}
interface Check {id:string;point_type:string;observed_at:string;source_snapshot:Record<string,unknown>;reference_snapshot:Record<string,unknown>;observation:FieldControlInput;result:{deltaE:number|null;deltaN:number|null;deltaH:number|null;horizontalDisplacement:number|null;status:string;horizontalPass:boolean|null;verticalPass:boolean|null}}
const numberInput=(value:string,label:string):number=>{if(!value.trim()||!Number.isFinite(Number(value)))throw new Error(`Enter a complete numeric ${label}`);return Number(value)}
const statusLabels:Record<string,string>={not_measured:'Visual inspection only',unsuitable_condition:'Condition prevents use',within_declared_tolerance:'Within declared comparison criteria',exceeds_declared_tolerance:'Exceeds declared comparison criteria'}
export default function ControlPointVerificationPage(){
 const [project,setProject]=useState<RegistryProject|null>(null),[pointType,setPointType]=useState<ControlSourceType>('survey_point')
 const [marks,setMarks]=useState<Mark[]>([]),[pointId,setPointId]=useState(''),[checks,setChecks]=useState<Check[]>([])
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null)
 const [method,setMethod]=useState(''),[condition,setCondition]=useState(''),[observedAt,setObservedAt]=useState(''),[instrument,setInstrument]=useState(''),[evidence,setEvidence]=useState(''),[notes,setNotes]=useState('')
 const [east,setEast]=useState(''),[north,setNorth]=useState(''),[height,setHeight]=useState(''),[hTolerance,setHTolerance]=useState(''),[vTolerance,setVTolerance]=useState(''),[criteria,setCriteria]=useState('')
 const [legacy,setLegacy]=useState<Record<string,unknown>[]|null>(null)
 const sequence=useRef(0),pending=useRef<{key:string;requestId:string}|null>(null)
 const mark=marks.find(row=>row.id===pointId),visual=method==='visual',level=method==='level'
 const load=useCallback(async()=>{
  const request=++sequence.current
  setMarks([]);setChecks([]);setPointId('');setError(null);setLoading(Boolean(project))
  if(!project)return
  try{
   const query=new URLSearchParams({projectId:project.id,pointType})
   const responses=await Promise.all([fetch(`/api/control-points/verifications?${query}&options=true`,{cache:'no-store'}),fetch(`/api/control-points/verifications?${query}`,{cache:'no-store'})])
   const payloads=await Promise.all(responses.map(response=>response.json())) as [{error?:string;data?:{marks:Mark[]}},{error?:string;data?:{checks:Check[]}}]
   if(responses.some(response=>!response.ok))throw new Error(payloads.find(payload=>payload.error)?.error??'Control evidence could not be loaded')
   if(request===sequence.current){setMarks(payloads[0].data?.marks??[]);setChecks(payloads[1].data?.checks??[])}
  }catch(cause){if(request===sequence.current)setError(cause instanceof Error?cause.message:'Loading failed')}
  finally{if(request===sequence.current)setLoading(false)}
 },[project,pointType])
 const cancelLoad=useCallback(()=>{sequence.current++},[])
 useEffect(()=>{void load();return cancelLoad},[load,cancelLoad])
 async function submit(event:React.FormEvent){
  event.preventDefault();setError(null);setNotice(null)
  if(!project||!mark||mark.issue)return
  const selectedProject=project.id
  try{
   const input={projectId:project.id,pointId:mark.id,pointType,basisHash:mark.basisHash,observedAt:new Date(observedAt).toISOString(),condition,method,instrument:visual?null:instrument.trim(),evidenceReference:evidence.trim(),notes:notes.trim(),
    measuredEasting:visual||level?null:numberInput(east,'easting'),measuredNorthing:visual||level?null:numberInput(north,'northing'),measuredElevation:visual||!height.trim()?null:numberInput(height,'height'),
    horizontalTolerance:visual||level?null:numberInput(hTolerance,'horizontal criterion'),verticalTolerance:visual||!height.trim()?null:numberInput(vTolerance,'vertical criterion'),toleranceReference:visual?null:criteria.trim()}
   const key=JSON.stringify(input)
   if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID()}
   setSaving(true)
   const response=await fetch('/api/control-points/verifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,requestId:pending.current.requestId})})
   const payload=await response.json() as {error?:string;data?:{id:string}}
   if(!response.ok)throw new Error(payload.error??'The field check was not saved. Keep the observations and retry.')
   setNotice(`Field check saved (${payload.data?.id}). Comparison does not certify or automatically approve control.`)
   pending.current=null
   if(project.id===selectedProject)await load()
  }catch(cause){setError(cause instanceof Error?cause.message:'Save failed; observations retained for retry')}
  finally{setSaving(false)}
 }
 async function loadLegacy(){try{const response=await fetch('/api/control-points/verifications?legacy=true',{cache:'no-store'});const payload=await response.json() as {error?:string;data:Record<string,unknown>[]};if(!response.ok)throw new Error(payload.error??'Historical records could not be loaded');setLegacy(payload.data)}catch(cause){setError(cause instanceof Error?cause.message:'Historical load failed')}}
 const inputClass='input w-full mt-1',field=(label:string,value:string,change:(value:string)=>void,type='text',required=true)=><label className="block text-sm">{label}<input className={inputClass} type={type} step={type==='number'?'any':undefined} value={value} onChange={event=>change(event.target.value)} required={required} disabled={saving}/></label>
 return <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
  <header><h1 className="text-2xl font-semibold">Field control checks</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">Record a physical inspection or measured comparison against a saved control basis. The declared criteria belong to this check; they do not establish statutory certification or statistical stability.</p></header>
  <section className="space-y-3"><RegistryProjectField value={project} disabled={saving} onChange={value=>{setProject(value);setNotice(null)}}/><label className="block text-sm">Register<select className={inputClass} value={pointType} disabled={saving} onChange={event=>setPointType(event.target.value as ControlSourceType)}><option value="survey_point">Project control marks</option><option value="beacon">Owned beacon register</option><option value="boundary_monument">Owned boundary monuments</option></select></label></section>
  {error&&<p role="alert" className="text-red-400">{error} <button type="button" className="underline" onClick={()=>void load()}>Reload saved basis</button></p>}
  {notice&&<p role="status" className="text-[var(--accent)]">{notice}</p>}
  {loading&&<p role="status">Loading project control and retained checks…</p>}
  {project&&!loading&&<form onSubmit={submit} className="border border-[var(--border-color)] rounded-xl p-4 sm:p-6 space-y-4">
   <label className="block text-sm">Saved control basis<select className={inputClass} value={pointId} disabled={saving} onChange={event=>setPointId(event.target.value)} required><option value="">Choose a saved mark</option>{marks.map(row=><option key={row.id} value={row.id} disabled={Boolean(row.issue)}>{row.name}{row.issue?` — ${row.issue}`:''}</option>)}</select></label>
   {!marks.length&&<p className="text-sm">No current marks in this register. <Link href={`/project/${project.id}/control`} className="underline">Open project control</Link>. Legacy reference defaults must be declared before comparison.</p>}
   {mark&&<p className="text-sm font-mono">Saved E {mark.easting} m · N {mark.northing} m · H {mark.elevation??'unknown'} {mark.elevation===null?'':'m'} · {mark.horizontal_crs} · height datum {mark.vertical_datum??'not declared'}</p>}
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm">Check method<select required className={inputClass} value={method} disabled={saving} onChange={event=>setMethod(event.target.value)}><option value="">Choose the method used</option><option value="visual">Visual inspection</option><option value="total_station">Total station</option><option value="gnss_static">GNSS static</option><option value="gnss_rtk">GNSS RTK</option><option value="level">Levelling (height only)</option></select></label>
    <label className="text-sm">Observed condition<select required className={inputClass} value={condition} disabled={saving} onChange={event=>setCondition(event.target.value)}><option value="">Choose observed condition</option>{['good','fair','poor','disturbed','destroyed','missing'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    {field('Observation time (local)',observedAt,setObservedAt,'datetime-local')}
    {field('Field record / evidence reference',evidence,setEvidence)}
    {method&&!visual&&<>{field('Instrument identification',instrument,setInstrument)}{field('Criterion source / job specification',criteria,setCriteria)}{!level&&<>{field('Observed easting (m)',east,setEast,'number')}{field('Observed northing (m)',north,setNorth,'number')}{field('Horizontal comparison criterion (m)',hTolerance,setHTolerance,'number')}</>}{field('Observed height (m)',height,setHeight,'number',level)}{height.trim()&&field('Vertical comparison criterion (m)',vTolerance,setVTolerance,'number')}</>}
   </div>
   {field('Condition and observation notes',notes,setNotes,'text',false)}
   <button type="submit" disabled={saving||!mark||Boolean(mark.issue)} className="btn-primary w-full sm:w-auto">{saving?'Saving field evidence…':'Save field check'}</button>
  </form>}
  {project&&<section className="space-y-3"><h2 className="text-lg font-semibold">Retained project checks</h2>{!loading&&!checks.length&&<p>No checks recorded for this project.</p>}{checks.map(check=><article key={check.id} className="border border-[var(--border-color)] rounded-xl p-4 space-y-2"><h3 className="font-semibold">{String(check.source_snapshot.point_name??check.source_snapshot.beacon_number??check.source_snapshot.monument_number)} · {statusLabels[check.result.status]}</h3><p className="text-sm">{new Date(check.observed_at).toLocaleString()} · {check.observation.method} · {check.observation.condition}</p><p className="font-mono text-sm">{check.result.horizontalDisplacement!==null&&<>Horizontal difference: {(check.result.horizontalDisplacement*1000).toFixed(3)} mm (criterion {check.observation.horizontalTolerance} m). </>}{check.result.deltaH!==null&&<>Height difference: {(check.result.deltaH*1000).toFixed(3)} mm (criterion {check.observation.verticalTolerance} m).</>}</p><p className="text-sm">Field record: {check.observation.evidenceReference}{check.observation.toleranceReference&&` · Criteria: ${check.observation.toleranceReference}`}</p><details><summary className="cursor-pointer text-sm">Retained basis and observation evidence</summary><pre className="overflow-x-auto text-xs p-3 whitespace-pre-wrap break-words">{JSON.stringify({basis:check.source_snapshot,reference:check.reference_snapshot,observation:check.observation,result:check.result},null,2)}</pre></details></article>)}</section>}
  <section className="space-y-2"><button type="button" className="underline text-sm" onClick={()=>void loadLegacy()}>View my historical verification records</button>{legacy&&<><p className="text-sm">Historical records lack retained basis and comparison-criterion evidence. Previous pass labels are not an evidenced project verification.</p>{!legacy.length&&<p>No historical records.</p>}{legacy.map(row=><p key={String(row.id)} className="text-sm">{String(row.point_name??row.point_id)} · {String(row.verification_date)} · condition {String(row.condition)} · legacy evidence</p>)}</>}</section>
 </main>
}
