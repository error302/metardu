/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { GET, POST } from './route'
import { createBookFromCaptures, listBookCaptures, inspectBookCapture } from '@/lib/fieldbook/captureBookServer'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',batch='33333333-3333-4333-8333-333333333333'
jest.mock('@/lib/fieldbook/captureBookServer',()=>({createBookFromCaptures:jest.fn(),listBookCaptures:jest.fn(),inspectBookCapture:jest.fn()}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(request:NextRequest,ctx:{userId:string;body:unknown})=>Promise<NextResponse>)=>async(request:NextRequest)=>{
  try{return await handler(request,{userId:'11111111-1111-4111-8111-111111111111',body:request.method==='POST'?await request.json() as unknown:null})}
  catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:'Invalid input'},{status:422});throw error}
}}))
const request=(query:string,expected=actor)=>new NextRequest(`http://127.0.0.1/api/fieldbook/captures?${query}`,{headers:{'X-Metardu-Expected-User':expected}})
beforeEach(()=>{jest.resetAllMocks();jest.mocked(listBookCaptures).mockResolvedValue({items:[],next:null})})
test('source reads require the reviewing account and remain private and paginated',async()=>{
  expect((await GET(request(`projectId=${project}`,'other'))).status).toBe(403)
  expect(listBookCaptures).not.toHaveBeenCalled()
  const response=await GET(request(`projectId=${project}&cursor=reviewed-page`))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(listBookCaptures).toHaveBeenCalledWith(actor,project,'reviewed-page')
})
test('inspection loads exactly one source in the authenticated project',async()=>{
  const response=await GET(request(`projectId=${project}&batchId=${batch}`))
  expect(response.status).toBe(200)
  expect(inspectBookCapture).toHaveBeenCalledWith(actor,project,batch)
  expect(listBookCaptures).not.toHaveBeenCalled()
})
test('creation requires acknowledgement and accepts source identities rather than client-authored rows',async()=>{
  const input={projectId:project,bookId:actor,name:'Raw draft',type:'leveling',bearingEncoding:'uninterpreted',sources:[{batchId:batch,inputHash:'a'.repeat(64)}]}
  const post=(body:unknown)=>POST(new NextRequest('http://127.0.0.1/api/fieldbook/captures',{method:'POST',headers:{'X-Metardu-Expected-User':actor},body:JSON.stringify(body)}))
  expect((await post(input)).status).toBe(422)
  expect(createBookFromCaptures).not.toHaveBeenCalled()
  jest.mocked(createBookFromCaptures).mockResolvedValue({book:{id:actor},replayed:false})
  expect((await post({...input,acknowledgement:'create-draft-from-raw-v1'})).status).toBe(201)
  expect(createBookFromCaptures).toHaveBeenCalledWith(actor,{...input,acknowledgement:'create-draft-from-raw-v1'})
  expect((await post({...input,acknowledgement:'create-draft-from-raw-v1',raw:{invented:true}})).status).toBe(422)
})
