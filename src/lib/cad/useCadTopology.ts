'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createCadTopologyWorker } from '@/lib/cad/cadTopologyWorker'
import type { CadTopologyInput, CadTopologyResponse, CadTopologyResult } from './cadTopologyProtocol'
import { getRegisteredCrsDefinition } from '@/lib/spatial/projectCrs'

export function useCadTopology(input: CadTopologyInput): { result:CadTopologyResult|null; error:string|null; loading:boolean } {
  const [state,setState]=useState<{input:CadTopologyInput;result:CadTopologyResult|null;error:string|null}|null>(null)
  const worker=useRef<Worker|null>(null)
  const alive=useRef(true)
  const revision=useRef(0)
  const latest=useRef(input)
  const pending=useRef<{revision:number;input:CadTopologyInput}|null>(null)
  const running=useRef<{revision:number;input:CadTopologyInput}|null>(null)
  const dispatch=useCallback(function dispatchPending() {
    if (!alive.current || running.current || !pending.current) return
    const job=pending.current;pending.current=null
    try {
      if (!worker.current) {
        worker.current=createCadTopologyWorker()
        worker.current.onmessage=(event:MessageEvent<CadTopologyResponse>)=>{
          const active=running.current
          if (!active || event.data.revision!==active.revision || !alive.current) return
          running.current=null
          if (active.input===latest.current) setState({input:active.input,result:'result' in event.data?event.data.result:null,error:'error' in event.data?event.data.error:null})
          dispatchPending()
        }
        worker.current.onerror=()=>{
          if (!alive.current) return
          setState({input:latest.current,result:null,error:'Topology checks are unavailable. Reload the editor to retry; no checked area is available.'})
          worker.current?.terminate();worker.current=null;running.current=null;pending.current=null
        }
      }
      running.current=job
      let registeredCrs:CadTopologyInput['registeredCrs']
      if (job.input.coordinateReferenceSystem) {
        try { registeredCrs=getRegisteredCrsDefinition(job.input.coordinateReferenceSystem) } catch { registeredCrs=undefined }
      }
      // Send geometry only: never clone raster pixels, titles or private project records.
      worker.current.postMessage({revision:job.revision,input:{width:job.input.width,height:job.input.height,metersPerPixel:job.input.metersPerPixel,originEasting:job.input.originEasting,originNorthing:job.input.originNorthing,coordinateReferenceSystem:job.input.coordinateReferenceSystem,registeredCrs,
        beacons:job.input.beacons.map(p=>({id:p.id,label:p.label,x:p.x,y:p.y,easting:p.easting,northing:p.northing})),
        boundaries:job.input.boundaries.map(e=>({id:e.id,fromId:e.fromId,toId:e.toId,type:e.type})),
      }})
    } catch {
      running.current=null
      setState({input:job.input,result:null,error:'A background topology check could not start. Reload the editor to retry.'})
    }
  },[])
  useEffect(()=>{
    alive.current=true
    return ()=>{alive.current=false;worker.current?.terminate();worker.current=null;running.current=null;pending.current=null}
  },[])
  useEffect(()=>{
    latest.current=input
    pending.current={revision:++revision.current,input}
    dispatch()
  },[input,dispatch])
  const current=state?.input===input?state:null
  return {result:current?.result??null,error:current?.error??null,loading:!current}
}
