import { analyseCadTopology } from '@/lib/cad/cadTopologyAnalysis'
import type { CadTopologyInput, CadTopologyResponse } from '@/lib/cad/cadTopologyProtocol'

// Only the browser's worker transport is replaced; the geometry engine is real.
export function createCadTopologyWorker(): Worker {
  let alive=true
  const transport={onmessage:null as ((event:MessageEvent<CadTopologyResponse>)=>void)|null,onerror:null as (()=>void)|null,
    terminate(){alive=false},
    postMessage(message:{revision:number;input:CadTopologyInput}){
      queueMicrotask(()=>{
        if (!alive) return
        try { transport.onmessage?.({data:{revision:message.revision,result:analyseCadTopology(message.input)}} as MessageEvent<CadTopologyResponse>) }
        catch { transport.onerror?.() }
      })
    },
  }
  return transport as unknown as Worker
}
