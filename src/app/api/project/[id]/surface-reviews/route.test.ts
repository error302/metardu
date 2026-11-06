/** @jest-environment node */
import {NextRequest} from 'next/server'
import type {ApiHandlerContext} from '@/lib/apiHandler'
import {GET,POST} from './route'
import {readSurfaceReviews,submitSurfaceReview} from '@/lib/topo/surfaceReview'
const actorId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',sourceRevisionId='33333333-3333-4333-8333-333333333333'
jest.mock('@/lib/topo/surfaceReview',()=>({readSurfaceReviews:jest.fn(),submitSurfaceReview:jest.fn()}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:ApiHandlerContext)=>Promise<Response>)=>
  async(req:NextRequest)=>handler(req,{userId:actorId,params:{id:projectId},body:req.method==='POST'?await req.json() as unknown:null,session:{expires:'2099-01-01',user:{id:actorId}}})}))
const command={projectId,sourceRevisionId,expectedSourceHash:'a'.repeat(64),requestId:'44444444-4444-4444-8444-444444444444',outcome:'reviewed_for_draft',note:'Internal source review only.'}
beforeEach(()=>jest.resetAllMocks())
const call=(body:unknown)=>POST(new NextRequest(`http://localhost/api/project/${projectId}/surface-reviews`,{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:projectId})})
test('new review derives actor from the authenticated context and disables caching',async()=>{
  jest.mocked(submitSurfaceReview).mockResolvedValue({replayed:false} as Awaited<ReturnType<typeof submitSurfaceReview>>)
  const response=await call(command)
  expect(submitSurfaceReview).toHaveBeenCalledWith(command,actorId)
  expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('private, no-store')
})
test('identical recovery returns200 and cannot silently create another review',async()=>{
  jest.mocked(submitSurfaceReview).mockResolvedValue({replayed:true} as Awaited<ReturnType<typeof submitSurfaceReview>>)
  expect((await call(command)).status).toBe(200)
})
test('route/body project mismatch is rejected before the transaction service',async()=>{
  expect((await call({...command,projectId:sourceRevisionId})).status).toBe(400)
  expect(submitSurfaceReview).not.toHaveBeenCalled()
})
test('review history binds the current authenticated reader and selected revision',async()=>{
  jest.mocked(readSurfaceReviews).mockResolvedValue({role:'viewer',source:{revisionId:sourceRevisionId,inputHash:'a'.repeat(64),referenceHash:'b'.repeat(64),outputHash:'c'.repeat(64),current:true},reviews:[],historyLimited:false})
  const response=await GET(new NextRequest(`http://localhost/api/project/${projectId}/surface-reviews?sourceRevisionId=${sourceRevisionId}`),{params:Promise.resolve({id:projectId})})
  expect(readSurfaceReviews).toHaveBeenCalledWith(projectId,sourceRevisionId,actorId)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store')
})
test('missing or malformed selected revision cannot query review history',async()=>{
  const response=await GET(new NextRequest(`http://localhost/api/project/${projectId}/surface-reviews`),{params:Promise.resolve({id:projectId})})
  expect(response.status).toBe(400);expect(readSurfaceReviews).not.toHaveBeenCalled()
})
