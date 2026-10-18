/** @jest-environment node */
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { commitPointImport, pointImportReferenceHash } from '../pointImportServer'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'

jest.mock('@/lib/db',()=>({db:{transaction:jest.fn(),query:jest.fn()}}))
jest.mock('@/lib/enterprise/auditTrail',()=>({logAuditEvent:jest.fn().mockResolvedValue('audit')}))
const project='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333'
const reference={horizontal_crs:'EPSG:32737',horizontal_name:'Synthetic WGS84',datum_name:'WGS84',zone:37,hemisphere:'S',distance_mode:'grid',coordinate_precision:3,vertical_datum:'Synthetic BM',vertical_reference:'local'}
const sourceText='id,easting,northing,elevation\nP1,500000,9850000,'
const request=()=>({requestId,fileName:'points.csv',sourceText,fileSize:Buffer.byteLength(sourceText),sourceFileHash:createHash('sha256').update(sourceText).digest('hex'),selectedIndices:[0],options:{},sourceCrs:'EPSG:32737',coordinateUnit:'metres',heightUnit:'metres',expectedReferenceHash:pointImportReferenceHash(reference),confirmTransformation:false,confirmVerticalDatum:false,confirmWarnings:false})
let owner=actor,existingNames=false,receipt:Record<string,unknown>|null=null
const query=jest.fn(async(sql:string)=>{
  if(sql.includes('FROM projects'))return {rows:[{user_id:owner}]}
  if(sql.includes('FROM observation_batches'))return {rows:receipt?[receipt]:[]}
  if(sql.includes('FROM project_reference_systems'))return {rows:[reference]}
  if(sql.includes('FROM survey_points'))return {rows:existingNames?[{point_name:'P1'}]:[]}
  if(sql.includes('INSERT INTO survey_points'))return {rows:[{id:'44444444-4444-4444-8444-444444444444',point_name:'P1'}],rowCount:1}
  if(sql.includes('INSERT INTO import_sessions')||sql.includes('INSERT INTO observation_batches'))return {rows:[{id:requestId}],rowCount:1}
  return {rows:[],rowCount:1}
})
beforeEach(()=>{
  owner=actor;existingNames=false;receipt=null;query.mockClear();jest.mocked(logAuditEvent).mockClear()
  jest.mocked(db.transaction).mockImplementation(async work=>work({query} as never))
})
test('commits points, source capture and audit using one transaction and acknowledges actual returned IDs',async()=>{
  const result=await commitPointImport(project,actor,request())
  expect(result).toMatchObject({requestId,imported:1,replayed:false,pointIds:['44444444-4444-4444-8444-444444444444']})
  expect(db.transaction).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0][0]).toMatch(/FROM projects.*FOR UPDATE/)
  expect(query.mock.calls.some(([sql])=>sql.includes('project_reference_systems')&&sql.includes('FOR SHARE'))).toBe(true)
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO import_sessions'))).toBe(true)
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO observation_batches'))).toBe(true)
  expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({resourceType:'observation_batches',resourceId:requestId}),expect.objectContaining({query}))
})
test('rejects another owner before inspecting reference or writing source data',async()=>{
  owner='another-owner'
  await expect(commitPointImport(project,actor,request())).rejects.toMatchObject({statusCode:404})
  expect(query.mock.calls).toHaveLength(1)
})
test('rejects stale reference and existing point names without writes',async()=>{
  await expect(commitPointImport(project,actor,{...request(),expectedReferenceHash:'f'.repeat(64)})).rejects.toMatchObject({statusCode:409})
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false)
  query.mockClear();existingNames=true
  await expect(commitPointImport(project,actor,request())).rejects.toMatchObject({statusCode:409})
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false)
})
test('a mismatched source hash is rejected before opening a transaction',async()=>{
  jest.mocked(db.transaction).mockClear()
  await expect(commitPointImport(project,actor,{...request(),sourceFileHash:'f'.repeat(64)})).rejects.toMatchObject({statusCode:400})
  expect(db.transaction).not.toHaveBeenCalled()
})
test('an incomplete database acknowledgement cannot be reported as success',async()=>{
  query.mockImplementationOnce(async()=>({rows:[{user_id:actor}]}))
  const normal=query.getMockImplementation()
  if(!normal)throw new Error('Expected the synthetic query implementation')
  query.mockImplementation(async sql=>sql.includes('INSERT INTO survey_points')?{rows:[],rowCount:0}:normal(sql))
  await expect(commitPointImport(project,actor,request())).rejects.toThrow(/acknowledge/i)
  query.mockImplementation(normal)
})
test.each(['import_sessions','observation_batches'])('a missing %s acknowledgement cannot produce a receipt',async table=>{
  const normal=query.getMockImplementation()
  if(!normal)throw new Error('Expected the synthetic query implementation')
  query.mockImplementation(async sql=>sql.includes(`INSERT INTO ${table}`)?{rows:[],rowCount:0}:normal(sql))
  try {await expect(commitPointImport(project,actor,request())).rejects.toMatchObject({code:'POINT_IMPORT_ACKNOWLEDGEMENT'})}
  finally {query.mockImplementation(normal)}
  expect(logAuditEvent).not.toHaveBeenCalled()
})
test('a legacy receipt with unknown metadata refuses an ID collision cleanly',async()=>{
  receipt={id:requestId,created_by:actor,point_count:null,quality_metadata:null}
  await expect(commitPointImport(project,actor,request())).rejects.toMatchObject({statusCode:409})
})
