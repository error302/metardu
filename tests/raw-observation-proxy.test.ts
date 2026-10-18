/** @jest-environment node */
import {NextRequest,type NextResponse} from 'next/server'
const mockQuery=jest.fn().mockResolvedValue({rows:[{id:'raw-reading'}],rowCount:1})
jest.mock('@/lib/db',()=>({db:{query:(...args:unknown[])=>mockQuery(...args)},setCurrentRlsServiceRole:jest.fn(),setCurrentTillClaimCode:jest.fn()}))
jest.mock('next-auth',()=>({getServerSession:jest.fn(async()=>({user:{id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'}}))}))
jest.mock('@/lib/auth',()=>({authOptions:{}}))
jest.mock('@/lib/auth/requestContext',()=>({setAuthenticatedDatabaseContext:jest.fn(),resolveAuthenticatedOrganization:jest.fn(async()=>null)}))
jest.mock('@/lib/security/projectAccess',()=>({checkProjectAccess:jest.fn(async()=>({allowed:true}))}))
jest.mock('@/lib/env',()=>({env:{ADMIN_EMAILS:''}}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:{body:unknown})=>Promise<NextResponse>)=>async(req:NextRequest)=>handler(req,{body:await req.json() as unknown})}))
import {POST} from '@/app/api/db/route'

const project='22222222-2222-4222-8222-222222222222'
const request=(operation:string,table='survey_observations')=>new NextRequest('http://127.0.0.1/api/db',{method:'POST',body:JSON.stringify({table,operation,filters:[{op:'eq',column:'project_id',value:project}],payload:{project_id:project,client_id:'original-raw',point_name:'SYNTHETIC',observation_type:'manual'},onConflict:'project_id,client_id'})})
beforeEach(()=>mockQuery.mockClear())
test.each(['insert','update','upsert','delete'])('generic %s cannot bypass raw delivery receipts or remove the raw source',async operation=>{
  const response=await POST(request(operation))
  expect(response.status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('authorized project reads remain available through the proxy',async()=>{
  const response=await POST(request('select'))
  expect(response.status).toBe(200)
  expect(mockQuery).toHaveBeenCalled()
})
test('capture archives are not exposed as a generic writable table',async()=>{
  expect((await POST(request('delete','observation_batches'))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
