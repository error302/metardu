'use client'
import {useEffect,useMemo,useRef,useState} from 'react'
import type {RoadDesignData} from '@/types/engineering'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {roadQuantityInputs,roadQuantityCsv,roadQuantityVersionNotice,type QuantityReference,type RoadQuantityRecord,type RoadQuantityCalculation} from '@/lib/engineering/roadQuantity'

interface Summary {id:string;revision:string;revision_number:number;status:string;created_at:string;input_hash:string;total_cut:number;total_fill:number}
interface History {data:Summary[];next_before:number|null;can_record:boolean}
async function request<T>(url:string,signal:AbortSignal,init:RequestInit={}):Promise<T> {
  const controller=new AbortController(),abort=()=>controller.abort()
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  const timer=setTimeout(abort,60000)
  try {
    const response=await fetch(url,{...init,signal:controller.signal,cache:'no-store'})
    const value=await response.json().catch(()=>null) as {error?:string|{message?:string}}|null
    if(!response.ok)throw new Error(typeof value?.error==='string'?value.error:typeof value?.error?.message==='string'?value.error.message:`Request failed (${response.status}). Please retry.`)
    return value as T
  } finally {clearTimeout(timer);signal.removeEventListener('abort',abort)}
}
const message=(error:unknown)=>error instanceof Error&&error.name!=='AbortError'?error.message:'Request interrupted. Retry when connected.'

