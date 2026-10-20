/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordOfflineObservation } from '@/lib/field/observationCaptureServer'
import { GET, POST } from './route'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
jest.mock('@/lib/field/observationCaptureServer',()=>({recordOfflineObservation:jest.fn()}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(request:NextRequest,ctx:{userId:string;body:unknown})=>Promise<NextResponse>)=>async(request:NextRequest)=>{
  try{return await handler(request,{userId:'11111111-1111-4111-8111-111111111111',body:request.method==='POST'?await request.json() as unknown:null})}
  catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:'Invalid recovery input'},{status:400});throw error}
}}))
const capture={id:'device-1',projectId:project,station:'P1',surveyType:'unspecified',createdAt:'2026-10-20T08:00:00.000Z',easting:0,northing:10}
beforeEach(()=>{jest.clearAllMocks();jest.mocked(db.query).mockResolvedValue({rows:[{allowed:true}],rowCount:1,command:'SELECT',oid:0,fields:[]})})
test('fresh write access is required and permission responses are private',async()=>{
  const response=await GET(new NextRequest(`http://127.0.0.1/api/fieldbook/recovery?projectId=${project}`))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({actorId:actor,projectId:project,canReview:true})
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  jest.mocked(db.query).mockResolvedValueOnce({rows:[{allowed:false}],rowCount:1,command:'SELECT',oid:0,fields:[]})
  expect((await GET(new NextRequest(`http://127.0.0.1/api/fieldbook/recovery?projectId=${project}`))).status).toBe(403)
})
test('an account switch cannot inspect project recovery or deliver a reviewed source',async()=>{
  const headers={'X-Metardu-Expected-User':'other'}
  expect((await GET(new NextRequest(`http://127.0.0.1/api/fieldbook/recovery?projectId=${project}`,{headers}))).status).toBe(403)
  expect((await POST(new NextRequest('http://127.0.0.1/api/fieldbook/recovery',{method:'POST',headers,body:'{}'}))).status).toBe(403)
  expect(db.query).not.toHaveBeenCalled();expect(recordOfflineObservation).not.toHaveBeenCalled()
})
test('delivery requires explicit acknowledgement and passes the original capture and content hash to the receipt service',async()=>{
  const headers={'X-Metardu-Expected-User':actor}
  expect((await POST(new NextRequest('http://127.0.0.1/api/fieldbook/recovery',{method:'POST',headers,body:JSON.stringify({capture,sourceHash:'a'.repeat(64)})}))).status).toBe(400)
  jest.mocked(recordOfflineObservation).mockResolvedValue({ok:true,id:'device-1',observationId:actor,batchId:project,inputHash:'a'.repeat(64),replayed:false,fieldVerified:false})
  const response=await POST(new NextRequest('http://127.0.0.1/api/fieldbook/recovery',{method:'POST',headers,body:JSON.stringify({capture,sourceHash:'a'.repeat(64),acknowledgement:'unknown-author-v1'})}))
  expect(response.status).toBe(201)
  expect(recordOfflineObservation).toHaveBeenCalledWith(actor,capture,{legacyReview:{sourceHash:'a'.repeat(64),acknowledgement:'unknown-author-v1'}})
  expect(capture).not.toHaveProperty('ownerId')
})
