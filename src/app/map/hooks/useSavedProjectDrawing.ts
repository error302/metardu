'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import type VectorSource from 'ol/source/Vector'
import type Map from 'ol/Map'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { decodeMapDrawing,encodeMapDrawing } from '@/lib/mapDrawing/codec'
import { archiveDrawingDraft,drawingDraftKey,readDrawingDraft,saveDrawingDraft,type DrawingDraft } from '@/lib/mapDrawing/draft'
import { readMapDrawingReply,type MapDrawingReply,type MapFeatureCollection } from '@/lib/mapDrawing/wire'

interface Params {
  projectId:string|null;mapReady:boolean;source:React.RefObject<VectorSource|null>;map:React.RefObject<Map|null>
  pushHistory:()=>void;clearHistory:()=>void;setMessage:(value:string)=>void
  clearSelection?:()=>void
}
const human = (error:unknown) => error instanceof Error ? error.message : 'The drawing request was not confirmed.'
const same = (a:unknown,b:unknown) => canonicalJson(a) === canonicalJson(b)
function download(value:unknown,name:string) {
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function requestDrawing(projectId:string,options?:RequestInit):Promise<MapDrawingReply> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  try {
    const response=await fetch(`/api/project/${encodeURIComponent(projectId)}/map-drawing`,{cache:'no-store',...options,signal:controller.signal})
    const body:unknown=await response.json()
    if(!response.ok) {
      const message=body&&typeof body==='object'&&'error' in body&&typeof body.error==='string' ? body.error : `Drawing request failed (HTTP ${response.status}).`
      throw new Error(message)
    }
    return readMapDrawingReply(body,projectId)
  } finally { clearTimeout(timer) }
}

