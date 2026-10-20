import { getPendingCaptureDraft, reserveCaptureDraft, completeCaptureDraft } from './captureDraftIntent'
import type { CaptureBookRequest } from '@/lib/fieldbook/captureDraft'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
const request:CaptureBookRequest={projectId:project,bookId:'33333333-3333-4333-8333-333333333333',name:'Reviewed run',type:'leveling',bearingEncoding:'uninterpreted',acknowledgement:'create-draft-from-raw-v1',sources:[{batchId:'44444444-4444-4444-8444-444444444444',inputHash:'a'.repeat(64)}]}
const mockRecords=new Map<string,unknown>()
const clone=<T,>(value:T):T=>value===undefined?value:JSON.parse(JSON.stringify(value)) as T
let mockTail=Promise.resolve(),mockQuota=false
const mockDatabase={close:jest.fn(),get:jest.fn(async(_store:string,key:string)=>clone(mockRecords.get(key))),transaction:jest.fn(()=>{
  const start=mockTail
  let finish=()=>{}
  mockTail=new Promise<void>(resolve=>{finish=resolve})
  return {store:{get:async(key:string)=>{await start;return clone(mockRecords.get(key))},put:async(value:{key:string})=>{await start;if(mockQuota)throw new DOMException('full','QuotaExceededError');mockRecords.set(value.key,clone(value))},delete:async(key:string)=>{await start;mockRecords.delete(key)}},
    abort:()=>finish(),get done(){finish();return Promise.resolve()}}
})}
jest.mock('idb',()=>({openDB:jest.fn(async()=>mockDatabase)}))
beforeEach(()=>{mockRecords.clear();mockTail=Promise.resolve();mockQuota=false;jest.clearAllMocks()})

test('a retained key can be reopened without retaining raw observations or exposing another account or project',async()=>{
  await reserveCaptureDraft(actor,request)
  expect(await getPendingCaptureDraft(actor,project)).toEqual(request)
  expect(await getPendingCaptureDraft('55555555-5555-4555-8555-555555555555',project)).toBeNull()
  expect(await getPendingCaptureDraft(actor,'66666666-6666-4666-8666-666666666666')).toBeNull()
  expect(JSON.stringify([...mockRecords.values()])).not.toContain('rawForm')
})

test('competing reservations in one account and project recover one request rather than replacing it',async()=>{
  const other={...request,bookId:'77777777-7777-4777-8777-777777777777'}
  const kept=await Promise.all([reserveCaptureDraft(actor,request),reserveCaptureDraft(actor,other)])
  expect(kept[0]).toEqual(request);expect(kept[1]).toEqual(request)
  expect(mockDatabase.transaction).toHaveBeenCalledWith('requests','readwrite',{durability:'strict'})
})

test('completion removes only the exact acknowledged request, preserving a newer or different selection',async()=>{
  await reserveCaptureDraft(actor,request)
  expect(await completeCaptureDraft(actor,{...request,name:'Changed request'})).toBe(false)
  expect(await getPendingCaptureDraft(actor,project)).toEqual(request)
  expect(await completeCaptureDraft(actor,request)).toBe(true)
  expect(await getPendingCaptureDraft(actor,project)).toBeNull()
})

test('unreadable or tampered retained requests fail closed without being overwritten or removed',async()=>{
  await reserveCaptureDraft(actor,request)
  const key=`${actor}:${project}`,original=mockRecords.get(key) as Record<string,unknown>
  mockRecords.set(key,{...original,request:{...request,name:'Tampered'}})
  await expect(getPendingCaptureDraft(actor,project)).rejects.toThrow(/retained|creation/i)
  await expect(reserveCaptureDraft(actor,request)).rejects.toThrow(/retained|creation/i)
  expect(await completeCaptureDraft(actor,request)).toBe(false)
  expect(mockRecords.has(key)).toBe(true)
})

test('quota failure cannot claim a request was safely retained',async()=>{
  mockQuota=true
  await expect(reserveCaptureDraft(actor,request)).rejects.toThrow(/retain|storage/i)
  expect(await getPendingCaptureDraft(actor,project)).toBeNull()
})
