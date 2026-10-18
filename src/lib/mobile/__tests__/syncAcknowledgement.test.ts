import { syncService } from '../syncService'
import { offlineStorage,type SyncQueueItem } from '../offlineStorage'
import { createClient } from '@/lib/api-client/client'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'

jest.mock('../offlineStorage',()=>({offlineStorage:{recoverStaleSyncItems:jest.fn(),getPendingSyncItems:jest.fn(),retryFailedSyncItems:jest.fn(),updateSyncStatus:jest.fn(),removeFromSyncQueue:jest.fn(),update:jest.fn()}}))
jest.mock('../photoUpload',()=>({uploadFieldPhoto:jest.fn().mockResolvedValue('owned/synthetic-photo.jpg')}))
jest.mock('@/lib/api-client/client',()=>({createClient:jest.fn()}))
const rowId='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
const payload={id:'device-01',projectId:project,pointName:'P1',observationType:'manual',easting:0,northing:10,elevation:0,timestamp:Date.parse('2026-10-18T08:00:00Z')}
const pending=(type:SyncQueueItem['type'],data:unknown=payload):SyncQueueItem=>({id:'queued-01',recordId:'device-01',type,action:'create',data,status:'pending'})
const single=jest.fn(),select=jest.fn(()=>({single})),upsert=jest.fn(()=>({select}))
beforeEach(()=>{
  jest.clearAllMocks();jest.mocked(createClient).mockReturnValue({from:()=>({upsert})} as unknown as ReturnType<typeof createClient>)
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([pending('field_observation')])
  global.fetch=jest.fn();jest.spyOn(console,'error').mockImplementation(()=>undefined)
})
afterEach(()=>jest.restoreAllMocks())
test('raw mobile observations use the bound receipt path and retain zero readings',async()=>{
  const capture={...payload,surveyType:'unspecified',station:payload.pointName,pointId:payload.pointName,createdAt:new Date(payload.timestamp).toISOString()}
  const receipt={ok:true,id:payload.id,observationId:rowId,batchId:'33333333-3333-4333-8333-333333333333',inputHash:await observationDeliveryHash(capture),fieldVerified:false,replayed:false}
  jest.mocked(fetch).mockResolvedValue({ok:true,json:async()=>receipt} as Response)
  await expect(syncService.forceSync()).resolves.toEqual({synced:1,failed:0})
  expect(upsert).not.toHaveBeenCalled()
  const request:unknown=JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))
  expect(request).toMatchObject({easting:0,elevation:0,pointName:'P1',station:'P1'})
  expect(offlineStorage.removeFromSyncQueue).toHaveBeenCalledWith('queued-01')
})
test('successful HTTP without a matching content receipt keeps the device observation and queue',async()=>{
  jest.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({ok:true})} as Response)
  await expect(syncService.forceSync()).resolves.toEqual({synced:0,failed:1})
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled();expect(offlineStorage.update).not.toHaveBeenCalled()
})
test.each(['photo','survey_point'] as const)('%s upsert without a returned record cannot clear pending work',async type=>{
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([pending(type,{...payload,id:rowId,data:'synthetic-only',name:'P1'})])
  single.mockResolvedValue({data:null,error:null})
  await expect(syncService.forceSync()).resolves.toEqual({synced:0,failed:1})
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled();expect(offlineStorage.update).not.toHaveBeenCalled()
})
test('photo metadata acknowledgement must bind the same project, client and uploaded path',async()=>{
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([pending('photo',{...payload,data:'synthetic-only'})])
  single.mockResolvedValue({data:{id:rowId,client_id:payload.id,project_id:project,storage_path:'owned/synthetic-photo.jpg'},error:null})
  await expect(syncService.forceSync()).resolves.toEqual({synced:1,failed:0})
  expect(offlineStorage.update).toHaveBeenCalledWith('photos',payload.id,{synced:true,storagePath:'owned/synthetic-photo.jpg'})
})
test('unknown record types and unsupported deletions stay available for recovery',async()=>{
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([{...pending('field_observation'),type:'unknown' as SyncQueueItem['type']},{...pending('field_observation'),id:'queued-delete',action:'delete'}])
  await expect(syncService.forceSync()).resolves.toEqual({synced:0,failed:2})
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})
