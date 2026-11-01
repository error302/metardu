/** @jest-environment node */
import type {PoolClient} from 'pg'
import {db} from '@/lib/db'
import {checkFeatureAccess} from '@/lib/subscription/subscriptionEngine'
import {executeSurfaceExport} from '../surfaceExport'
import type {SurfaceExportRequest} from '../surfaceRequest'

jest.mock('@/lib/db',()=>({db:{transaction:jest.fn(),query:jest.fn()}}))
jest.mock('@/lib/subscription/subscriptionEngine',()=>({checkFeatureAccess:jest.fn()}))
jest.mock('@/lib/storage',()=>({uploadFile:jest.fn(),downloadFile:jest.fn(),deleteFile:jest.fn()}))
jest.mock('@/lib/logger',()=>({logger:{error:jest.fn()}}))
jest.mock('@/lib/topo/surfaceRevision',()=>({loadSurfaceRevision:jest.fn(),hashSurfaceValue:()=> 'a'.repeat(64)}))
jest.mock('@/lib/deliverables/deliverableRegister',()=>({hashDeliverableContent:jest.fn(),registerDeliverable:jest.fn()}))
const userId='00000000-0000-4000-8000-000000000001'
const body:SurfaceExportRequest={projectId:'00000000-0000-4000-8000-000000000002',surfaceRevisionId:'00000000-0000-4000-8000-000000000003',requestId:'00000000-0000-4000-8000-000000000004',expectedUserId:userId}
const run:(body:SurfaceExportRequest,userId:string,recoverOnly?:boolean,email?:string)=>ReturnType<typeof executeSurfaceExport>=executeSurfaceExport
beforeEach(()=>{
 jest.resetAllMocks()
 const client={query:jest.fn().mockImplementation(async (sql:string)=>({rows:sql.startsWith('SELECT user_id FROM projects')?[{user_id:userId}]:[]}))}
 jest.mocked(db.transaction).mockImplementation(async fn=>fn(client as unknown as PoolClient))
 jest.mocked(checkFeatureAccess).mockResolvedValue({allowed:false,reason:'Paid plan required'})
})
test('uses the existing entitlement policy with the server-authenticated email',async()=>{
 await expect(run(body,userId,false,'synthetic-owner@example.invalid')).rejects.toThrow('DXF export requires an active Pro plan')
 expect(checkFeatureAccess).toHaveBeenCalledWith(userId,'dxf_export','synthetic-owner@example.invalid')
})
test('does not invent an email or grant when server identity is absent',async()=>{
 await expect(run(body,userId)).rejects.toThrow('DXF export requires an active Pro plan')
 expect(checkFeatureAccess).toHaveBeenCalledWith(userId,'dxf_export',undefined)
})
