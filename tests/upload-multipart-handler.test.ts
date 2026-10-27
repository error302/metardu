/** @jest-environment node */
import {NextRequest} from 'next/server'
import {getServerSession} from 'next-auth'
import {db} from '@/lib/db'
import {POST as uploadMap} from '@/app/api/field/mbtiles/upload/route'
import {POST as parseFile} from '@/app/api/parsers/upload/route'

jest.mock('next-auth',()=>({getServerSession:jest.fn()}))
jest.mock('@/lib/auth',()=>({authOptions:{}}))
// These cases stop before parsing; native parser acceptance is a separate suite.
jest.mock('@/lib/parsers/fileRouter',()=>({routeFile:jest.fn(),validateFile:jest.fn()}))
jest.mock('@/lib/auth/requestContext',()=>({setAuthenticatedDatabaseContext:jest.fn(),resolveAuthenticatedOrganization:jest.fn(async()=>null)}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
jest.mock('@/lib/logger',()=>({logger:{error:jest.fn(),warn:jest.fn(),info:jest.fn()},auditLog:jest.fn()}))
jest.mock('@/lib/monitoring/sentry',()=>({captureError:jest.fn()}))
jest.mock('@/lib/monitoring/metrics',()=>({routeHitsTotal:{inc:jest.fn()}}))
jest.mock('@/lib/audit/auditLog',()=>({appendAuditEntry:jest.fn()}))
jest.mock('@/lib/security/rateLimit',()=>({rateLimit:jest.fn(async()=>({allowed:true,remaining:5,resetAt:Date.now()+60000})),getOperationRateLimitIdentifier:()=> 'synthetic-upload'}))

beforeEach(()=>{
 jest.clearAllMocks()
 jest.mocked(getServerSession).mockResolvedValue({user:{id:'synthetic-upload-actor'},expires:'2099-01-01T00:00:00Z'} as never)
})
const request=(route:string,empty=false)=>{
 const form=new FormData()
 if(empty)form.set('file',new File([],'synthetic.mbtiles'))
 return new NextRequest('http://127.0.0.1:3021'+route,{method:'POST',body:form})
}

test('the real authenticated map-upload wrapper preserves multipart bytes for file validation',async()=>{
 const response=await uploadMap(request('/api/field/mbtiles/upload',true))
 const body:unknown=await response.json()
 expect({status:response.status,body}).toEqual({status:400,body:{error:'The file is empty'}})
 expect(db.query).not.toHaveBeenCalled()
})

test('the real parser wrapper handles multipart as a file request rather than JSON',async()=>{
 const response=await parseFile(request('/api/parsers/upload'))
 const body:unknown=await response.json()
 expect({status:response.status,body}).toEqual({status:400,body:{error:'Choose a file to parse.'}})
 expect(db.query).not.toHaveBeenCalled()
})

test.each([['/api/field/mbtiles/upload',uploadMap],['/api/parsers/upload',parseFile]] as const)('anonymous requests cannot reach %s file parsing',async(route,handler)=>{
 jest.mocked(getServerSession).mockResolvedValue(null)
 const req=request(route,true)
 const response=await handler(req)
 expect(response.status).toBe(401)
 expect(req.bodyUsed).toBe(false)
 expect(db.query).not.toHaveBeenCalled()
})
