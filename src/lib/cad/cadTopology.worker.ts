import { analyseCadTopology } from './cadTopologyAnalysis'
import type { CadTopologyInput, CadTopologyResponse } from './cadTopologyProtocol'
import { registerCrs } from '@/lib/spatial/projectCrs'

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<{revision:number;input:CadTopologyInput}>)=>void) | null; postMessage: (response:CadTopologyResponse)=>void }
scope.onmessage = event => {
  const { revision, input } = event.data
  try {
    if (input.registeredCrs) {
      if (input.registeredCrs.info.code!==input.coordinateReferenceSystem?.trim().toUpperCase()) throw new RangeError('Reference definition does not match the selected CRS.')
      registerCrs(input.registeredCrs.info,input.registeredCrs.def)
    }
    scope.postMessage({revision,result:analyseCadTopology(input)})
  }
  catch { scope.postMessage({revision,error:'The topology check could not complete. Correct the linework or retry; no checked area is available.'}) }
}
