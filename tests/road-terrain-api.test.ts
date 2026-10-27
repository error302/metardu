/** @jest-environment node */
import {NextRequest} from 'next/server'
import {GET} from '@/app/api/engineering/road-terrain/route'
import {db} from '@/lib/db'
import {loadRoadWorkbenchSource} from '@/lib/engineering/roadWorkbenchRecoveryServer'
import {loadRoadRetainedTerrain} from '@/lib/engineering/roadTerrainServer'
import {roadWorkbenchExample} from '@/lib/engineering/roadWorkbenchExample'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:{userId:string})=>Promise<Response>)=>async(req:NextRequest)=>{
  try{return await handler(req,{userId:'10000000-0000-4000-8000-000000000003'})}catch(error){const {AppError}=jest.requireActual<typeof import('@/lib/api/errors')>('@/lib/api/errors');if(error instanceof AppError)return Response.json({code:error.code},{status:error.statusCode});throw error}
}}))
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/engineering/roadWorkbenchRecoveryServer',()=>({loadRoadWorkbenchSource:jest.fn()}))
jest.mock('@/lib/engineering/roadTerrainServer',()=>({loadRoadRetainedTerrain:jest.fn()}))
const scope={actorId:'10000000-0000-4000-8000-000000000003',projectId:'10000000-0000-4000-8000-000000000001',engineeringHash:'a'.repeat(64),referenceHash:'b'.repeat(64)}
const query=jest.fn<Promise<{rows:Record<string,unknown>[]}>,[string,unknown[]?]>().mockResolvedValue({rows:[]}),client={query}
const invoke=(extra:Record<string,string>={})=>GET(new NextRequest(`http://127.0.0.1/api/engineering/road-terrain?${new URLSearchParams({...scope,...extra})}`))
beforeEach(()=>{jest.clearAllMocks();query.mockResolvedValue({rows:[]});jest.mocked(db.transaction).mockImplementation(work=>work(client as unknown as import('pg').PoolClient));jest.mocked(loadRoadWorkbenchSource).mockResolvedValue({...scope,version:1,...roadWorkbenchExample()})})
it('returns the exact source scope and bounded owner revision list with no-store caching',async()=>{
  const response=await invoke()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({scope,revisions:[],limited:false})
  expect(query.mock.calls[0][1]).toEqual([scope.projectId,scope.actorId])
  expect(query.mock.calls[0][0]).toContain('LIMIT 201')
})
it('refuses an account switch before source or terrain reads',async()=>{
  expect((await invoke({actorId:scope.projectId})).status).toBe(403)
  expect(db.transaction).not.toHaveBeenCalled()
})
it.each(['engineeringHash','referenceHash'])('refuses a changed %s before surface lookup',async key=>{
  expect((await invoke({[key]:'f'.repeat(64)})).status).toBe(409)
  expect(query).not.toHaveBeenCalled()
  expect(loadRoadRetainedTerrain).not.toHaveBeenCalled()
})
it('loads exactly the requested revision on the same transaction client',async()=>{
  const revisionId='10000000-0000-4000-8000-000000000002'
  jest.mocked(loadRoadRetainedTerrain).mockResolvedValue({identity:{} as never,mesh:{points:[],triangles:[]}})
  expect((await invoke({revisionId})).status).toBe(200)
  expect(loadRoadRetainedTerrain).toHaveBeenCalledWith(client,scope.actorId,scope.projectId,revisionId)
})
