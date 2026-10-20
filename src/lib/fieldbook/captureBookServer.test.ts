/** @jest-environment node */
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { fieldObservationHash, offlineObservationInputHash } from '@/lib/field/observationCapture'
import { createBookFromCaptures, type CaptureBookRequest } from './captureBookServer'
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/enterprise/auditTrail',()=>({logAuditEvent:jest.fn()}))
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',batch='33333333-3333-4333-8333-333333333333',observation='44444444-4444-4444-8444-444444444444',bookId='55555555-5555-4555-8555-555555555555'
const raw={id:'device-source',projectId:project,surveyType:'leveling',station:'TP1',createdAt:'2026-10-21T08:00:00.000Z',backsightReading:0,rawForm:{station:'TP1',bs:'0.000',is:'1.5000',fs:'',remarks:'Retain'}}
const stored={id:observation,project_id:project,client_id:raw.id,easting:null,northing:null,elevation:null,observed_at:new Date(raw.createdAt)}
const input:CaptureBookRequest={projectId:project,bookId,name:'Reviewed level run',type:'leveling',bearingEncoding:'uninterpreted',acknowledgement:'create-draft-from-raw-v1',sources:[{batchId:batch,inputHash:offlineObservationInputHash(raw)}]}
let allowed=true,sourceChanged=false,skipInsert=false,previous:Record<string,unknown>|null=null
const query=jest.fn(async(sql:string,params?:unknown[])=>{
  if(sql.includes('lock_project_for_read'))return {rows:[{user_id:actor}]}
  if(sql.includes('field_observation_project_access'))return {rows:[{allowed}]}
  if(sql.includes('FROM fieldbooks'))return {rows:previous?[previous]:[]}
  if(sql.includes('FROM observation_batches'))return {rows:[{id:batch,created_by:actor,quality_metadata:{kind:'offline_field_observation',raw,inputHash:offlineObservationInputHash(raw),observationId:observation,storedObservationHash:fieldObservationHash(stored),capturedBy:null,uploadedBy:actor,projectReference:null}}]}
  if(sql.includes('FROM survey_observations'))return {rows:[{...stored,...(sourceChanged?{elevation:999}:{})}]}
  if(sql.includes('INSERT INTO fieldbooks'))return {rows:skipInsert?[]:[{id:bookId,project_id:project,user_id:actor,name:input.name,type:input.type,data:JSON.parse(String(params?.[5])) as unknown}]}
  return {rows:[]}
})
beforeEach(()=>{allowed=true;sourceChanged=false;skipInsert=false;previous=null;jest.clearAllMocks();jest.mocked(logAuditEvent).mockResolvedValue('audit');jest.mocked(db.transaction).mockImplementation(async work=>work({query} as never))})

test('a reviewed book is created from verified archived sources and retains unknown authorship and exact input',async()=>{
  const result=await createBookFromCaptures(actor,input)
  expect(result.book).toMatchObject({id:bookId,user_id:actor,project_id:project,data:{openingRL:'',distanceKm:'',rows:[{station:'TP1',bs:'0.000',is:'1.5000'}],sourceImport:{reviewedBy:actor,fieldVerified:false,sources:[{capturedBy:null,raw,inputHash:input.sources[0].inputHash}]}}})
  expect(query.mock.calls.some(([sql])=>/^\s*(UPDATE|DELETE)\b/.test(sql))).toBe(false)
  expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({resourceType:'fieldbooks',resourceId:bookId,userId:actor}),expect.anything())
})
test('a viewer cannot even inspect or create a source-linked book',async()=>{
  allowed=false
  await expect(createBookFromCaptures(actor,input)).rejects.toMatchObject({statusCode:403})
  expect(query.mock.calls.some(([sql])=>sql.includes('FROM observation_batches')||sql.includes('INSERT'))).toBe(false)
})
test('source content and the actual stored observation must match their original receipt',async()=>{
  await expect(createBookFromCaptures(actor,{...input,sources:[{batchId:batch,inputHash:'f'.repeat(64)}]})).rejects.toMatchObject({statusCode:409})
  sourceChanged=true
  await expect(createBookFromCaptures(actor,input)).rejects.toMatchObject({statusCode:409})
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false)
})
test('a missing insert acknowledgement or failed audit cannot report a committed draft',async()=>{
  skipInsert=true
  await expect(createBookFromCaptures(actor,input)).rejects.toThrow(/acknowledge/i)
  skipInsert=false;jest.mocked(logAuditEvent).mockRejectedValueOnce(new Error('Audit write failed'))
  await expect(createBookFromCaptures(actor,input)).rejects.toThrow('Audit write failed')
})
test('an exact creation retry returns the existing book without overwriting later edits',async()=>{
  const first=await createBookFromCaptures(actor,input)
  previous={...first.book,data:{...(first.book.data as Record<string,unknown>),openingRL:'100.250'}}
  query.mockClear()
  const replay=await createBookFromCaptures(actor,input)
  expect(replay).toMatchObject({replayed:true,book:{data:{openingRL:'100.250'}}})
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO fieldbooks'))).toBe(false)
  await expect(createBookFromCaptures(actor,{...input,name:'Different requested book'})).rejects.toMatchObject({statusCode:409})
})
