'use client'

import { useEffect,useRef,useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { AlertCircle,ArrowLeft,ArrowRight,Edit3,Loader2,Plus,RefreshCw,Trash2,X } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import CsvImportPanel from './CsvImportPanel'
import TraverseComputePanel from './TraverseComputePanel'
import { blockRegisterResponseSchema,formatRegisterArea,type BlockParcelRow,type BlockRegisterData } from '@/lib/scheme/blockRegister'
import { CreateParcelSchema,UpdateParcelSchema } from '@/lib/validation/parcelInputs'
import { parcelCommandResponseSchema,parcelDeleteResponseSchema,parcelStatusSchema } from '@/lib/validation/scheme'
import { PARCEL_STATUS_LABELS } from '@/types/scheme'

interface Fields { parcel_number:string;lr_number_proposed:string;lr_number_confirmed:string;area:string;status:string;notes:string }
const fieldsFor=(row?:BlockParcelRow):Fields=>({parcel_number:row?.parcel_number??'',lr_number_proposed:row?.lr_number_proposed??'',lr_number_confirmed:row?.lr_number_confirmed??'',area:row?.area_text??'',status:row?.status??'',notes:row?.notes??''})
const nullable=(text:string)=>text.trim()||null
const actionClass='inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] disabled:opacity-40'

export default function BlockParcelRegister({projectId,blockId}:{projectId:string;blockId:string}){
  const [data,setData]=useState<BlockRegisterData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null)
  const [page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[filters,setFilters]=useState({q:'',status:'all'})
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[creating,setCreating]=useState(false),[editing,setEditing]=useState<BlockParcelRow|null>(null)
  const [selected,setSelected]=useState<BlockParcelRow|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  const exportScope=`${projectId}:${blockId}`
  const [exportSelection,setExportSelection]=useState<{scope:string;ids:string[]}>({scope:exportScope,ids:[]})
  const exportIds=exportSelection.scope===exportScope?exportSelection.ids:[]
  function selectForExport(id:string){if(!exportIds.includes(id)&&exportIds.length>=50){setNotice('Choose at most 50 parcels in one export batch.');return}setExportSelection(current=>{const ids=current.scope===exportScope?current.ids:[];if(!ids.includes(id)&&ids.length>=50)return current;return {scope:exportScope,ids:ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]}})}
  const mounted=useRef(true),mutation=useRef(false)
  const confirmed=data?.project.id===projectId&&data.block.id===blockId?data:null
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{
    let current=true;const controller=new AbortController();setLoading(true);setError(null)
    async function load(){try{
      const query=new URLSearchParams({page:String(page),q:filters.q,status:filters.status})
      const response=await fetch(`/api/project/${projectId}/scheme-block/${blockId}?${query}`,{signal:controller.signal,cache:'no-store'})
      const body:unknown=await response.json()
      if(!response.ok){const message=z.object({error:z.string()}).safeParse(body);throw new Error(message.success?message.data.error:'The parcel register could not be loaded.')}
      const parsed=blockRegisterResponseSchema.safeParse(body)
      if(!parsed.success||parsed.data.data.project.id!==projectId||parsed.data.data.block.id!==blockId)throw new Error('The register identity or counts do not match this block.')
      const register=parsed.data.data.register,expectedPage=Math.min(page,Math.max(1,Math.ceil(register.total/register.pageSize)))
      if(register.search!==filters.q||register.status!==filters.status||register.page!==expectedPage)throw new Error('The register response does not match the requested filters and page.')
      if(current)setData(parsed.data.data)
    }catch(failure){if(current)setError(failure instanceof Error?failure.message:'The parcel register could not be loaded.')}finally{if(current)setLoading(false)}}
    void load();return()=>{current=false;controller.abort()}
  },[projectId,blockId,page,filters,refresh])

  async function save(fields:Fields,row?:BlockParcelRow){
    if(mutation.current)return
    let payload:Record<string,unknown>
    if(row){
      const original=fieldsFor(row),changes:Record<string,unknown>={}
      for(const field of ['parcel_number','lr_number_proposed','lr_number_confirmed','status','notes'] as const)if(fields[field]!==original[field])changes[field]=field==='parcel_number'||field==='status'?fields[field]:nullable(fields[field])
      if(fields.area!==original.area)changes.area_ha=fields.area.trim()?Number(fields.area):null
      if(!Object.keys(changes).length){setNotice('No metadata changes to save.');setEditing(null);return}
      const parsed=UpdateParcelSchema.safeParse({...changes,project_id:projectId,block_id:blockId,updated_at:row.updated_at,base_revision:row.revision_number})
      if(!parsed.success){setError(parsed.error.issues[0]?.message??'Check the parcel fields.');return}
      payload=parsed.data
    }else{
      const parsed=CreateParcelSchema.safeParse({project_id:projectId,block_id:blockId,parcel_number:fields.parcel_number,lr_number_proposed:nullable(fields.lr_number_proposed),area_ha:fields.area.trim()?Number(fields.area):null,notes:nullable(fields.notes)})
      if(!parsed.success){setError(parsed.error.issues[0]?.message??'Check the parcel fields.');return}
      payload=parsed.data
    }
    mutation.current=true;setBusy(true);setError(null);setNotice('')
    try{
      const response=await fetch(row?`/api/scheme/parcels/${row.id}`:'/api/scheme/parcels',{method:row?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const body:unknown=await response.json()
      if(!response.ok){const message=z.object({error:z.string()}).safeParse(body);throw new Error(message.success?message.data.error:'The parcel change could not be confirmed.')}
      const parsed=parcelCommandResponseSchema.safeParse(body)
      if(!parsed.success)throw new Error('The parcel acknowledgement is incomplete. Refresh the register before retrying.')
      const saved=parsed.data.data
      if(saved.project_id!==projectId||saved.block_id!==blockId||row&&(saved.id!==row.id||saved.revision_number!==row.revision_number+1)||!row&&saved.revision_number!==1)throw new Error('The parcel acknowledgement does not match the intended record. Refresh before retrying.')
      for(const [field,value] of Object.entries(payload)){
        if(field==='updated_at'||field==='base_revision')continue
        if((saved as Record<string,unknown>)[field]!==value)throw new Error('The parcel acknowledgement does not match the supplied metadata. Refresh before retrying.')
      }
      if(!mounted.current)return
      setNotice(row?'Parcel change acknowledged.':'Parcel creation acknowledged.');setEditing(null);setCreating(false);setRefresh(value=>value+1)
    }catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'The parcel result is unconfirmed. Refresh before retrying.')}
    finally{mutation.current=false;if(mounted.current)setBusy(false)}
  }
  async function remove(row:BlockParcelRow){
    if(mutation.current||!row.can_delete||!window.confirm(`Permanently delete empty pending parcel ${row.parcel_number}? This removes its register metadata and cannot be undone.`))return
    mutation.current=true;setBusy(true);setError(null);setNotice('')
    try{
      const query=new URLSearchParams({project_id:projectId,block_id:blockId,updated_at:row.updated_at,base_revision:String(row.revision_number)})
      const response=await fetch(`/api/scheme/parcels/${row.id}?${query}`,{method:'DELETE'}),body:unknown=await response.json()
      if(!response.ok){const message=z.object({error:z.string()}).safeParse(body);throw new Error(message.success?message.data.error:'The deletion could not be confirmed.')}
      const parsed=parcelDeleteResponseSchema.safeParse(body)
      if(!parsed.success||parsed.data.data.deletedId!==row.id||parsed.data.data.projectId!==projectId||parsed.data.data.blockId!==blockId||parsed.data.data.revision!==row.revision_number)throw new Error('The deletion acknowledgement does not match the selected record. Refresh before retrying.')
      if(!mounted.current)return
      setNotice('Empty pending parcel deletion acknowledged.');setRefresh(value=>value+1)
    }catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'The deletion is unconfirmed. Refresh before retrying.')}
    finally{mutation.current=false;if(mounted.current)setBusy(false)}
  }
  function openTraverse(row:BlockParcelRow){if(selected&&selected.id!==row.id&&!window.confirm('Switch parcel traverse forms? Unsaved entries in the open form will be discarded.'))return;setSelected(row)}

  return <section className="mx-auto w-full min-w-0 max-w-6xl space-y-5 px-4 py-6" aria-label="Block parcel register">
    <nav className="flex flex-wrap gap-2 text-sm text-[var(--text-secondary)]" aria-label="Block breadcrumb"><Link href={`/project/${projectId}/scheme`} className="underline underline-offset-4">Scheme overview</Link><span aria-hidden="true">/</span><Link href={`/project/${projectId}/scheme/blocks`} className="underline underline-offset-4">Blocks</Link></nav>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{confirmed?`Block ${confirmed.block.number}`:'Parcel register'}</p><h1 className="mt-1 break-words text-2xl font-semibold">{confirmed?(confirmed.block.name??`Block ${confirmed.block.number}`):'Parcel register'}</h1>{confirmed?.block.description&&<p className="mt-2 text-sm text-[var(--text-secondary)]">{confirmed.block.description}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading||busy} onClick={()=>setRefresh(value=>value+1)} className={actionClass}><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh register</button>{confirmed&&<button type="button" disabled={busy} onClick={()=>{setCreating(true);setEditing(null);setError(null)}} className={actionClass}><Plus className="h-4 w-4" aria-hidden="true"/>Add parcel</button>}</div></header>
    {loading&&<p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>Loading parcel register…</p>}
    {error&&<div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-500/30 p-4"><div className="flex min-w-0 items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true"/><div><p className="text-sm">{error}</p>{confirmed&&<p className="mt-1 text-xs text-[var(--text-secondary)]">Showing the last confirmed register. Keep unsaved edits until you have reviewed the current record.</p>}</div></div><button type="button" disabled={loading||busy} onClick={()=>setRefresh(value=>value+1)} className={actionClass}>Retry register</button></div>}
    {notice&&<p role="status" className="rounded-lg border border-[var(--border-color)] p-3 text-sm">{notice}</p>}
    {confirmed&&<>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Stat label="Block parcel total" value={confirmed.summary.total.toLocaleString()}/><Stat label="Supplied known area (ha)" value={confirmed.summary.knownAreaCount?formatRegisterArea(confirmed.summary.knownAreaHa):'No known areas recorded'}/><Stat label="Recorded submitted or approved" value={confirmed.summary.submittedOrApproved.toLocaleString()}/></div>
      <p className="text-xs text-[var(--text-secondary)]">{confirmed.summary.unknownAreaCount.toLocaleString()} areas unknown; {confirmed.summary.invalidAreaCount.toLocaleString()} invalid areas; {confirmed.summary.unrecognizedStatusCount.toLocaleString()} unrecognized statuses. Area totals use supplied metadata, not a computed boundary.</p>
      {creating&&<ParcelForm key="new" busy={busy} onSave={values=>save(values)} onCancel={()=>setCreating(false)}/>}
      <form onSubmit={event=>{event.preventDefault();setPage(1);setFilters({q:search.trim(),status})}} className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-color)] p-4"><label className="min-w-0 flex-1 space-y-1 text-xs"><span>Search parcel or LR</span><input value={search} maxLength={80} disabled={busy} onChange={event=>setSearch(event.target.value)} className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"/></label><label className="space-y-1 text-xs"><span>Recorded status</span><select value={status} disabled={busy} onChange={event=>setStatus(event.target.value)} className="block rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"><option value="all">All statuses</option>{Object.entries(PARCEL_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="unrecognized">Unrecognized status</option></select></label><button type="submit" disabled={busy||loading} className={actionClass}>Apply filters</button></form>
      {selected&&<section className="min-w-0 rounded-lg border border-[var(--border-color)] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-medium"><GeomaticsIcon symbol="traverse" className="h-4 w-4"/>Traverse record: {selected.parcel_number}</h2><button type="button" className={actionClass} onClick={()=>{if(window.confirm('Close this traverse form? Unsubmitted edits will be discarded. An unconfirmed retained request stays recoverable on this device.'))setSelected(null)}}><X className="h-4 w-4" aria-hidden="true"/>Close traverse</button></div><TraverseComputePanel key={selected.id} projectId={projectId} parcelId={selected.id}/></section>}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-color)] p-3 text-sm" aria-label="Selected export parcels"><span>{exportIds.length} of 50 selected for export review</span>{exportIds.length>0&&<><Link className="underline underline-offset-4" href={`/project/${projectId}/scheme/exports?${exportIds.map(id=>`parcel_id=${encodeURIComponent(id)}`).join('&')}`}>Review selected export</Link><button type="button" className={actionClass} onClick={()=>setExportSelection({scope:exportScope,ids:[]})}>Clear selection</button></>}</div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)]"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]"><tr><th className="p-3">Export</th><th className="p-3">Parcel</th><th className="p-3">Proposed LR</th><th className="p-3">Confirmed LR</th><th className="p-3">Supplied area (ha)</th><th className="p-3">Recorded status</th><th className="p-3">Actions</th></tr></thead><tbody>{confirmed.register.rows.map(row=>editing?.id===row.id?<tr key={row.id}><td colSpan={7} className="p-3"><ParcelForm key={row.id} row={editing} busy={busy} onSave={values=>save(values,editing)} onCancel={()=>setEditing(null)}/></td></tr>:<tr key={row.id} className="border-t border-[var(--border-color)]"><td className="p-3"><input type="checkbox" aria-label={`Select parcel ${row.parcel_number} for export`} checked={exportIds.includes(row.id)} disabled={busy} onChange={()=>selectForExport(row.id)}/></td><td className="p-3 font-mono">{row.parcel_number}</td><td className="p-3">{row.lr_number_proposed??'Not recorded'}</td><td className="p-3">{row.lr_number_confirmed??'Not recorded'}</td><td className="p-3 tabular-nums">{row.area_state==='known'?row.area_text:row.area_state==='invalid'?`Invalid (${row.area_text??'unknown'})`:'Unknown'}</td><td className="p-3">{parcelStatusSchema.safeParse(row.status).success?PARCEL_STATUS_LABELS[row.status as keyof typeof PARCEL_STATUS_LABELS]:`Unrecognized (${row.status??'not recorded'})`}</td><td className="p-3"><div className="flex gap-1"><button type="button" aria-label={`Edit parcel ${row.parcel_number}`} disabled={busy} className={actionClass} onClick={()=>{setEditing(row);setCreating(false);setError(null)}}><Edit3 className="h-4 w-4" aria-hidden="true"/></button><Link href={`/project/${projectId}/scheme/boundary-review?parcel=${row.id}`} aria-label={`Review boundary for ${row.parcel_number}`} className={actionClass}><GeomaticsIcon symbol="parcel" className="h-4 w-4"/></Link><button type="button" aria-label={`Open traverse for ${row.parcel_number}`} disabled={busy} className={actionClass} onClick={()=>openTraverse(row)}><GeomaticsIcon symbol="traverse" className="h-4 w-4"/></button><button type="button" aria-label={`Delete parcel ${row.parcel_number}`} disabled={busy||!row.can_delete} title={row.can_delete?'Delete empty pending metadata':'Retained survey or issue evidence prevents deletion'} className={actionClass} onClick={()=>void remove(row)}><Trash2 className="h-4 w-4" aria-hidden="true"/></button></div></td></tr>)}</tbody></table></div>
        {confirmed.register.total===0&&<p className="p-5 text-sm">{confirmed.summary.total===0?'No parcels recorded in this block.':'No parcels match these filters.'}</p>}
        <nav aria-label="Parcel register pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] p-3 text-xs"><span>Page {confirmed.register.page.toLocaleString()} of {Math.max(1,Math.ceil(confirmed.register.total/confirmed.register.pageSize)).toLocaleString()} · {confirmed.register.total.toLocaleString()} matching parcels</span><div className="flex gap-2"><button type="button" aria-label="Previous parcels page" disabled={loading||busy||confirmed.register.page<=1} className={actionClass} onClick={()=>setPage(confirmed.register.page-1)}><ArrowLeft className="h-3 w-3" aria-hidden="true"/>Previous</button><button type="button" aria-label="Next parcels page" disabled={loading||busy||confirmed.register.page*confirmed.register.pageSize>=confirmed.register.total} className={actionClass} onClick={()=>setPage(confirmed.register.page+1)}>Next<ArrowRight className="h-3 w-3" aria-hidden="true"/></button></div></nav>
      </div>
      <CsvImportPanel projectId={projectId} blockId={blockId} blockName={confirmed.block.number} onImportComplete={()=>setRefresh(value=>value+1)}/>
      <Link href={`/project/${projectId}/deliver`} className="inline-block text-sm underline underline-offset-4">Review project deliverables</Link>
    </>}
  </section>
}

