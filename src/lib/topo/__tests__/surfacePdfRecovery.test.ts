/** @jest-environment node */
import type {PoolClient} from 'pg'
import {createHash} from 'node:crypto'
import {db} from '@/lib/db'
import {downloadFile,uploadFile,deleteFile} from '@/lib/storage'
import {checkFeatureAccess} from '@/lib/subscription/subscriptionEngine'
import {loadSurfaceRevision} from '../surfaceRevision'
import {renderSurfaceDrawingPdf} from '../surfaceDrawingPdf'
import {registerDeliverable} from '@/lib/deliverables/deliverableRegister'
import {executeSurfaceExport} from '../surfaceExport'
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn(),query:jest.fn()}}))
jest.mock('@/lib/subscription/subscriptionEngine',()=>({checkFeatureAccess:jest.fn()}))
jest.mock('@/lib/storage',()=>({uploadFile:jest.fn(),downloadFile:jest.fn(),deleteFile:jest.fn()}))
jest.mock('@/lib/logger',()=>({logger:{error:jest.fn()}}))
jest.mock('../surfaceDrawing',()=>({buildSurfaceRevisionDrawing:()=>({entities:[],layers:[],layout:{}})}))
jest.mock('../surfaceDrawingPdf',()=>({renderSurfaceDrawingPdf:jest.fn()}))
jest.mock('../surfaceRevision',()=>({loadSurfaceRevision:jest.fn(),hashSurfaceValue:()=> 'a'.repeat(64)}))
jest.mock('@/lib/deliverables/deliverableRegister',()=>({hashDeliverableContent:(b:Buffer)=>jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256').update(b).digest('hex'),registerDeliverable:jest.fn()}))
const user='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333',request='44444444-4444-4444-8444-444444444444',surface='55555555-5555-4555-8555-555555555555'
const syntheticCrs='EPSG:21037'
const body={projectId:project,surfaceRevisionId:revision,requestId:request,expectedUserId:user,format:'pdf' as const}
const bytes=Buffer.from('%PDF-1.7 synthetic retained data'),hash=createHash('sha256').update(bytes).digest('hex')
const filename=`surface-${surface}-R1.pdf`,storage=`surface-exports/${user}/${project}/${revision}/0123456789abcdef-${filename}`
function setup(contents=bytes){
 const row={source_revision:revision,manifest:{request:{id:request,userId:user,payloadHash:'a'.repeat(64)},surface_revision_id:revision},generator:'surface-revision-pdf',storage_path:storage,content_hash:hash,bytes:bytes.length,deliverable_id:'retained',revision:1}
 const query=jest.fn(async(sql:string)=>({rows:sql.startsWith('SELECT user_id FROM projects')?[{user_id:user}]:sql.includes('SELECT r.* FROM deliverable_revisions')?[row]:sql.startsWith('SELECT user_id,project_id,filename')?[{user_id:user,project_id:project,filename,sha256:hash,size_bytes:bytes.length}]:[]}))
 jest.mocked(db.transaction).mockImplementation(async fn=>fn({query} as unknown as PoolClient));jest.mocked(downloadFile).mockResolvedValue(contents)
}
beforeEach(()=>jest.resetAllMocks())
test('recovers the exact registered PDF with no new entitlement or upload',async()=>{setup();const result=await executeSurfaceExport(body,user,true);expect(result.bytes).toEqual(bytes);expect(result.replayed).toBe(true);expect(result.filename).toBe(filename)})
test('refuses altered retained bytes instead of silently regenerating a PDF',async()=>{setup(Buffer.from('%PDF-1.7 altered retained data'));await expect(executeSurfaceExport(body,user,true)).rejects.toThrow(/different or inconsistent/)})

test('preserves uploaded bytes if commit acknowledgement and register lookup are both unavailable',async()=>{
 const query=jest.fn(async(sql:string)=>({rows:sql.startsWith('SELECT user_id FROM projects')?[{user_id:user}]:[]}))
 jest.mocked(db.transaction).mockImplementation(async fn=>{await fn({query} as unknown as PoolClient);throw new Error('commit acknowledgement lost')})
 jest.mocked(db.query).mockRejectedValue(new Error('database unreachable'))
 jest.mocked(checkFeatureAccess).mockResolvedValue({allowed:true,reason:'Eligible'})
 jest.mocked(loadSurfaceRevision).mockResolvedValue({surfaceId:surface,revision:1,name:'Synthetic',crs:syntheticCrs,verticalDatum:'Local',inputHash:'a'.repeat(64),outputIntegrity:{},snapshot:{referenceHash:'b'.repeat(64),observations:[]},contours:[]} as never)
 jest.mocked(renderSurfaceDrawingPdf).mockResolvedValue(bytes)
 jest.mocked(uploadFile).mockResolvedValue(storage);jest.mocked(downloadFile).mockResolvedValue(bytes)
 jest.mocked(registerDeliverable).mockResolvedValue({deliverable:{id:'retained'},revision:{revision:1}} as never)
 query.mockImplementation(async(sql:string)=>sql.startsWith('INSERT INTO file_uploads')?{rows:[{id:request,user_id:user,project_id:project,storage_path:storage,sha256:hash,size_bytes:bytes.length}],rowCount:1}:{rows:sql.startsWith('SELECT user_id FROM projects')?[{user_id:user}]:[]} as never)
 await expect(executeSurfaceExport(body,user)).rejects.toThrow('commit acknowledgement lost')
 expect(deleteFile).not.toHaveBeenCalled()
})

test('new PDF registration binds saved revision, content and unapproved draft evidence',async()=>{
 const query=jest.fn(async(sql:string)=>sql.startsWith('INSERT INTO file_uploads')?{rows:[{id:request,user_id:user,project_id:project,storage_path:storage,sha256:hash,size_bytes:bytes.length}],rowCount:1}:{rows:sql.startsWith('SELECT user_id FROM projects')?[{user_id:user}]:[]})
 jest.mocked(db.transaction).mockImplementation(async fn=>fn({query} as unknown as PoolClient))
 jest.mocked(checkFeatureAccess).mockResolvedValue({allowed:true,reason:'Eligible'})
 jest.mocked(loadSurfaceRevision).mockResolvedValue({surfaceId:surface,revision:1,name:'Synthetic',crs:syntheticCrs,verticalDatum:'Local',inputHash:'a'.repeat(64),outputIntegrity:{},snapshot:{referenceHash:'b'.repeat(64),observations:[]},contours:[]} as never)
 jest.mocked(renderSurfaceDrawingPdf).mockResolvedValue(bytes);jest.mocked(uploadFile).mockResolvedValue(storage);jest.mocked(downloadFile).mockResolvedValue(bytes)
 jest.mocked(registerDeliverable).mockResolvedValue({deliverable:{id:'retained'},revision:{revision:1}} as never)
 const result=await executeSurfaceExport(body,user)
 expect(result).toMatchObject({contentHash:hash,filename,replayed:false,deliverableId:'retained'})
 const registration=jest.mocked(registerDeliverable).mock.calls[0]?.[0]
 expect(registration).toMatchObject({projectId:project,sourceRevision:revision,content:bytes,storagePath:storage,generator:'surface-revision-pdf',manifest:{surface_revision_id:revision,field_verified:false,professional_approval:false,output_format:'pdf'}})
})
