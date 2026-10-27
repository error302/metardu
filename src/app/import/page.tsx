'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {z} from 'zod'
import { createClient } from '@/lib/api-client/client'
import { importTotalStation } from '@/lib/import/totalStation/unifiedImport'
import type { TotalStationFormat } from '@/lib/import/totalStation/detectFormat'
import { MAX_POINT_IMPORT_BYTES, MAX_POINT_IMPORT_ROWS, preparePointImport, type PointImportRequest } from '@/lib/import/pointImport'
import { validatePointImportReceipt, type PointImportReceipt } from '@/lib/import/pointImportClient'
import { resolveDeclaredStageReference } from '@/lib/workspaces/stageReference'

interface Project { id:string; name:string }
interface Source { name:string; text:string; size:number; hash:string }
interface Capture { id:string; source_file_name:string; source_file_hash:string; point_count:number; created_at:string }
interface Context { projectId:string; referenceSystem:unknown; referenceHash:string; history:Capture[] }
interface Pending { projectId:string; projectName:string; body:PointImportRequest }
const formats:Record<TotalStationFormat,string>={unknown:'Detect from file',csv:'Coordinate CSV',gsi:'Leica GSI',jobxml:'Trimble JobXML',landxml:'LandXML',trimble_dc:'Trimble DC',carlson_rw5:'Carlson RW5 / RAW',topcon:'Topcon GTS',sokkia:'Sokkia SDR',south:'South coordinate export'}
const inputClass='mt-2 min-h-12 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-base text-[var(--text-primary)] disabled:opacity-60'
const buttonClass='inline-flex min-h-12 items-center justify-center rounded-md border border-[var(--border-color)] px-4 py-2 text-sm font-medium disabled:opacity-50'
const validNumber=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)
const complete=(point:{id:string;easting?:number;northing?:number;elevation?:number})=>validNumber(point.easting)&&validNumber(point.northing)&&(point.elevation===undefined||validNumber(point.elevation))&&!!point.id.trim()
const displayNumber=(value:number|undefined)=>value===undefined?'Unknown':Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:8}):'Invalid'
const units=[['metres','Metres'],['internationalFoot','International feet'],['USSurveyFoot','US survey feet']] as const
const contextSchema=z.object({data:z.object({referenceSystem:z.unknown().optional(),referenceHash:z.string().regex(/^[a-f0-9]{64}$/),history:z.array(z.object({id:z.string().guid(),source_file_name:z.string(),source_file_hash:z.string(),point_count:z.number().int().nonnegative(),created_at:z.string()}))})})
const responseError=(value:unknown,fallback:string)=>{const parsed=z.object({error:z.string()}).safeParse(value);return parsed.success?parsed.data.error:fallback}