export function RoadQuantityRegister({projectId,data,reference,canRecord}:{projectId:string;data:RoadDesignData;reference:QuantityReference;canRecord:boolean}) {
  const signature=useMemo(()=>{try{return canonicalJson(roadQuantityInputs(data,reference))}catch{return''}},[data,reference])
  const view=`${projectId}\n${data.roadName}\n${signature}`
  const current=useRef(view);current.current=view
  const controller=useRef<AbortController|null>(null),active=useRef<symbol|null>(null)
  const delivery=useRef<{hash:string;id:string}|null>(null)
  const [alignment,setAlignment]=useState(''),[readyView,setReadyView]=useState(''),[busy,setBusy]=useState(false)
  const [mayRecord,setMayRecord]=useState(false)
  const [error,setError]=useState(''),[runs,setRuns]=useState<Summary[]>([]),[next,setNext]=useState<number|null>(null)
  const [selected,setSelected]=useState<RoadQuantityRecord|null>(null)
  useEffect(()=>{
    const pending=new AbortController();controller.current=pending;active.current=null;delivery.current=null
    setReadyView('');setAlignment('');setMayRecord(false);setSelected(null);setRuns([]);setNext(null);setError('');setBusy(true)
    const belongs=()=>!pending.signal.aborted&&current.current===view
    void(async()=>{
      try {
        const header=await request<{data:{id:string}|null}>(`/api/engineering/alignment?project_id=${encodeURIComponent(projectId)}&road_name=${encodeURIComponent(data.roadName)}`,pending.signal)
        if(!header.data?.id)throw new Error('Save All engineering data before recording a quantity run.')
        const history=await request<History>(`/api/engineering/earthworks?alignment_id=${encodeURIComponent(header.data.id)}`,pending.signal)
        if(belongs()){setAlignment(header.data.id);setMayRecord(history.can_record===true);setRuns(history.data);setNext(history.next_before);setReadyView(view)}
      }catch(problem){if(belongs())setError(message(problem))}
      finally{if(belongs())setBusy(false)}
    })()
    return()=>pending.abort()
  },[projectId,data.roadName,view])

  const perform=async(work:(signal:AbortSignal)=>Promise<void>)=>{
    if(active.current||!controller.current||readyView!==view)return
    const token=Symbol();active.current=token;setBusy(true);setError('')
    try{await work(controller.current.signal)}catch(problem){if(current.current===view&&active.current===token)setError(message(problem))}
    finally{if(current.current===view&&active.current===token){active.current=null;setBusy(false)}}
  }
  const belongs=(signal:AbortSignal)=>current.current===view&&!signal.aborted
  const record=()=>perform(async signal=>{
    const preview=await request<{data:RoadQuantityCalculation&{input_hash:string}}>(`/api/engineering/earthworks?alignment_id=${encodeURIComponent(alignment)}&preview=1`,signal)
    if(!belongs(signal))return
    if(canonicalJson(preview.data.inputs)!==signature)throw new Error('Saved road inputs differ from this view. Use Save All, reload, and review the quantities before recording.')
    if(delivery.current?.hash!==preview.data.input_hash)delivery.current={hash:preview.data.input_hash,id:crypto.randomUUID()}
    const saved=await request<{data:RoadQuantityRecord}>(`/api/engineering/earthworks`,signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alignment_id:alignment,client_run_id:delivery.current.id,expected_input_hash:preview.data.input_hash})})
    if(!belongs(signal))return
    setSelected(saved.data);delivery.current=null
    const history=await request<History>(`/api/engineering/earthworks?alignment_id=${encodeURIComponent(alignment)}`,signal)
    if(belongs(signal)){setRuns(history.data);setNext(history.next_before)}
  })
  const open=(id:string)=>perform(async signal=>{
    const archive=await request<{data:RoadQuantityRecord}>(`/api/engineering/earthworks?alignment_id=${encodeURIComponent(alignment)}&run_id=${encodeURIComponent(id)}`,signal)
    if(belongs(signal))setSelected(archive.data)
  })
  const more=()=>perform(async signal=>{
    const history=await request<History>(`/api/engineering/earthworks?alignment_id=${encodeURIComponent(alignment)}&before_revision=${next}`,signal)
    if(belongs(signal)){setRuns(previous=>[...previous,...history.data]);setNext(history.next_before)}
  })
  const download=()=>{
    if(!selected)return
    const url=URL.createObjectURL(new Blob([roadQuantityCsv(selected)],{type:'text/csv;charset=utf-8;'}))
    const link=document.createElement('a');link.href=url;link.download=`metardu-quantity-${selected.revision}-${selected.id}.csv`;link.click();URL.revokeObjectURL(url)
  }
  return <div className="mt-5 border-t border-zinc-700 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h5 className="font-medium text-white">Draft quantity register</h5>
      <button type="button" onClick={()=>void record()} disabled={busy||!canRecord||!signature||!mayRecord||readyView!==view} className="rounded-lg border border-amber-600 px-3 py-2 text-sm text-amber-300 disabled:opacity-40">Record quantity run</button>
    </div>
    <p className="mt-2 text-xs text-zinc-400">Save All first. Each run retains the server-calculated quantities and source inputs for review. Recording does not approve construction or apply material factors.</p>
    {busy&&<p role="status" className="mt-2 text-sm text-zinc-400">Loading quantity register…</p>}
    {error&&<p role="alert" className="mt-2 text-sm text-amber-300">{error}</p>}
    {!busy&&readyView===view&&!mayRecord&&<p className="mt-2 text-sm text-zinc-400">Read-only project access. The recorded owner can add a quantity run.</p>}
    {!!runs.length&&<div className="mt-3 overflow-x-auto"><table aria-label="Recorded quantity runs" className="w-full text-left text-sm"><thead><tr>{['Run','Recorded','Cut m³','Fill m³','Record status','Open'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{runs.map(run=><tr key={run.id}><td className="p-2">{run.revision}</td><td className="p-2">{new Date(run.created_at).toLocaleString()}</td><td className="p-2">{run.total_cut.toFixed(3)}</td><td className="p-2">{run.total_fill.toFixed(3)}</td><td className="p-2">{run.status}</td><td className="p-2"><button type="button" disabled={busy} onClick={()=>void open(run.id)} className="text-amber-300">Open {run.revision}</button></td></tr>)}</tbody>
    </table></div>}
    {next!==null&&<button type="button" disabled={busy} onClick={()=>void more()} className="mt-2 text-sm text-amber-300">Load earlier runs</button>}
    {!busy&&!error&&!runs.length&&<p className="mt-3 text-sm text-zinc-400">No quantity runs recorded for this alignment.</p>}
    {selected&&<div className="mt-4 space-y-2 text-sm">
      <p className="font-medium text-white">Recorded {selected.revision} · {selected.status} · calculation DRAFT</p>
      <p className="text-zinc-400">{selected.quantity.inputs.reference.horizontalCrs} · {selected.quantity.inputs.reference.verticalDatum} · {selected.quantity.algorithmVersion}</p>
      {roadQuantityVersionNotice(selected.quantity.algorithmVersion)&&<p role="status" className="text-sm text-amber-300">{roadQuantityVersionNotice(selected.quantity.algorithmVersion)}</p>}
      <p className="text-zinc-300">Cut {selected.quantity.result.totalCut.toFixed(3)} m³ · Fill {selected.quantity.result.totalFill.toFixed(3)} m³ · {selected.quantity.result.rows.length} measured sections</p>
      <p className="break-all text-xs text-zinc-500">Input SHA-256: {selected.quantity.inputHash}</p>
      <p className="text-xs text-zinc-400">{canonicalJson(selected.quantity.inputs)===signature?'Recorded inputs match this view.':'This is an earlier input snapshot. Its archived CSV is not the current calculation.'}</p>
      <button type="button" onClick={download} className="rounded-lg border border-zinc-600 px-3 py-2 text-amber-300">Download recorded CSV</button>
    </div>}
  </div>
}
