/** @jest-environment node */
import {NextRequest} from 'next/server'
import {GET,POST} from './route'
import {db} from '@/lib/db'
import {canAccessProject} from '@/lib/auth/rbac'
const projectId='22222222-2222-4222-8222-222222222222',actor='11111111-1111-4111-8111-111111111111'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
jest.mock('@/lib/auth/rbac',()=>({canAccessProject:jest.fn()}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(request:NextRequest,context:unknown)=>unknown)=>
  async(request:NextRequest)=>handler(request,{params:{id:'22222222-2222-4222-8222-222222222222'},userId:'11111111-1111-4111-8111-111111111111',body:{}})}))
const context={params:Promise.resolve({id:projectId})}
const request=(method='GET')=>new NextRequest(`http://localhost/api/project/${projectId}/workflow`,{method})
const project={id:projectId,name:'SYNTHETIC shared workflow',survey_type:'topographic',location:null,utm_zone:37,hemisphere:'S',boundary_data:null,workflow_step:1,workflow_max_unlocked:1}
beforeEach(()=>{
 jest.clearAllMocks()
 jest.mocked(db.query).mockImplementation(async(sql)=>{
  if(sql.includes('FROM projects p'))return{rows:sql.includes('p.user_id = $2')?[]:[project]} as never
  if(sql.includes('COUNT(*)'))return{rows:[{cnt:2}]} as never
  return{rows:[]} as never
 })
})
test.each(['viewer','surveyor','project_manager'] as const)('%s reads the shared workflow counts without a creator filter',async(role)=>{
 jest.mocked(canAccessProject).mockResolvedValue(role)
 const result=await GET(request(),context)
 expect(result.status).toBe(200)
 expect(await result.json()).toMatchObject({projectData:{id:projectId,pointCount:2,fieldbookEntryCount:2}})
 expect(canAccessProject).toHaveBeenCalledWith(actor,projectId)
 expect(jest.mocked(db.query).mock.calls[0][0]).not.toContain('p.user_id = $2')
 expect(result.headers.get('Cache-Control')).toBe('private, no-store')
})
test('a removed or unrelated actor is rejected before workflow contents are read',async()=>{
 jest.mocked(canAccessProject).mockResolvedValue(null)
 expect((await GET(request(),context)).status).toBe(403)
 expect(db.query).not.toHaveBeenCalled()
})
test('viewer cannot acknowledge tolerance or advance even when also recorded as creator',async()=>{
 jest.mocked(canAccessProject).mockResolvedValue('viewer')
 expect((await POST(request('POST'),context)).status).toBe(403)
 expect(db.query).not.toHaveBeenCalled()
})
test('shared editing role still cannot bypass the existing owner-only advancement check',async()=>{
 jest.mocked(canAccessProject).mockResolvedValue('surveyor')
 expect((await POST(request('POST'),context)).status).toBe(404)
 expect(jest.mocked(db.query).mock.calls[0][0]).toContain('p.user_id = $2')
 expect(jest.mocked(db.query).mock.calls.every(([sql])=>sql.trimStart().startsWith('SELECT'))).toBe(true)
})
