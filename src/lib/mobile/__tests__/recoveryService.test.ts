/** @jest-environment node */
import { offlineStorage, type SyncQueueItem } from '../offlineStorage'
import { listLegacyWork, selectLegacyWork, reviewLegacyWork } from '../recoveryService'
import { legacySourceHash } from '../legacyReview'
jest.mock('../offlineStorage', () => ({ offlineStorage: { getLegacyQueuePage: jest.fn(), get: jest.fn(), queueLegacyReview: jest.fn() } }))
jest.mock('../syncService', () => ({ syncService: { syncPending: jest.fn(), getSyncStatus: jest.fn(() => ({ message: null })) } }))
const actor='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222'
const item:SyncQueueItem={id:'legacy',recordId:'P1',type:'field_observation',action:'create',data:{id:'P1',pointName:'P1',projectId:project,observationType:'manual',timestamp:Date.parse('2026-10-20T08:00:00Z'),easting:0,northing:10}}
const originalFetch=global.fetch
beforeEach(()=>{
  jest.clearAllMocks()
  global.fetch=jest.fn(async()=>new Response(JSON.stringify({actorId:actor,projectId:project,canReview:true})))
  jest.mocked(offlineStorage.getLegacyQueuePage).mockResolvedValue({items:[],next:null})
  jest.mocked(offlineStorage.get).mockResolvedValue(item)
})
afterAll(()=>{global.fetch=originalFetch})
test('a transport timeout gives actionable authorization guidance without reading device sources',async()=>{
  jest.mocked(fetch).mockRejectedValueOnce(new DOMException('signal timed out','TimeoutError'))
  await expect(listLegacyWork(actor,project)).rejects.toThrow('Could not verify current field-recording access')
  expect(offlineStorage.getLegacyQueuePage).not.toHaveBeenCalled()
  expect(offlineStorage.get).not.toHaveBeenCalled()
  expect(offlineStorage.queueLegacyReview).not.toHaveBeenCalled()
})
test('failed or mismatched project authorization never inspects local legacy payloads',async()=>{
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({error:'Denied'}),{status:403}))
  await expect(listLegacyWork(actor,project)).rejects.toThrow()
  expect(offlineStorage.getLegacyQueuePage).not.toHaveBeenCalled()
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({actorId:'other',projectId:project,canReview:true})))
  await expect(selectLegacyWork(actor,project,'legacy')).rejects.toThrow()
  expect(offlineStorage.get).not.toHaveBeenCalled()
})
test('a permitted project can inspect one original source without assigning its owner',async()=>{
  const selected=await selectLegacyWork(actor,project,'legacy')
  expect(selected.item.data).toEqual(item.data)
  expect(selected.sourceHash).toBe(await legacySourceHash(item))
  expect(selected.item.data).not.toHaveProperty('ownerId')
  expect(offlineStorage.queueLegacyReview).not.toHaveBeenCalled()
})
test('a stale selection cannot queue a different source or an attributed capture',async()=>{
  const hash=await legacySourceHash(item)
  jest.mocked(offlineStorage.get).mockResolvedValue({...item,data:{...(item.data as Record<string,unknown>),easting:99}})
  await expect(reviewLegacyWork(actor,project,{item,sourceHash:hash})).rejects.toThrow()
  expect(offlineStorage.queueLegacyReview).not.toHaveBeenCalled()
})
