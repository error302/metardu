/** @jest-environment node */
import {NextRequest,NextResponse} from 'next/server'
import {requireProjectOwnership,requireProjectReadAccess} from '@/lib/auth/ownership'
import {db,setRlsContext} from '@/lib/db'
import {GET,PUT} from '../route'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:unknown)=>handler,apiSuccess:(data:unknown)=>NextResponse.json({data})}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectOwnership:jest.fn(),requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn(),getClient:jest.fn()},setRlsContext:jest.fn()}))
const projectCrs='EPSG:32737'
const ctx={userId:'reader',params:{id:'project'},body:{},session:null}
beforeEach(()=>{
  jest.clearAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ok:false,error:NextResponse.json({error:'Forbidden'},{status:403})})
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true,projectUserId:'owner'})
  jest.mocked(setRlsContext).mockResolvedValue(undefined)
  jest.mocked(db.query).mockResolvedValue({rows:[{project_owner:'owner',reference:{horizontal_crs:projectCrs,horizontal_name:'WGS84 UTM 37S',datum_name:'WGS84',units:'metres',zone:37,hemisphere:'S',vertical_datum:'Synthetic BM',distance_mode:'grid',coordinate_precision:3}}],rowCount:1,command:'SELECT',oid:0,fields:[]})
})
it('allows an authorized project reader to load the declared reference privately',async()=>{
  const response=await GET(new NextRequest('http://127.0.0.1:3021/api/project/project/reference-system'),ctx)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(requireProjectReadAccess).toHaveBeenCalledWith('project','reader')
})
it('still reserves reference changes for the recorded project owner',async()=>{
  const response=await PUT(new NextRequest('http://127.0.0.1:3021/api/project/project/reference-system',{method:'PUT'}),ctx)
  expect(response.status).toBe(403)
  expect(db.query).not.toHaveBeenCalled()
})

it('commits a reference declaration under the project set-out lock',async()=>{
  jest.mocked(requireProjectOwnership).mockResolvedValue({ok:true,projectUserId:'owner'})
  const savedRow={project_id:'project',horizontal_crs:projectCrs,horizontal_name:'WGS84 UTM 37S',datum_name:'WGS84',units:'metres',zone:37,hemisphere:'S',vertical_datum:'Synthetic BM',distance_mode:'grid',coordinate_precision:3,declared_by:'owner',declared_at:'2026-10-17T00:00:00.000Z'}
  const query=jest.fn(async(sql:string,values?:unknown[])=>{
    const columns=sql.match(/INSERT INTO project_reference_systems \(([^)]+)\)/)?.[1].split(',').map(column=>column.trim())??[]
    return {rows:columns.length?[{...savedRow,...Object.fromEntries(columns.map((column,index)=>[column,values?.[index]]))}]:sql.includes('FROM projects')?[{user_id:'owner'}]:[],rowCount:1,command:'UPDATE',oid:0,fields:[]}
  })
  const release=jest.fn()
  const client={query,release} as never
  jest.mocked(db.getClient).mockResolvedValue(client)
  const form={datum:'WGS84',utmZone:37,hemisphere:'S',verticalDatum:'Synthetic BM',distanceMode:'grid',coordinatePrecision:3}
  const response=await PUT(
    new NextRequest('http://127.0.0.1:3021/api/project/project/reference-system',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),
    {...ctx,userId:'owner',body:form} as never,
  )
  const sqlCalls=query.mock.calls.map(([sql])=>sql)

  expect(response.status).toBe(200)
  expect(sqlCalls).toContain('SELECT pg_advisory_xact_lock(hashtext($1))')
  expect(sqlCalls.indexOf('BEGIN')).toBeLessThan(sqlCalls.indexOf('SELECT pg_advisory_xact_lock(hashtext($1))'))
  expect(sqlCalls.indexOf('COMMIT')).toBeGreaterThan(sqlCalls.findIndex(sql=>sql.includes('UPDATE projects')))
  expect(release).toHaveBeenCalledTimes(1)
  expect(setRlsContext).toHaveBeenCalledWith(client)
})
