/** @jest-environment node */
import {NextRequest,NextResponse} from 'next/server'
import {POST,GET} from '@/app/api/topo/export/dxf/route'
import {POST as PDF_POST,GET as PDF_GET} from '@/app/api/topo/export/pdf/route'
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

test('PDF export confirms ownership and returns revision-bound private download headers',async()=>{
 const pdf={...body,format:'pdf' as const};jest.mocked(executeSurfaceExport).mockResolvedValue({bytes:Buffer.from('%PDF-1.7'),filename:'surface.pdf',storagePath:'synthetic',contentHash:'c'.repeat(64),deliverableId:'deliverable',revision:2,replayed:false,requestHash:'d'.repeat(64)})
 const response=await PDF_POST(new NextRequest('http://127.0.0.1/api/topo/export/pdf',{method:'POST'}),{...context,body:pdf} as never)
 expect(requireProjectOwnership).toHaveBeenCalledWith(body.projectId,userId)
 expect(executeSurfaceExport).toHaveBeenCalledWith(pdf,userId,false,email)
 expect(response.headers.get('content-type')).toBe('application/pdf')
 expect(response.headers.get('x-metardu-surface-revision')).toBe(body.surfaceRevisionId)
 expect(response.headers.get('x-metardu-content-sha256')).toBe('c'.repeat(64))
 expect(response.headers.get('cache-control')).toBe('private, no-store')
})
test('PDF recovery rejects an unspecified format and retains authenticated identity',async()=>{
 const pdf={...body,format:'pdf'};await PDF_GET(new NextRequest('http://127.0.0.1/api/topo/export/pdf?'+new URLSearchParams(pdf)),context as never)
 expect(executeSurfaceExport).toHaveBeenCalledWith(pdf,userId,true,email)
 await expect(PDF_GET(new NextRequest('http://127.0.0.1/api/topo/export/pdf?'+new URLSearchParams(body)),context as never)).rejects.toThrow()
})
