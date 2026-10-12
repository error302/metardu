import * as factory from '@/lib/workers/tinWorkerFactory'
import {triangulateAsync,_resetForTests} from '../tinWorkerClient'
import {_handleRequest} from '../tinWorker'

const points=[{name:'A',easting:0,northing:0,elevation:100},{name:'B',easting:10,northing:0,elevation:101},{name:'C',easting:0,northing:10,elevation:102}]
const oldWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker')
beforeEach(()=>{_resetForTests();Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:function SyntheticWorker(){}})})
afterEach(()=>{_resetForTests();jest.restoreAllMocks();if(oldWorker)Object.defineProperty(globalThis,'Worker',oldWorker);else delete (globalThis as unknown as {Worker?:unknown}).Worker})
function fakeWorker(reply:'success'|'crash'|'silent'){
  const worker={onmessage:null as null|((event:MessageEvent)=>void),onerror:null as null|((event:ErrorEvent)=>void),terminate:jest.fn(),postMessage:jest.fn((message:Parameters<typeof _handleRequest>[0])=>{
    if(reply==='success')queueMicrotask(()=>worker.onmessage?.({data:{id:message.id,ok:true,result:_handleRequest(message)}} as MessageEvent))
    if(reply==='crash')queueMicrotask(()=>worker.onerror?.(new ErrorEvent('error',{message:'synthetic worker crash'})))
  })}
  jest.spyOn(factory,'createTinWorker').mockReturnValue(worker as unknown as Worker)
  return worker
}
test('reports worker execution only after a successful worker response',async()=>{
  fakeWorker('success');const mode=jest.fn()
  const result=await triangulateAsync(points,undefined,{onExecutionMode:mode})
  expect(result).toHaveLength(1);expect(mode).toHaveBeenCalledTimes(1);expect(mode).toHaveBeenCalledWith('worker')
})
test('worker crash returns real fallback geometry and reports main-thread execution',async()=>{
  const worker=fakeWorker('crash'),mode=jest.fn()
  const result=await triangulateAsync(points,undefined,{onExecutionMode:mode})
  expect(result).toHaveLength(1);expect(mode).toHaveBeenCalledTimes(1);expect(mode).toHaveBeenCalledWith('main-thread');expect(worker.terminate).toHaveBeenCalled()
})
test('timeout reports fallback and ignores a late worker success',async()=>{
  const worker=fakeWorker('silent'),mode=jest.fn()
  const result=await triangulateAsync(points,undefined,{timeoutMs:5,onExecutionMode:mode})
  expect(result).toHaveLength(1);expect(mode).toHaveBeenCalledWith('main-thread')
  worker.onmessage?.({data:{id:worker.postMessage.mock.calls[0][0].id,ok:true,result:[]}} as MessageEvent)
  expect(mode).toHaveBeenCalledTimes(1)
})
test('explicit synchronous execution cannot be labelled as background work',async()=>{
  const mode=jest.fn();const result=await triangulateAsync(points,undefined,{forceSync:true,onExecutionMode:mode})
  expect(result).toHaveLength(1);expect(mode).toHaveBeenCalledWith('main-thread')
})
