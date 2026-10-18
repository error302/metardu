/** @jest-environment node */
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { recordOfflineObservation } from '../observationCaptureServer'
import { offlineObservationSchema, offlineObservationInputHash } from '../observationCapture'

jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/enterprise/auditTrail',()=>({logAuditEvent:jest.fn().mockResolvedValue('audit')}))
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',observationId='33333333-3333-4333-8333-333333333333',batchId='44444444-4444-4444-8444-444444444444'
const input={id:'obs-device-01',projectId:project,surveyType:'traverse',station:'STN-1',foresight:'RD1',easting:0,northing:10,elevation:0,horizontalDistance:0,bearingDeg:0,bearingMin:0,bearingSec:0,notes:'METARDU_POINT_ID=RD1',createdAt:'2026-10-18T08:00:00.000Z',syncedAt:null}
let allowed=true,previous:Record<string,unknown>|null=null,skip=''
const query=jest.fn(async(sql:string,params?:unknown[])=>{
  if(sql.includes('lock_project_for_read'))return {rows:[{user_id:actor}]}
  if(sql.includes('field_observation_project_access'))return {rows:[{allowed}]}
  if(sql.includes('FROM observation_batches'))return {rows:previous?[previous]:[]}
  if(sql.includes('FROM project_reference_systems'))return {rows:[]}
  if(sql.includes('FROM survey_observations'))return {rows:[]}
  if(sql.includes('INSERT INTO survey_observations'))return {rows:skip==='observation'?[]:[{id:observationId,project_id:project,client_id:input.id,elevation:0,observed_at:new Date(input.createdAt)}]}
  if(sql.includes('INSERT INTO observation_batches'))return {rows:skip==='capture'?[]:[{id:String(params?.[0])}]}
  return {rows:[]}
})
beforeEach(()=>{allowed=true;previous=null;skip='';query.mockClear();jest.mocked(logAuditEvent).mockClear();jest.mocked(db.transaction).mockImplementation(async work=>work({query} as never))})
test('records raw observations and their capture atomically without inventing reviewed points or reference data',async()=>{
  const result=await recordOfflineObservation(actor,input)
  expect(result).toMatchObject({ok:true,id:input.id,observationId,replayed:false,fieldVerified:false})
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO survey_points'))).toBe(false)
  const capture=query.mock.calls.find(([sql])=>sql.includes('INSERT INTO observation_batches'))
  const metadata:unknown=JSON.parse(String(capture?.[1]?.find(value=>typeof value==='string'&&value.startsWith('{'))))
  expect(metadata).toMatchObject({kind:'offline_field_observation',raw:{easting:0,elevation:0,horizontalDistance:0},projectReference:null,capturedBy:null,uploadedBy:actor,fieldVerified:false})
  expect(logAuditEvent).toHaveBeenCalledTimes(1)
})
test('viewer or unrelated account is denied before any capture lookup or write',async()=>{
  allowed=false
  await expect(recordOfflineObservation(actor,input)).rejects.toMatchObject({statusCode:403})
  expect(query.mock.calls.some(([sql])=>sql.includes('FROM observation_batches')||sql.includes('INSERT'))).toBe(false)
})
test.each(['observation','capture'])('a silently skipped %s write cannot acknowledge delivery',async value=>{
  skip=value
  await expect(recordOfflineObservation(actor,input)).rejects.toMatchObject({code:'FIELD_OBSERVATION_ACKNOWLEDGEMENT'})
  expect(logAuditEvent).not.toHaveBeenCalled()
})
test('transport retry metadata does not change source identity; changed measurements do',()=>{
  expect(offlineObservationInputHash(input)).toBe(offlineObservationInputHash({...input,syncedAt:'later',syncError:'offline',updated_at:'later'}))
  expect(offlineObservationInputHash(input)).not.toBe(offlineObservationInputHash({...input,elevation:undefined}))
  expect(offlineObservationSchema.safeParse({...input,northing:undefined}).success).toBe(false)
})
test('browser geographic readings retain their declared source and remain unverified raw input',()=>{
  expect(offlineObservationSchema.safeParse({...input,easting:undefined,northing:undefined,surveyType:'gnss',observationType:'gps',latitude:0,longitude:0,observationSource:'browser_geolocation',accuracySource:'browser',accuracy:20}).success).toBe(true)
})
test('reused ID with another payload or uploader refuses overwrite',async()=>{
  previous={id:batchId,created_by:actor,quality_metadata:{kind:'offline_field_observation',inputHash:'f'.repeat(64)}}
  await expect(recordOfflineObservation(actor,input)).rejects.toMatchObject({statusCode:409})
  expect(query.mock.calls.some(([sql])=>sql.includes('UPDATE')||sql.includes('INSERT'))).toBe(false)
})
test('ambiguous legacy receipt keys refuse delivery rather than selecting an arbitrary capture',async()=>{
  const normal=query.getMockImplementation()
  if(!normal)throw new Error('Expected the controlled database fixture')
  query.mockImplementation(async(sql,params)=>sql.includes('FROM observation_batches')?{rows:[{id:batchId},{id:batchId}]}:normal(sql,params))
  try{await expect(recordOfflineObservation(actor,input)).rejects.toMatchObject({statusCode:409})}
  finally{query.mockImplementation(normal)}
})