/** Server snapshots and owner/project-scoped browser recovery. Unlinked workspace keys are untouched. */
export function useSavedProjectDrawing(p:Params) {
  const [loading,setLoading]=useState(Boolean(p.projectId)),[saving,setSaving]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[cacheWarning,setCacheWarning]=useState('')
  const [snapshot,setSnapshot]=useState<MapDrawingReply|null>(null),[dirty,setDirty]=useState(false)
  const [retained,setRetained]=useState<DrawingDraft|null>(null)
  const savedRef=useRef<MapDrawingReply|null>(null),savingRef=useRef(false),mounted=useRef(true),epoch=useRef(0)
  const collectionRef=useRef<MapFeatureCollection|null>(null)
  const params=useRef(p);params.current=p
  const invalidateRequests=useCallback(()=>{epoch.current++},[])
  const capture=useCallback(():MapFeatureCollection=>{
    const encoded=encodeMapDrawing(params.current.source.current?.getFeatures()??[]),original=collectionRef.current
    if(!original)return encoded
    const result={...original,...encoded}
    if(!same(encoded.features,original.features))delete result.bbox
    return result
  },[])
  const persist=useCallback((features:MapFeatureCollection,base=savedRef.current)=>{
    if(!base) return
    try {
      const old=readDrawingDraft(localStorage,base.projectId,base.viewerId)
      if(old&&old.baseVersion!==base.version&&!same(old.features,features)) archiveDrawingDraft(localStorage,old)
      saveDrawingDraft(localStorage,base.projectId,base.viewerId,base.version,features)
      if(mounted.current) setCacheWarning('')
    } catch(err) {
      if(mounted.current) setCacheWarning(`Browser recovery could not be written: ${human(err)} Download the local drawing before closing this page. Existing browser records are retained.`)
    }
  },[])
  const archiveCurrent=useCallback(()=>{
    const base=savedRef.current
    if(!base) return
    const features=capture()
    if(!same(features,base.features)) {
      const draft:DrawingDraft={projectId:base.projectId,viewerId:base.viewerId,baseVersion:base.version,features,savedAt:new Date().toISOString()}
      archiveDrawingDraft(localStorage,draft)
      return draft
    }
  },[capture])
  const load=useCallback(async(replace=false)=>{
    const current=params.current,id=current.projectId,source=current.source.current
    if(!id||!current.mapReady||!source) return
    const requestEpoch=++epoch.current
    setLoading(true);setError('')
    try {
      const reply=await requestDrawing(id)
      if(!mounted.current||requestEpoch!==epoch.current) return
      const existing=source.getFeatures()
      let collection=reply.features
      let recovery:DrawingDraft|null=null
      if(!replace) {
        try {
          const draft=readDrawingDraft(localStorage,id,reply.viewerId)
          if(draft&&!same(draft.features,reply.features)) {
            if(draft.baseVersion===reply.version) { collection=draft.features;setNotice('An unsaved browser draft was restored against the current saved version.') }
            else { recovery=draft;setNotice('A retained browser draft is based on an older saved version. Download or merge it for review.') }
          }
        } catch(err) { setCacheWarning(human(err)) }
      }
      const loaded=decodeMapDrawing(collection)
      if(replace) recovery=archiveCurrent()??null // Archive successfully before replacing anything currently drawn.
      collectionRef.current=collection
      current.clearSelection?.()
      source.clear()
      source.addFeatures(replace ? loaded : [...loaded,...existing])
      savedRef.current=reply;setSnapshot(reply);setRetained(previous=>recovery??(replace?previous:null))
      const live=capture(),unsaved=!same(live,reply.features)
      setDirty(unsaved);persist(live,reply)
      if(replace) setNotice('Saved drawing reloaded. Any different local drawing was retained in browser recovery.')
      current.clearHistory();current.pushHistory()
      if(source.getFeatures().length) {
        const extent=source.getExtent()
        if(extent&&extent.every(Number.isFinite)) current.map.current?.getView().fit(extent,{padding:[130,40,130,40],maxZoom:19})
      }
    } catch(err) { if(mounted.current&&requestEpoch===epoch.current) setError(`${human(err)} The current drawing has not been cleared.`) }
    finally { if(mounted.current&&requestEpoch===epoch.current) setLoading(false) }
  },[archiveCurrent,capture,persist])
  useEffect(()=>{
    mounted.current=true
    if(p.projectId&&p.mapReady) void load()
    return()=>{mounted.current=false;invalidateRequests()}
  },[p.projectId,p.mapReady,load,invalidateRequests])
  useEffect(()=>{
    if(!p.projectId||!p.mapReady||!p.source.current) return
    const source=p.source.current
    let timer:ReturnType<typeof setTimeout>|undefined
    const retain=()=>{
      if(!savedRef.current) return
      try { const features=capture();setDirty(!same(features,savedRef.current.features));persist(features) }
      catch(err) { setCacheWarning(`${human(err)} Keep the page open and download the local drawing for review.`) }
    }
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(retain,750)}
    source.on(['addfeature','removefeature','changefeature'],schedule)
    const onHide=()=>retain()
    window.addEventListener('pagehide',onHide)
    return()=>{clearTimeout(timer);source.un(['addfeature','removefeature','changefeature'],schedule);window.removeEventListener('pagehide',onHide);retain()}
  },[p.projectId,p.mapReady,p.source,capture,persist])
  const save=useCallback(async()=>{
    const base=savedRef.current
    if(!base||loading) {setError('Load the saved project drawing before saving edits. The local drawing is retained.');return}
    if(savingRef.current) return
    savingRef.current=true;setSaving(true);setError('');params.current.setMessage('')
    try {
      const features=capture();persist(features,base)
      const reply=await requestDrawing(base.projectId,{method:'PUT',headers:{'Content-Type':'application/json','X-Metardu-Expected-User':base.viewerId},body:JSON.stringify({baseVersion:base.version,features})})
      if(reply.viewerId!==base.viewerId||!same(reply.features,features)) throw new Error('The complete drawing save was not confirmed. Reload the saved version before retrying.')
      if(!mounted.current) return
      savedRef.current=reply;setSnapshot(reply)
      const live=capture(),unsaved=!same(live,reply.features)
      persist(live,reply);setDirty(unsaved)
      setNotice(unsaved ? 'The submitted snapshot was saved; later edits remain in the browser draft.' : `Saved ${features.features.length} map feature(s). These are unverified map drawings.`)
      params.current.setMessage(reply.metrics.status==='available'&&reply.metrics.areaSqM!=null&&reply.metrics.totalLengthM!=null
        ? `Drawing saved · grid area sum ${reply.metrics.areaSqM.toFixed(2)} m² · total boundary/line length ${reply.metrics.totalLengthM.toFixed(2)} m`
        : 'Drawing saved. Grid measurements are unavailable; no zero values were substituted.')
    } catch(err) {
      if(mounted.current) {setError(`${human(err)} Retain/download the local drawing and reload the saved version before retrying.`);params.current.setMessage(`Error: ${human(err)} The local drawing is retained.`);try{persist(capture(),base)}catch{}}
    } finally {savingRef.current=false;if(mounted.current)setSaving(false)}
  },[capture,loading,persist])
  const mergeRetained=useCallback(()=>{
    const source=params.current.source.current,base=savedRef.current
    if(!source||!base||!retained) return
    try {
      archiveCurrent()
      const current=capture(),seen=new Set(current.features.map(feature=>canonicalJson(feature)))
      const extra=retained.features.features.filter(feature=>!seen.has(canonicalJson(feature)))
      source.addFeatures(decodeMapDrawing({type:'FeatureCollection',features:extra}))
      persist(capture(),base);setDirty(true);setRetained(null)
      params.current.pushHistory()
      setNotice('Retained features were added for review. Inspect overlapping or duplicate versions before saving; no version was chosen automatically.')
    } catch(err) {setError(human(err))}
  },[archiveCurrent,capture,persist,retained])
  const downloadLocal=useCallback(()=>{try{download(capture(),'local-map-drawing.geojson')}catch(err){setError(human(err))}},[capture])
  const downloadRecovery=useCallback(()=>{
    const base=savedRef.current;if(!base)return
    try {
      const prefix=drawingDraftKey(base.projectId,base.viewerId),records:Record<string,string|null>={}
      for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&(key===prefix||key.startsWith(`${prefix}:recovery:`)))records[key]=localStorage.getItem(key)}
      download({projectId:base.projectId,viewerId:base.viewerId,records},'retained-map-browser-records.json')
    }catch(err){setError(human(err))}
  },[])
  return {loading,saving,error,notice,cacheWarning,snapshot,dirty,retained,save,reload:()=>void load(true),retry:()=>void load(),mergeRetained,downloadLocal,downloadRecovery,
    originalUrl:p.projectId?`/api/project/${encodeURIComponent(p.projectId)}/map-drawing?download=original`:null}
}
