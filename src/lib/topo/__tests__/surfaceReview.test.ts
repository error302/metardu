/** @jest-environment node */
import type {PoolClient} from 'pg'
import {db} from '@/lib/db'
import {resolveProjectRoomAccess} from '@/lib/realtime/projectRoomAccess'
import {loadSurfaceRevision} from '../surfaceRevision'
import {readSurfaceReviews,submitSurfaceReview} from '../surfaceReview'
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/realtime/projectRoomAccess',()=>({resolveProjectRoomAccess:jest.fn()}))
jest.mock('../surfaceRevision',()=>({loadSurfaceRevision:jest.fn()}))
const projectId='22222222-2222-4222-8222-222222222222',sourceRevisionId='33333333-3333-4333-8333-333333333333'
const actorId='11111111-1111-4111-8111-111111111111',requestId='44444444-4444-4444-8444-444444444444',reviewId='55555555-5555-4555-8555-555555555555'
const inputHash='a'.repeat(64),outputHash='b'.repeat(64),referenceHash='c'.repeat(64)
const command={projectId,sourceRevisionId,expectedSourceHash:inputHash,requestId,outcome:'reviewed_for_draft' as const,note:'Checked synthetic source; internal draft review only.'}
const source={projectId,revisionId:sourceRevisionId,inputHash,surfaceId:reviewId,outputIntegrity:{algorithm:'sha256-canonical-json-v1',contoursHash:outputHash,meshHash:outputHash},snapshot:{referenceHash}}
const query=jest.fn<Promise<{rows:Array<Record<string,unknown>>;rowCount?:number}>,[sql:string,args?:unknown[]]>()
let stored:Record<string,unknown>|null=null
beforeEach(()=>{
  jest.resetAllMocks();stored=null
  jest.mocked(resolveProjectRoomAccess).mockResolvedValue('project_manager')
  jest.mocked(loadSurfaceRevision).mockResolvedValue(source as Awaited<ReturnType<typeof loadSurfaceRevision>>)
  query.mockImplementation(async(sql:string,args?:unknown[])=>{
    if(sql.includes('lock_project_for_read'))return {rows:[{user_id:actorId}]}
    if(sql.includes('surface_review_project_access'))return {rows:[{allowed:true}]}
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]}
    if(sql.includes('SELECT * FROM surface_source_reviews'))return {rows:stored?[stored]:[]}
    if(sql.includes('current_revision_id'))return {rows:[{current_revision_id:sourceRevisionId,revision:1,latest_revision:1}]}
    if(sql.includes('INSERT INTO surface_source_reviews')){
      stored={id:args?.[0],project_id:projectId,source_revision_id:sourceRevisionId,source_hash:inputHash,
        source_reference_hash:referenceHash,source_output_hash:args?.[6],source_output_evidence:args?.[11],actor_id:actorId,request_id:requestId,command_hash:args?.[8],outcome:command.outcome,note:command.note,created_at:new Date('2026-11-06T09:00:00Z')}
      return {rows:[stored],rowCount:1}
    }
    throw new Error('Unexpected test query: '+sql)
  })
  jest.mocked(db.transaction).mockImplementation(async fn=>fn({query} as unknown as PoolClient))
})
test('binds a new attributed review to the exact retained source and preserves raw observations',async()=>{
  const result=await submitSurfaceReview(command,actorId)
  expect(result).toMatchObject({sourceRevisionId,sourceHash:inputHash,actorId,outcome:'reviewed_for_draft',replayed:false})
  expect(loadSurfaceRevision).toHaveBeenCalledWith(projectId,sourceRevisionId,expect.objectContaining({query}))
  expect(query.mock.calls.some(([sql])=>/UPDATE|DELETE.*survey_observations/i.test(String(sql)))).toBe(false)
})
test('identical request replay returns the original record without another insert',async()=>{
  const first=await submitSurfaceReview(command,actorId),second=await submitSurfaceReview(command,actorId)
  expect(second).toMatchObject({id:first.id,replayed:true})
  expect(query.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO surface_source_reviews'))).toHaveLength(1)
})
test('request identity cannot be reused with a changed outcome or note',async()=>{
  await submitSurfaceReview(command,actorId)
  await expect(submitSurfaceReview({...command,note:'Different review'},actorId)).rejects.toMatchObject({statusCode:409})
})
test.each(['viewer',null] as const)('role %p cannot create a review or enter a write transaction',async role=>{
  jest.mocked(resolveProjectRoomAccess).mockResolvedValue(role)
  await expect(submitSurfaceReview(command,actorId)).rejects.toMatchObject({statusCode:403})
  expect(db.transaction).not.toHaveBeenCalled()
})
test('stale source hash is rejected before any review is inserted',async()=>{
  await expect(submitSurfaceReview({...command,expectedSourceHash:outputHash},actorId)).rejects.toMatchObject({statusCode:409})
  expect(stored).toBeNull()
})
test('superseded source is rejected before any review is inserted',async()=>{
  const normal=query.getMockImplementation()
  if(!normal)throw new Error('Test query handler is missing')
  query.mockImplementation(async(sql:string,args?:unknown[])=>sql.includes('current_revision_id')?{rows:[{current_revision_id:reviewId,revision:2,latest_revision:2}]}:normal(sql,args))
  await expect(submitSurfaceReview(command,actorId)).rejects.toMatchObject({statusCode:409})
  expect(stored).toBeNull()
})
test('database permission recheck can deny a role revoked after HTTP access resolution',async()=>{
  query.mockResolvedValueOnce({rows:[]})
  await expect(submitSurfaceReview(command,actorId)).rejects.toMatchObject({statusCode:403})
  expect(stored).toBeNull()
})
test('formal approval and missing review notes are not supported outcomes',async()=>{
  await expect(submitSurfaceReview({...command,outcome:'approved'},actorId)).rejects.toThrow()
  await expect(submitSurfaceReview({...command,note:' '},actorId)).rejects.toThrow()
  expect(db.transaction).not.toHaveBeenCalled()
})

test('viewer may read bound review history without gaining review-write authority',async()=>{
  await submitSurfaceReview(command,actorId)
  jest.mocked(resolveProjectRoomAccess).mockResolvedValue('viewer')
  const history=await readSurfaceReviews(projectId,sourceRevisionId,actorId)
  expect(history).toMatchObject({role:'viewer',source:{revisionId:sourceRevisionId,inputHash,current:true},historyLimited:false})
  expect(history.reviews).toHaveLength(1)
  expect(history.reviews[0]).toMatchObject({sourceHash:inputHash,professionalApproval:false,fieldVerified:false})
})
test('unrelated reader cannot enter the review read transaction',async()=>{
  jest.mocked(resolveProjectRoomAccess).mockResolvedValue(null)
  await expect(readSurfaceReviews(projectId,sourceRevisionId,actorId)).rejects.toMatchObject({statusCode:403})
  expect(db.transaction).not.toHaveBeenCalled()
})
test('tampered retained review evidence cannot be presented as a valid review',async()=>{
  await submitSurfaceReview(command,actorId)
  if(!stored)throw new Error('Review fixture not created')
  stored.source_output_evidence='{}'
  await expect(readSurfaceReviews(projectId,sourceRevisionId,actorId)).rejects.toMatchObject({statusCode:409})
})

test('an inconsistent current-surface pointer cannot be presented as ready for a new review',async()=>{
  const normal=query.getMockImplementation()
  if(!normal)throw new Error('Test query handler is missing')
  query.mockImplementation(async(sql:string,args?:unknown[])=>sql.includes('current_revision_id')?{rows:[{current_revision_id:sourceRevisionId,revision:1,latest_revision:2}]}:normal(sql,args))
  const history=await readSurfaceReviews(projectId,sourceRevisionId,actorId)
  expect(history.source.current).toBe(false)
})
