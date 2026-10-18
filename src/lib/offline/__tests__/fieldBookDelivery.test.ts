/** @jest-environment node */
import { syncObservations,getSyncStatus,type OfflineObservation } from '../fieldBookDB'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'
import { offlineObservationInputHash } from '@/lib/field/observationCapture'

const records=new Map<string,OfflineObservation>()
jest.mock('idb',()=>({openDB:jest.fn(async()=>({
  getAll:jest.fn(async()=>Array.from(records.values()).map(row=>({...row}))),
  put:jest.fn(async(_table:string,row:OfflineObservation)=>{records.set(row.id,{...row})}),
}))}))
const first:OfflineObservation={id:'first-device-id',projectId:'first-project',surveyType:'traverse',station:'STN-1',easting:0,northing:10,elevation:0,createdAt:'2026-10-18T08:00:00.000Z',syncedAt:null}
const other:OfflineObservation={...first,id:'other-device-id',projectId:'other-project'}
const ack=async(row:OfflineObservation)=>({ok:true,id:row.id,observationId:'11111111-1111-4111-8111-111111111111',batchId:'22222222-2222-4222-8222-222222222222',inputHash:await observationDeliveryHash(row as unknown as Record<string,unknown>),fieldVerified:false,replayed:false})
beforeEach(()=>{records.clear();records.set(first.id,{...first});records.set(other.id,{...other});global.fetch=jest.fn()})
test('only an exact raw-content receipt clears the selected project, including zero measurements',async()=>{
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(await ack(first)),{status:201}))
  expect(await observationDeliveryHash(first as unknown as Record<string,unknown>)).toBe(offlineObservationInputHash(first as unknown as Record<string,unknown>))
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({synced:1,failed:0,acknowledgedIds:[first.id]})
  expect(records.get(first.id)?.syncedAt).toEqual(expect.any(String));expect(records.get(first.id)?.elevation).toBe(0)
  expect(records.get(other.id)?.syncedAt).toBeNull()
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:1,synced:1,unsynced:0})
})
test.each(['empty','other-id','other-content','false-verified','malformed-json'])('HTTP success with %s leaves the raw device record pending',async scenario=>{
  const value=await ack(first)
  const bad=scenario==='empty'?{}:scenario==='other-id'?{...value,id:other.id}:scenario==='other-content'?{...value,inputHash:'f'.repeat(64)}:scenario==='false-verified'?{...value,fieldVerified:true}:value
  jest.mocked(fetch).mockResolvedValue(new Response(scenario==='malformed-json'?'not JSON':JSON.stringify(bad),{status:200}))
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({synced:0,failed:1,acknowledgedIds:[]})
  expect(records.get(first.id)?.syncedAt).toBeNull();expect(records.get(first.id)?.easting).toBe(0)
})
test('concurrent manual/timer sync reads a fresh queue and sends one delivery',async()=>{
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(await ack(first)),{status:201}))
  const results=await Promise.all([syncObservations(first.projectId),syncObservations(first.projectId)])
  expect(results.map(r=>r.synced)).toEqual([1,0]);expect(fetch).toHaveBeenCalledTimes(1)
})
test('an unknown historical delivery state stays pending instead of being counted as delivered',async()=>{
  records.set(first.id,{...first,syncedAt:undefined} as unknown as OfflineObservation)
  jest.mocked(fetch).mockRejectedValue(new Error('Connection interrupted'))
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({synced:0,failed:1})
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:1,synced:0,unsynced:1})
})
test('a historical timestamp without a receipt is retained as unconfirmed; a changed local copy cannot reuse an old receipt',async()=>{
  records.set(first.id,{...first,syncedAt:'2026-10-18T09:00:00Z'})
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:1,synced:0,unsynced:1})
  const deliveryReceipt=await ack(first)
  records.set(first.id,{...first,syncedAt:'2026-10-18T09:00:00Z',deliveryReceipt} as OfflineObservation)
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:1,synced:1,unsynced:0})
  records.set(first.id,{...records.get(first.id),elevation:undefined} as OfflineObservation)
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:1,synced:0,unsynced:1})
})

test('a rejected capture is retained without repeated automatic HTTP requests',async()=>{
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error:'Retain both copies for review'}),{status:409}))
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({failed:1})
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({synced:0,failed:0,deferred:1})
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(records.get(first.id)?.syncedAt).toBeNull()
  expect(records.get(first.id)?.easting).toBe(0)
})

test('transient failures wait before automatic retries rather than immediately resending',async()=>{
  const clock=jest.spyOn(Date,'now').mockReturnValue(1000000)
  try{
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error:'Try later'}),{status:503}))
    await syncObservations(first.projectId)
    await syncObservations(first.projectId)
    expect(fetch).toHaveBeenCalledTimes(1)
    clock.mockReturnValue(1030001)
    await syncObservations(first.projectId)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock.mockReturnValue(1060001)
    await syncObservations(first.projectId)
    expect(fetch).toHaveBeenCalledTimes(2)
  }finally{clock.mockRestore()}
})

test('a large queue sends at most twenty records per pass and preserves the rest',async()=>{
  records.clear()
  for(let index=0;index<25;index++){const row={...first,id:`device-${index}`};records.set(row.id,row)}
  jest.mocked(fetch).mockImplementation(async(_url,init)=>{
    const row=JSON.parse(String(init?.body)) as OfflineObservation
    return new Response(JSON.stringify(await ack(row)),{status:201})
  })
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({synced:20,failed:0,deferred:5})
  expect(fetch).toHaveBeenCalledTimes(20)
  expect(records.size).toBe(25)
  await expect(getSyncStatus(first.projectId)).resolves.toEqual({total:25,synced:20,unsynced:5})
})

test('manual retry preserves raw hashes and does not remove a rejected device record',async()=>{
  const originalHash=await observationDeliveryHash(first as unknown as Record<string,unknown>)
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error:'Review conflict'}),{status:409}))
  await syncObservations(first.projectId)
  const pending=records.get(first.id) as OfflineObservation
  expect(pending.deliveryRetry?.blocked).toBe(true)
  expect(await observationDeliveryHash(pending as unknown as Record<string,unknown>)).toBe(originalHash)
  expect(offlineObservationInputHash(pending as unknown as Record<string,unknown>)).toBe(originalHash)
  await syncObservations(first.projectId,{retryBlocked:true})
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(records.get(first.id)?.syncedAt).toBeNull()
})

test('a throttling delay pauses later projects and survives another sync pass',async()=>{
  const clock=jest.spyOn(Date,'now').mockReturnValue(1000000)
  try{
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({error:'Rate limit'}),{status:429,headers:{'Retry-After':'90'}}))
    await syncObservations(first.projectId)
    await expect(syncObservations(other.projectId,{retryBlocked:true})).resolves.toMatchObject({deferred:1,failed:0})
    expect(fetch).toHaveBeenCalledTimes(1)
    clock.mockReturnValue(1090001)
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(await ack(other)),{status:201}))
    await expect(syncObservations(other.projectId)).resolves.toMatchObject({synced:1})
  }finally{clock.mockRestore()}
})

test('a failed connection stops the pass and retains the remaining queue',async()=>{
  const second={...first,id:'second-reading'}
  records.set(second.id,second)
  jest.mocked(fetch).mockRejectedValue(new Error('Network interrupted'))
  await expect(syncObservations(first.projectId)).resolves.toMatchObject({failed:1,deferred:1})
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(records.get(second.id)?.syncedAt).toBeNull()
})
