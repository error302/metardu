/** @jest-environment node */
import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {checkFeatureAccess} from '@/lib/subscription/subscriptionEngine'
import {GET} from '@/app/api/project/[id]/civil-surface-export/route'
import {civilSurfaceFixture,projectId,revisionId,ownerId} from './civil-surface-fixture'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/subscription/subscriptionEngine',()=>({checkFeatureAccess:jest.fn()}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_config:unknown,handler:unknown)=>handler}))
const invoke=(suffix='')=>GET(new NextRequest(`http://127.0.0.1/api/project/${projectId}/civil-surface-export${suffix}`),{params:{id:projectId},userId:ownerId} as never)
beforeEach(()=>{
  jest.clearAllMocks()
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true,projectUserId:ownerId})
  jest.mocked(checkFeatureAccess).mockResolvedValue({allowed:true})
  jest.mocked(db.query).mockResolvedValue({rows:[civilSurfaceFixture()],rowCount:1,fields:[],command:'SELECT',oid:0})
})
test('exact revision downloads privately through a bound read, without mutations',async()=>{
  const response=await invoke(`?revisionId=${revisionId}`)
  expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('application/xml')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.text()).toContain('<Definition surfType="TIN"')
  expect(jest.mocked(db.query).mock.calls).toHaveLength(1)
  expect(jest.mocked(db.query).mock.calls[0][1]).toEqual([projectId,revisionId,ownerId])
  expect(jest.mocked(db.query).mock.calls[0][0]).toContain('p.user_id=$3')
})
test('paid access is checked before loading the mesh',async()=>{
  jest.mocked(checkFeatureAccess).mockResolvedValue({allowed:false})
  expect((await invoke(`?revisionId=${revisionId}`)).status).toBe(403)
  expect(db.query).not.toHaveBeenCalled()
})
test('owner changes or a revision from another project cannot return a file',async()=>{
  jest.mocked(db.query).mockResolvedValueOnce({rows:[],rowCount:0} as never)
  expect((await invoke(`?revisionId=${revisionId}`)).status).toBe(404)
})
test('inconsistent retained content is refused with the original untouched',async()=>{
  const row=civilSurfaceFixture();row.result.mesh.points[0].z=100
  jest.mocked(db.query).mockResolvedValueOnce({rows:[row],rowCount:1} as never)
  const response=await invoke(`?revisionId=${revisionId}`)
  expect(response.status).toBe(409);expect(await response.json() as unknown).toMatchObject({code:'SURFACE_HANDOFF_UNVERIFIED'})
  expect(db.query).toHaveBeenCalledTimes(1)
})
test('inventory is bounded, private and does not require a paid artifact request',async()=>{
  const response=await invoke()
  expect(response.status).toBe(200);expect(checkFeatureAccess).not.toHaveBeenCalled()
  expect(jest.mocked(db.query).mock.calls[0][0]).toContain('LIMIT 201')
})
