/** @jest-environment node */
import { NextRequest,NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { GET,PUT } from '@/app/api/project/[id]/map-drawing/route'
import { projectDrawingSnapshot,type DrawingProjectRow } from '@/lib/mapDrawing/snapshot'
import { buildProjectReferenceSystem,toReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'
const mockQuery=jest.fn<Promise<{rows:unknown[];rowCount:number}>,[sql:string,values?:unknown[]]>(),mockRelease=jest.fn()
jest.mock('@/lib/db',()=>({db:{query:jest.fn(),getClient:jest.fn()},setRlsContext:jest.fn()}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/cache/memory-cache',()=>({CacheKeys:{project:(id:string)=>id},projectCache:{invalidate:jest.fn()}}))
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:unknown)=>Promise<NextResponse>)=>async(req:NextRequest,ctx:unknown)=>{try{return await handler(req,ctx)}catch{return NextResponse.json({error:'Drawing save failed'},{status:500})}}}))
const reference=JSON.parse(JSON.stringify(toReferenceSystemRow('project',{prs:buildProjectReferenceSystem({datum:'WGS84',utmZone:37,hemisphere:'S'})},'owner'))) as Record<string,unknown>
const features={type:'FeatureCollection',features:[{type:'Feature',id:0,geometry:{type:'Point',coordinates:[39,-2]},properties:{role:'SYNTHETIC'}}]}
let row:DrawingProjectRow
const ctx={params:{id:'project'},userId:'owner',session:null,body:{}}
const invoke=(body:unknown,expected='owner')=>PUT(new NextRequest('http://127.0.0.1/api/project/project/map-drawing',{method:'PUT',headers:{'X-Metardu-Expected-User':expected}}),{...ctx,body} as never)
beforeEach(()=>{
  jest.clearAllMocks()
  row={id:'project',user_id:'owner',name:'SYNTHETIC map',datum:'WGS84',utm_zone:37,hemisphere:'S',reference,boundary_data:{source:'field-to-finish',coordinateCrs:'EPSG:4326',drawnFeatures:features,cad_document:{drawing:'RETAIN'},adjustedStations:[{pointName:'RETAIN'}]}}
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true,projectUserId:'owner'})
  jest.mocked(db.query).mockResolvedValue({rows:[row],rowCount:1,command:'SELECT',fields:[],oid:0})
  jest.mocked(db.getClient).mockResolvedValue({query:mockQuery,release:mockRelease} as never)
  mockQuery.mockImplementation(async(sql:string,values?:unknown[])=>({rows:sql.includes('UPDATE projects')?[{...row,boundary_data:JSON.parse(String(values?.[0])) as unknown}]:sql.includes('FROM projects p')?[row]:[],rowCount:1}))
})
test('GET privately restores the complete drawing from one owner-bound snapshot',async()=>{
  const response=await GET(new NextRequest('http://127.0.0.1/api/project/project/map-drawing'),ctx as never)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json() as unknown).toMatchObject({features})
  expect(jest.mocked(db.query).mock.calls[0][0]).toContain('p.id=$1 AND p.user_id=$2')
})
test('GET refuses a changed recorded owner',async()=>{
  jest.mocked(db.query).mockResolvedValueOnce({rows:[{...row,user_id:'changed'}],rowCount:1} as never)
  expect((await GET(new NextRequest('http://127.0.0.1/api/project/project/map-drawing'),ctx as never)).status).toBe(404)
})
test('current version saves atomically and preserves CAD/control/computation evidence',async()=>{
  const version=projectDrawingSnapshot(row,'owner').version
  const response=await invoke({baseVersion:version,features})
  expect(response.status).toBe(200)
  const update=mockQuery.mock.calls.find(([sql])=>sql.includes('UPDATE projects'))
  if(typeof update?.[1]?.[0]!=='string')throw new Error('Expected one JSON drawing update')
  const data:unknown=JSON.parse(update[1][0])
  expect(data).toMatchObject({source:'field-to-finish',cad_document:{drawing:'RETAIN'},adjustedStations:[{pointName:'RETAIN'}],drawnFeatures:features})
  expect(data).toMatchObject({mapDrawing:{metrics:{status:'available'}}})
  expect(mockQuery.mock.calls[1]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))',['project']])
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');expect(mockRelease).toHaveBeenCalledTimes(1)
})
test('stale drawing or basis cannot overwrite another operator version',async()=>{
  expect((await invoke({baseVersion:'a'.repeat(64),features})).status).toBe(409)
  expect(mockQuery.mock.calls.some(([sql])=>sql.includes('UPDATE projects'))).toBe(false)
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
})
test('account-switch precondition rejects before acquiring a connection',async()=>{
  expect((await invoke({baseVersion:projectDrawingSnapshot(row,'owner').version,features},'old-account')).status).toBe(403)
  expect(db.getClient).not.toHaveBeenCalled()
})
test('ownership is rechecked inside the locked write',async()=>{
  const version=projectDrawingSnapshot(row,'owner').version;row.user_id='changed'
  expect((await invoke({baseVersion:version,features})).status).toBe(403)
  expect(mockQuery.mock.calls.some(([sql])=>sql.includes('UPDATE projects'))).toBe(false)
})
test('suppressed updates cannot produce a successful acknowledgement',async()=>{
  mockQuery.mockImplementation(async(sql:string)=>({rows:sql.includes('UPDATE projects')?[]:sql.includes('FROM projects p')?[row]:[],rowCount:sql.includes('UPDATE projects')?0:1}))
  expect((await invoke({baseVersion:projectDrawingSnapshot(row,'owner').version,features})).status).toBe(500)
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
})
test('rollback failure destroys its connection',async()=>{
  mockQuery.mockRejectedValue(new Error('synthetic connection failure'))
  expect((await invoke({baseVersion:projectDrawingSnapshot(row,'owner').version,features})).status).toBe(500)
  expect(mockRelease).toHaveBeenCalledWith(true)
})
test('a malformed stored drawing can be downloaded without inventing or replacing its CRS',async()=>{
  const original={type:'FeatureCollection',features:[{invalid:'RETAIN'}]}
  row.boundary_data={drawnFeatures:original}
  const response=await GET(new NextRequest('http://127.0.0.1/api/project/project/map-drawing?download=original'),ctx as never)
  expect(response.status).toBe(200);expect(await response.json() as unknown).toEqual(original)
  expect((await GET(new NextRequest('http://127.0.0.1/api/project/project/map-drawing'),ctx as never)).status).toBe(422)
})