function Stat({label,value}:{label:string;value:string}){return <div aria-label={label} className="min-w-0 rounded-lg border border-[var(--border-color)] p-4"><p className="text-xs text-[var(--text-secondary)]">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>}
function ParcelForm({row,busy,onSave,onCancel}:{row?:BlockParcelRow;busy:boolean;onSave:(values:Fields)=>Promise<void>;onCancel:()=>void}){
  const [values,setValues]=useState<Fields>(()=>fieldsFor(row))
  const inputClass='block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm'
  return <form aria-label={row?'Edit parcel metadata':'Create parcel metadata'} onSubmit={event=>{event.preventDefault();void onSave(values)}} className="rounded-lg border border-[var(--border-color)] p-4 space-y-4"><h2 className="text-sm font-medium">{row?`Edit ${row.parcel_number}`:'New parcel metadata'}</h2><fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{(['parcel_number','lr_number_proposed',...(row?['lr_number_confirmed'] as const:[]),'area','notes'] as Array<keyof Fields>).map(field=><label key={field} className="min-w-0 space-y-1 text-xs"><span>{({parcel_number:'Parcel number',lr_number_proposed:'Proposed LR',lr_number_confirmed:'Confirmed LR',area:'Area (ha)',notes:'Notes',status:'Recorded status'})[field]}</span><input className={inputClass} required={field==='parcel_number'} maxLength={field==='parcel_number'?30:field==='notes'?1000:field==='area'?30:50} inputMode={field==='area'?'decimal':undefined} value={values[field]} onChange={event=>setValues(previous=>({...previous,[field]:event.target.value}))}/></label>)}{row&&<label className="space-y-1 text-xs"><span>Recorded parcel status</span><select className={inputClass} value={values.status} onChange={event=>setValues(previous=>({...previous,status:event.target.value}))}>{!parcelStatusSchema.safeParse(values.status).success&&<option value={values.status} disabled>Unrecognized status — review required</option>}{Object.entries(PARCEL_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}</fieldset><p className="text-xs text-[var(--text-secondary)]">Leave area blank when unknown. Enter positive hectares with at most six decimal places. Metadata does not establish a surveyed boundary.</p><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className={actionClass} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy} className={actionClass}>{busy&&<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>}{row?'Save parcel changes':'Create parcel'}</button></div></form>
}
