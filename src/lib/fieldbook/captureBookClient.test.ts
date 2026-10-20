/** @jest-environment node */
import { createCaptureBook, listCaptureSources, inspectCaptureSource } from './captureBookClient'
import { createCaptureDraftData, type BookCaptureSource, type CaptureBookRequest } from './captureDraft'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',batch='33333333-3333-4333-8333-333333333333',bookId='44444444-4444-4444-8444-444444444444'
const source:BookCaptureSource={batchId:batch,observationId:bookId,projectId:project,clientId:'device',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,raw:{id:'device',projectId:project,station:'P0',surveyType:'leveling',backsightReading:0}}
const input:CaptureBookRequest={bookId,projectId:project,name:'Draft run',type:'leveling',bearingEncoding:'uninterpreted',acknowledgement:'create-draft-from-raw-v1',sources:[{batchId:batch,inputHash:source.inputHash}]}
const originalFetch=global.fetch
beforeEach(()=>{global.fetch=jest.fn()})
afterAll(()=>{global.fetch=originalFetch})
test('source requests bind the reviewing account and never trust a successful unrelated response',async()=>{
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({items:[],next:null})))
  await expect(listCaptureSources(actor,project)).resolves.toEqual({items:[],next:null})
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`projectId=${project}`),expect.objectContaining({headers:{'X-Metardu-Expected-User':actor},cache:'no-store'}))
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({source:{...source,projectId:actor}})))
  await expect(inspectCaptureSource(actor,project,batch)).rejects.toThrow()
})
test('book creation requires an exact returned book and content-bound source-import acknowledgement',async()=>{
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({book:{id:bookId},replayed:false})))
  await expect(createCaptureBook(actor,input)).rejects.toThrow()
  const data=createCaptureDraftData('leveling',[source],{actorId:actor,reviewedAt:'2026-10-21T08:00:00.000Z',requestHash:await observationDeliveryHash(input),bearingEncoding:'uninterpreted'})
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({book:{id:bookId,user_id:actor,project_id:project,type:'leveling',name:'Draft run',data},replayed:false})))
  await expect(createCaptureBook(actor,input)).resolves.toMatchObject({id:bookId,data:{sourceImport:{fieldVerified:false}}})
})
test('interrupted creation never claims the new draft was absent or the original book was removed',async()=>{
  jest.mocked(fetch).mockRejectedValueOnce(new DOMException('signal timed out','TimeoutError'))
  await expect(createCaptureBook(actor,input)).rejects.toThrow(/confirm|interrupted/i)
})

test('a rejected mapping preserves the server code needed to release only a proven absent draft',async()=>{
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({error:'Incompatible capture mode',code:'FIELD_CAPTURE_MAPPING'}),{status:422}))
  await expect(createCaptureBook(actor,input)).rejects.toMatchObject({status:422,code:'FIELD_CAPTURE_MAPPING'})
})
