/** @jest-environment node */
import {NextRequest,NextResponse} from 'next/server'
import {POST,GET} from '@/app/api/topo/export/dxf/route'
import {requireProjectOwnership} from '@/lib/auth/ownership'
import {executeSurfaceExport} from '@/lib/topo/surfaceExport'
import {surfaceExportRequestSchema} from '@/lib/topo/surfaceRequest'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_config:unknown,handler:unknown)=>handler}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectOwnership:jest.fn()}))
jest.mock('@/lib/topo/surfaceExport',()=>({executeSurfaceExport:jest.fn()}))
const userId='00000000-0000-4000-8000-000000000001',email='server-session@example.invalid'
const body={projectId:'00000000-0000-4000-8000-000000000002',surfaceRevisionId:'00000000-0000-4000-8000-000000000003',requestId:'00000000-0000-4000-8000-000000000004',expectedUserId:userId}
const context={userId,body:{...body,email:'untrusted-body@example.invalid'},session:{user:{id:userId,email}}}
beforeEach(()=>{jest.resetAllMocks();jest.mocked(requireProjectOwnership).mockResolvedValue({ok:true,projectUserId:userId});jest.mocked(executeSurfaceExport).mockResolvedValue({bytes:Buffer.from('synthetic DXF'),filename:'synthetic.dxf',storagePath:'synthetic',contentHash:'a'.repeat(64),deliverableId:'example-deliverable',revision:1,replayed:false,requestHash:'b'.repeat(64)})})
test('POST forwards only the authenticated session email after project ownership succeeds',async()=>{
 const response=await POST(new NextRequest('http://127.0.0.1/api/topo/export/dxf',{method:'POST'}),context as never)
 expect(response.status).toBe(200)
 expect(executeSurfaceExport).toHaveBeenCalledWith(context.body,userId,false,email)
 expect(response.headers.get('cache-control')).toBe('private, no-store')
})
test('the same trusted identity reaches read-only recovery',async()=>{
 const request=new NextRequest('http://127.0.0.1/api/topo/export/dxf?'+new URLSearchParams(body))
 await GET(request,context as never)
 expect(executeSurfaceExport).toHaveBeenCalledWith(body,userId,true,email)
})
test('project ownership denial is retained before any export policy or generation',async()=>{
 jest.mocked(requireProjectOwnership).mockResolvedValue({ok:false,error:NextResponse.json({error:'Forbidden'},{status:403})})
 expect((await POST(new NextRequest('http://127.0.0.1/api/topo/export/dxf',{method:'POST'}),context as never)).status).toBe(403)
 expect(executeSurfaceExport).not.toHaveBeenCalled()
})
test('the real request schema rejects client-supplied entitlement identities',()=>{
 expect(surfaceExportRequestSchema.safeParse(context.body).success).toBe(false)
})
