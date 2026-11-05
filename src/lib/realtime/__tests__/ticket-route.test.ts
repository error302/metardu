/** @jest-environment node */
import {NextRequest} from 'next/server'
import {z} from 'zod'
import type {ApiHandlerContext} from '@/lib/apiHandler'
import {POST} from '@/app/api/realtime/ticket/route'
import {resolveProjectRoomAccess} from '../projectRoomAccess'
import {verifyRoomTicket} from '../roomTicket'

const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616',userId='5a278317-81db-4db9-b9b6-d5f8ca10ec38'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:ApiHandlerContext)=>Promise<Response>)=>
  (req:NextRequest)=>handler(req,{userId,body:{projectId},params:{},session:{expires:'2099-01-01',user:{id:userId,name:'Crew'}}})}))
jest.mock('../projectRoomAccess',()=>({resolveProjectRoomAccess:jest.fn()}))
const access=jest.mocked(resolveProjectRoomAccess)
const savedSecret=process.env.AUTH_SECRET,savedNext=process.env.NEXTAUTH_SECRET
beforeEach(()=>{process.env.AUTH_SECRET='unit-room-test';access.mockResolvedValue('surveyor')})
afterEach(()=>{if(savedSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=savedSecret
  if(savedNext===undefined)delete process.env.NEXTAUTH_SECRET;else process.env.NEXTAUTH_SECRET=savedNext;jest.clearAllMocks()})
const request=()=>POST(new NextRequest('http://localhost/api/realtime/ticket',{method:'POST'}),{params:Promise.resolve({})})
test('issues exact server identity and canonical role with bounded expiry and no-store',async()=>{
  const response=await request(),raw:unknown=await response.json()
  const value=z.object({ticket:z.string(),expiresAt:z.number()}).passthrough().parse(raw)
  expect(access).toHaveBeenCalledWith(userId,projectId)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(value).toMatchObject({userId,projectId,role:'surveyor',protocolVersion:1})
  expect(verifyRoomTicket('unit-room-test',value.ticket,projectId)).toMatchObject({userId,role:'surveyor',expiresAt:value.expiresAt})
})
test('retains viewer as a read-only grant; cannot mint owner from browser input',async()=>{
  access.mockResolvedValue('viewer');const response=await request()
  expect(await response.json()).toMatchObject({role:'viewer',userId})
})
test('unrelated or unassigned legacy project gets no room credential',async()=>{
  access.mockResolvedValue(null);const response=await request()
  expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty('ticket')
})
test('missing signing configuration fails closed',async()=>{
  delete process.env.AUTH_SECRET;delete process.env.NEXTAUTH_SECRET
  const response=await request();expect(response.status).toBe(503)
  expect(await response.json()).not.toHaveProperty('ticket')
})
