import { act, renderHook } from '@testing-library/react'
import { useCadTopology } from '@/lib/cad/useCadTopology'
import type { CadTopologyInput, CadTopologyResult } from '@/lib/cad/cadTopologyProtocol'
import { exportDrawing } from './fixtures/cad-export-document'
import { registerCrs } from '@/lib/spatial/projectCrs'

const messages: Array<{ revision: number; input: CadTopologyInput }> = []
let reply: ((event: MessageEvent<{ revision: number; result: CadTopologyResult }>) => void) | null = null
const terminate = jest.fn()
jest.mock('@/lib/cad/cadTopologyWorker', () => ({ createCadTopologyWorker: () => ({
  postMessage: (message: {revision:number;input:CadTopologyInput}) => messages.push(message), terminate: (...args:unknown[])=>{ terminate(...args) },
  set onmessage(handler: typeof reply) { reply=handler }, set onerror(_handler:unknown) {},
}) }))
const response: CadTopologyResult = { status:'open',basis:'project-grid',faces:[],networkLengthM:100,totalAreaM2:null,totalAreaHa:null,totalAreaAcres:null,unenclosedEdgeCount:1,issues:[],measurements:[] }
beforeEach(()=>{messages.length=0;reply=null;terminate.mockClear()})

test('coalesces drawing changes, discards a stale response and displays only the latest analysis', () => {
  const first=exportDrawing(); const second={...first,beacons:[...first.beacons]}; const third={...first,beacons:[{...first.beacons[0],x:102,easting:500051},first.beacons[1]]}
  const {result,rerender}=renderHook(({input})=>useCadTopology(input),{initialProps:{input:first as CadTopologyInput}})
  expect(messages).toHaveLength(1)
  rerender({input:second});rerender({input:third})
  expect(messages).toHaveLength(1)
  act(()=>reply?.({data:{revision:messages[0].revision,result:response}} as MessageEvent<{revision:number;result:CadTopologyResult}>))
  expect(result.current.result).toBeNull()
  expect(messages).toHaveLength(2)
  expect(messages[1].input.beacons[0]).toMatchObject({x:102,easting:500051})
  expect(messages[1].input).not.toHaveProperty('titleBlock')
  act(()=>reply?.({data:{revision:messages[1].revision,result:{...response,networkLengthM:99}}} as MessageEvent<{revision:number;result:CadTopologyResult}>))
  expect(result.current.result?.networkLengthM).toBe(99)
  expect(result.current.loading).toBe(false)
})

test('terminates its owned worker when the editor unmounts', () => {
  const {unmount}=renderHook(()=>useCadTopology(exportDrawing()))
  unmount()
  expect(terminate).toHaveBeenCalledTimes(1)
})

test('passes the explicitly registered custom CRS definition into the isolated worker', () => {
  const code='LOCAL:CAD-WORKER-QA'
  const def='+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs'
  registerCrs({code,name:'Synthetic local grid',datum:'WGS 84',units:'metres',projected:true},def)
  const input={...exportDrawing(),coordinateReferenceSystem:code}
  renderHook(()=>useCadTopology(input))
  expect(messages[0].input).toMatchObject({registeredCrs:{info:{code,units:'metres',projected:true},def}})
})