export default function ImportPage() {
  const client=useMemo(()=>createClient(),[])
  const [projects,setProjects]=useState<Project[]>([]),[projectId,setProjectId]=useState('')
  const [projectError,setProjectError]=useState(''),[loadingProjects,setLoadingProjects]=useState(false),[moreProjects,setMoreProjects]=useState(false)
  const [context,setContext]=useState<Context|null>(null),[contextError,setContextError]=useState(''),[loadingContext,setLoadingContext]=useState(false)
  const [source,setSource]=useState<Source|null>(null),[reading,setReading]=useState(false),[fileError,setFileError]=useState('')
  const [format,setFormat]=useState<TotalStationFormat>('unknown'),[csvOrder,setCsvOrder]=useState<''|'EN'|'NE'>(''),[gsiFoot,setGsiFoot]=useState<''|'international'|'USSurveyFoot'>('')
  const [sourceCrs,setSourceCrs]=useState(''),[coordinateUnit,setCoordinateUnit]=useState<PointImportRequest['coordinateUnit']>('metres'),[heightUnit,setHeightUnit]=useState<PointImportRequest['heightUnit']>('metres')
  const [confirmTransformation,setConfirmTransformation]=useState(false),[confirmVerticalDatum,setConfirmVerticalDatum]=useState(false),[confirmWarnings,setConfirmWarnings]=useState(false)
  const [selected,setSelected]=useState<number[]>([]),[page,setPage]=useState(0)
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[submitError,setSubmitError]=useState(''),[receipt,setReceipt]=useState<(PointImportReceipt&{projectId:string;projectName:string})|null>(null)
  const fileGeneration=useRef(0),pendingRef=useRef<Pending|null>(null),sending=useRef(false)
  const locked=!!pending||!!receipt

  const loadProjects=useCallback(async(offset=0)=>{
    setLoadingProjects(true);setProjectError('')
    try {
      const session=await client.auth.getSession()
      if(session.error)throw new Error('Could not check your session. Please retry.')
      if(!session.data.session?.user)throw new Error('Sign in to choose a project and save an import.')
      const result=await client.from('projects').select('id,name').eq('user_id',session.data.session.user.id).order('created_at',{ascending:false}).range(offset,offset+49)
      if(result.error)throw new Error(result.error.message)
      const rows=(result.data??[]) as Project[]
      setProjects(previous=>offset?[...previous,...rows.filter(row=>!previous.some(item=>item.id===row.id))]:rows);setMoreProjects(rows.length===50)
    } catch(error) {setProjectError(error instanceof Error?error.message:'Could not load projects.')}
    finally {setLoadingProjects(false)}
  },[client])
  useEffect(()=>{void loadProjects()},[loadProjects])
  const readContext=useCallback(async(id:string,signal?:AbortSignal):Promise<Context>=>{
    const response=await fetch(`/api/project/${id}/point-imports`,{cache:'no-store',signal}),body:unknown=await response.json()
    const parsed=contextSchema.safeParse(body)
    if(!response.ok||!parsed.success)throw new Error(responseError(body,'Could not load the project reference.'))
    return {...parsed.data.data,referenceSystem:parsed.data.data.referenceSystem??null,projectId:id}
  },[])
  useEffect(()=>{
    setContext(null);setContextError('');setConfirmTransformation(false);setConfirmVerticalDatum(false);setConfirmWarnings(false)
    if(!projectId){setLoadingContext(false);return}
    const controller=new AbortController();setLoadingContext(true)
    void readContext(projectId,controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value)}).catch(error=>{
      if(!controller.signal.aborted)setContextError(error instanceof Error?error.message:'Could not load the project reference.')
    }).finally(()=>{if(!controller.signal.aborted)setLoadingContext(false)})
    return()=>controller.abort()
  },[projectId,readContext])
  const options=useMemo(()=>({...(format==='unknown'?{}:{format}),...(csvOrder?{csvOrder}:{}),...(gsiFoot?{gsiFootUnit:gsiFoot}:{})}),[format,csvOrder,gsiFoot])
  const parsed=useMemo(()=>{
    if(!source)return null
    try{return importTotalStation(source.text,source.name,options)}catch{return null}
  },[source,options])
  useEffect(()=>{
    setSelected(parsed?.rawPoints.flatMap((point,index)=>complete(point)?[index]:[])??[])
    setPage(0);setConfirmWarnings(false);setConfirmTransformation(false);setConfirmVerticalDatum(false)
  },[parsed])
  const reference=useMemo(()=>resolveDeclaredStageReference(context?.projectId===projectId?context.referenceSystem:null),[context,projectId])
  const draft=useMemo<PointImportRequest|null>(()=>source&&context?.projectId===projectId?{
    requestId:'00000000-0000-4000-8000-000000000000',fileName:source.name,sourceText:source.text,fileSize:source.size,sourceFileHash:source.hash,
    expectedReferenceHash:context.referenceHash,selectedIndices:selected,options,sourceCrs,
    coordinateUnit:parsed?.normalizedMetres?'file':coordinateUnit,heightUnit:parsed?.normalizedMetres?'file':heightUnit,
    confirmTransformation,confirmVerticalDatum,confirmWarnings,
  }:null,[source,context,projectId,selected,options,sourceCrs,coordinateUnit,heightUnit,parsed,confirmTransformation,confirmVerticalDatum,confirmWarnings])
  const preview=useMemo(()=>{
    if(!draft)return {error:'Choose a file and project to begin.',prepared:null}
    try{return {error:'',prepared:preparePointImport({...draft,confirmTransformation:true,confirmVerticalDatum:true,confirmWarnings:true},reference)}}
    catch(error){return {error:error instanceof Error?error.message:'Review the import settings.',prepared:null}}
  },[draft,reference])
  const validation=useMemo(()=>{
    if(!draft)return 'Choose a file and project to begin.'
    try{preparePointImport(draft,reference);return ''}catch(error){return error instanceof Error?error.message:'Review the import settings.'}
  },[draft,reference])
  async function readFile(file:File) {
    if(locked||reading)return
    const generation=++fileGeneration.current
    setReading(true);setFileError('');setSource(null);setSubmitError('')
    try {
      if(!file.size||file.size>MAX_POINT_IMPORT_BYTES)throw new Error('Choose a non-empty text export up to 2 MiB. Split larger jobs in the controller export; no records will be truncated.')
      const bytes=await file.arrayBuffer(),text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)
      if(text.includes('\u0000'))throw new Error('This is a binary file. Export UTF-8 CSV, GSI or XML from the controller software first.')
      const digest=await crypto.subtle.digest('SHA-256',bytes),hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
      if(generation===fileGeneration.current){setSource({name:file.name,text,size:bytes.byteLength,hash});setFormat('unknown');setCsvOrder('');setGsiFoot('')}
    } catch(error) {
      if(generation===fileGeneration.current)setFileError(error instanceof TypeError?'The file is not a UTF-8 text export. Re-export as UTF-8 CSV or XML.':error instanceof Error?error.message:'Could not read this file.')
    } finally {if(generation===fileGeneration.current)setReading(false)}
  }
  async function commit() {
    if(sending.current)return
    const capture=pendingRef.current??(draft&&!validation?{projectId,projectName:projects.find(project=>project.id===projectId)?.name??'Project',body:{...draft,requestId:crypto.randomUUID()}}:null)
    if(!capture)return
    sending.current=true;pendingRef.current=capture;setPending(capture);setBusy(true);setSubmitError('')
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000)
    try {
      const response=await fetch(`/api/project/${capture.projectId}/point-imports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(capture.body),signal:controller.signal}),body:unknown=await response.json()
      if(!response.ok) {
        if([400,401,403,404,409,413,429].includes(response.status)){pendingRef.current=null;setPending(null)}
        throw new Error(responseError(body,'The server could not confirm the import.'))
      }
      const parsedBody=z.object({data:z.unknown().optional()}).safeParse(body)
      const saved=validatePointImportReceipt(parsedBody.success?parsedBody.data.data:undefined,capture.body)
      setReceipt({...saved,projectId:capture.projectId,projectName:capture.projectName});pendingRef.current=null;setPending(null)
      void readContext(capture.projectId).then(setContext).catch(()=>setContextError('Saved successfully; recent capture history could not refresh. Reload before downloading.'))
    } catch(error) {setSubmitError(error instanceof Error&&error.name!=='AbortError'?error.message:'The connection timed out before a receipt arrived.')}
    finally {clearTimeout(timer);sending.current=false;setBusy(false)}
  }
  const total=parsed?.rawPoints.length??0,visible=parsed?.rawPoints.slice(page*100,page*100+100)??[]
  return <div className="mx-auto max-w-6xl px-4 py-8 pb-32 sm:px-6 sm:py-12">
    <header className="mb-8 border-b border-[var(--border-color)] pb-6">
      <Link href="/fieldbook" className="inline-flex min-h-11 items-center text-sm text-[var(--text-secondary)]">← Fieldbook</Link>
      <p className="mt-3 font-mono text-xs tracking-wider text-[var(--accent)]">FIELD DATA / COORDINATE IMPORT</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Bring your points into the project</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Review the file, declare its reference and save a traceable capture. Missing heights stay unknown. Existing points are never overwritten by this import.</p>
    </header>
    {receipt&&<section role="status" className="mb-6 rounded-lg border border-[var(--accent)] bg-[var(--bg-secondary)] p-5 sm:p-7">
      <p className="font-mono text-xs text-[var(--accent)]">DATABASE RECEIPT CONFIRMED</p><h2 className="mt-2 font-display text-2xl">{receipt.imported} points {receipt.replayed?'already saved':'saved'} to {receipt.projectName}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{receipt.replayed?'Your retry returned the original capture; no duplicate points were added.':'The original file, reference declaration and selected records were retained together.'} Imported data still needs survey QA before delivery.</p>
      <p className="mt-3 break-all font-mono text-xs">Capture {receipt.batchId}</p><div className="mt-5 flex flex-wrap gap-3"><Link className={buttonClass} href={`/project/${receipt.projectId}`}>Open project →</Link><button className={buttonClass} onClick={()=>{setReceipt(null);setSource(null);setSubmitError('');setFileError('')}}>Import another file</button></div>
    </section>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="source-heading" className="min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-6">
        <h2 id="source-heading" className="font-display text-xl">1. Source file</h2>
        <fieldset disabled={locked||reading} className="mt-5 min-w-0 space-y-5 disabled:opacity-70">
          <div onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files[0];if(file)void readFile(file)}} className="rounded-md border border-dashed border-[var(--border-color)] p-4">
            <label className="block text-sm font-medium" htmlFor="coordinate-file">Choose a controller text export</label><input id="coordinate-file" type="file" accept=".csv,.txt,.gsi,.gtl,.sdr,.dat,.dc,.rw5,.raw,.jxl,.xml,.job" className="mt-3 min-h-12 w-full min-w-0 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:px-3 file:py-3 file:text-[var(--bg-primary)]" onChange={event=>{const file=event.target.files?.[0];if(file)void readFile(file);event.target.value=''}}/>
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">Drop a UTF-8 file here, or browse. Up to 2 MiB / {MAX_POINT_IMPORT_ROWS.toLocaleString()} coordinate records. Binary JOB files need CSV or JobXML export first.</p>
          </div>
          {source&&<div><p className="break-all text-sm font-medium">{source.name} · {(source.size/1024).toFixed(1)} KiB</p><details className="mt-2 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer py-2">Source SHA-256</summary><p className="break-all font-mono">{source.hash}</p></details></div>}
          <label className="block text-sm">File format<select className={inputClass} value={format} onChange={event=>setFormat(event.target.value as TotalStationFormat)}>{Object.entries(formats).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          {parsed?.format==='csv'&&<label className="block text-sm">Unlabelled CSV column order<select className={inputClass} value={csvOrder} onChange={event=>setCsvOrder(event.target.value as typeof csvOrder)}><option value="">Read id, easting, northing headers</option><option value="EN">Point, Easting, Northing, Height, Code</option><option value="NE">Point, Northing, Easting, Height, Code</option></select><span className="mt-2 block text-xs text-[var(--text-secondary)]">Headers take precedence. Quoted descriptions are supported.</span></label>}
          {parsed?.format==='gsi'&&<label className="block text-sm">GSI feet definition<select className={inputClass} value={gsiFoot} onChange={event=>setGsiFoot(event.target.value as typeof gsiFoot)}><option value="">Not declared / metric file</option><option value="international">International foot</option><option value="USSurveyFoot">US survey foot</option></select></label>}
        </fieldset>
        {reading&&<p role="status" className="mt-4 text-sm">Reading and hashing the original file…</p>}{fileError&&<p role="alert" className="mt-4 text-sm text-[var(--error)]">{fileError}</p>}
        {source&&<p className="mt-4 text-xs text-[var(--text-secondary)]">Detected: {parsed?(formats[parsed.format as TotalStationFormat]??parsed.format):'Unable to parse'} · {total.toLocaleString()} coordinate records. Raw angle observations belong in the <Link href="/fieldbook" className="underline">fieldbook workflow</Link>.</p>}
      </section>
      <section aria-labelledby="reference-heading" className="min-w-0 rounded-lg border border-[var(--border-color)] p-5 sm:p-6">
        <h2 id="reference-heading" className="font-display text-xl">2. Project & reference</h2>
        <fieldset disabled={locked} className="mt-5 min-w-0 space-y-5 disabled:opacity-70">
          <label className="block text-sm">Destination project<select className={inputClass} value={projectId} onChange={event=>setProjectId(event.target.value)}><option value="">Choose a project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          {loadingProjects&&<p role="status" className="text-sm">Loading projects…</p>}
          {projectError&&<div role="alert" className="text-sm"><p>{projectError}</p><Link href="/login?next=%2Fimport" className="inline-flex min-h-11 items-center underline">Sign in</Link><button className={`${buttonClass} ml-3`} onClick={()=>void loadProjects()}>Retry projects</button></div>}
          {moreProjects&&<button disabled={loadingProjects} className={buttonClass} onClick={()=>void loadProjects(projects.length)}>Load more projects</button>}
          {!loadingProjects&&!projectError&&!projects.length&&<p className="text-sm">No projects yet. <Link href="/projects" className="underline">Create a project</Link> before importing.</p>}
          {loadingContext&&<p role="status" className="text-sm">Reading the saved project reference…</p>}
          {contextError&&<div role="alert" className="text-sm"><p>{contextError}</p><button className={`${buttonClass} mt-2`} onClick={()=>void readContext(projectId).then(value=>{setContext(value);setContextError('')}).catch((error:unknown)=>setContextError(error instanceof Error?error.message:'Project reference could not load.'))}>Reload project reference</button></div>}
          {context&&<div className="rounded-md bg-[var(--bg-secondary)] p-3 text-sm"><p className="font-medium">{reference.code??'Project reference not declared'}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{reference.name} · Height datum: {reference.verticalDatum??'not declared'}</p><Link href={`/project/${projectId}/control`} className="mt-2 inline-flex min-h-11 items-center text-xs underline">Review project reference →</Link></div>}
          <label className="block text-sm">Source horizontal CRS<input aria-label="Source horizontal CRS" aria-describedby="source-crs-help" className={inputClass} placeholder="For example EPSG:32737" value={sourceCrs} onChange={event=>{setSourceCrs(event.target.value);setConfirmTransformation(false)}} autoComplete="off" spellCheck={false}/><span id="source-crs-help" className="mt-2 block text-xs text-[var(--text-secondary)]">Read this from the export settings. The destination declaration does not establish the source CRS.</span></label>
          {parsed?.normalizedMetres?<p className="rounded-md bg-[var(--bg-secondary)] p-3 text-sm">Encoded file units are converted to metres by the parser. No second unit conversion is applied.</p>:<div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Horizontal units<select className={inputClass} value={coordinateUnit} onChange={event=>setCoordinateUnit(event.target.value as typeof coordinateUnit)}>{units.map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="degrees">Decimal degrees (longitude, latitude)</option></select></label><label className="block text-sm">Height units<select className={inputClass} value={heightUnit} onChange={event=>setHeightUnit(event.target.value as typeof heightUnit)}>{units.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div>}
          <label className="flex min-h-12 items-start gap-3 text-sm leading-5"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={confirmTransformation} onChange={event=>setConfirmTransformation(event.target.checked)}/><span>I approve the horizontal transformation from the declared source CRS to the project CRS, if they differ.</span></label>
          <label className="flex min-h-12 items-start gap-3 text-sm leading-5"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={confirmVerticalDatum} onChange={event=>setConfirmVerticalDatum(event.target.checked)}/><span>Source heights use the declared project vertical datum. This import does not perform a height datum transformation.</span></label>
        </fieldset>
      </section>
    </div>
    {source&&<section aria-labelledby="review-heading" className="mt-6 min-w-0 rounded-lg border border-[var(--border-color)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="review-heading" className="font-display text-xl">3. Review & save</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{selected.length.toLocaleString()} of {total.toLocaleString()} selected. Values below are from the source file.</p></div><div className="flex flex-wrap gap-2"><button disabled={locked} className={buttonClass} onClick={()=>setSelected(parsed?.rawPoints.flatMap((point,index)=>complete(point)?[index]:[])??[])}>Select complete coordinates</button><button className={buttonClass} disabled={locked} onClick={()=>setSelected([])}>Clear selection</button></div></div>
      {(parsed?.errors??['The file could not be parsed.']).map((error,index)=><p role="alert" className="mt-3 text-sm text-[var(--error)]" key={index}>{error}</p>)}
      {total>MAX_POINT_IMPORT_ROWS&&<p role="alert" className="mt-3 text-sm text-[var(--error)]">Too many records. Export smaller, explicit job areas; nothing has been truncated or saved.</p>}
      {!!visible.length&&<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Source coordinate records; unknown heights remain empty in the project</caption><thead className="border-b border-[var(--border-color)] text-xs text-[var(--text-secondary)]"><tr>{['Use','Point','Easting / longitude','Northing / latitude','Height','Code'].map(label=><th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{visible.map((point,offset)=>{const index=page*100+offset;return <tr key={index} className="border-b border-[var(--border-color)]"><td className="p-1"><label className="flex min-h-12 min-w-12 items-center justify-center"><input aria-label={`Include source record ${index+1}: ${point.id||'unnamed'}`} type="checkbox" className="h-5 w-5 accent-[var(--accent)]" disabled={locked||!complete(point)} checked={selected.includes(index)} onChange={event=>{setSelected(previous=>event.target.checked?[...previous,index].sort((a,b)=>a-b):previous.filter(value=>value!==index));setConfirmWarnings(false)}}/></label></td><th scope="row" className="max-w-48 break-words p-3 font-medium">{point.id||'Missing name'}</th>{[point.easting,point.northing,point.elevation].map((value,column)=><td key={column} className="whitespace-nowrap p-3 font-mono text-xs tabular-nums">{displayNumber(value)}</td>)}<td className="max-w-48 break-words p-3">{point.code||'—'}</td></tr>})}</tbody></table></div>}
      {total>100&&<div className="mt-4 flex items-center justify-between gap-3 text-sm"><button className={buttonClass} disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous</button><span>{page*100+1}–{Math.min(total,(page+1)*100)} of {total}</span><button className={buttonClass} disabled={(page+1)*100>=total} onClick={()=>setPage(value=>value+1)}>Next</button></div>}
      {preview.prepared&&<div className="mt-5 rounded-md bg-[var(--bg-secondary)] p-4"><p className="text-sm font-medium">Destination preview · {preview.prepared.projectCrs} · metres</p><p className="mt-2 break-words font-mono text-xs">{preview.prepared.points[0]?.pointName}: E {preview.prepared.points[0]?.easting.toFixed(3)} / N {preview.prepared.points[0]?.northing.toFixed(3)} / H {preview.prepared.points[0]?.elevation===null?'Unknown':preview.prepared.points[0]?.elevation?.toFixed(3)}</p></div>}
      {!!preview.prepared?.warnings.length&&<details open className="mt-4 rounded-md border border-[var(--border-color)] p-4"><summary className="cursor-pointer text-sm font-medium">{preview.prepared.warnings.length} review notice(s)</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5">{preview.prepared.warnings.slice(0,30).map((warning,index)=><li key={index}>{warning}</li>)}</ul>{preview.prepared.warnings.length>30&&<p className="mt-2 text-xs">Further per-point notices are retained in the capture.</p>}</details>}
      <label className="mt-4 flex min-h-12 items-start gap-3 text-sm leading-5"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" disabled={locked} checked={confirmWarnings} onChange={event=>setConfirmWarnings(event.target.checked)}/><span>I reviewed the parser notices and any excluded records. Only selected coordinate records will be imported; the full original file will be retained.</span></label>
      {!receipt&&<p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">{validation||'Ready to commit the selected points and original source in one transaction.'}</p>}
      {submitError&&<p role="alert" className="mt-4 text-sm text-[var(--error)]">{submitError}</p>}
      {pending&&!receipt&&<p className="mt-3 text-sm leading-6">This capture is locked while its outcome is checked. Retry checks the same request and cannot create another copy. <Link className="underline" href={`/project/${pending.projectId}`}>Review the project register</Link> before starting other imports.</p>}
      {!receipt&&<button className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--accent)] px-6 py-3 font-medium text-[var(--bg-primary)] disabled:opacity-50 sm:w-auto" disabled={busy||reading||(!pending&&!!validation)} onClick={()=>void commit()}>{busy?'Saving & checking receipt…':pending?'Retry / check this capture':`Save ${selected.length.toLocaleString()} selected points`}</button>}
    </section>}
    {!!context?.history.length&&<section className="mt-8" aria-labelledby="history-heading"><h2 id="history-heading" className="font-display text-xl">Recent captures in this project</h2><ul className="mt-4 divide-y divide-[var(--border-color)] border-y border-[var(--border-color)]">{context.history.map(item=><li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{item.source_file_name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.point_count} points · {new Date(item.created_at).toLocaleDateString()}</p><p className="mt-1 break-all font-mono text-[10px] text-[var(--text-secondary)]">SHA-256 {item.source_file_hash}</p></div><a className={buttonClass} href={`/api/project/${context.projectId}/point-imports?source=${item.id}`}>Download original</a></li>)}</ul></section>}
  </div>
}
