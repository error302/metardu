/** @jest-environment node */
import {NextRequest,NextResponse} from 'next/server'
import {requireProjectOwnership,requireProjectReadAccess} from '@/lib/auth/ownership'
import {db} from '@/lib/db'
import {GET,PUT} from '../route'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:unknown)=>handler,apiSuccess:(data:unknown)=>NextResponse.json({data})}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectOwnership:jest.fn(),requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
const projectCrs='EPSG:32737'
const ctx={userId:'reader',params:{id:'project'},body:{},session:null}
beforeEach(()=>{
  jest.clearAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ok:false,error:NextResponse.json({error:'Forbidden'},{status:403})})
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true})
  jest.mocked(db.query).mockResolvedValue({rows:[{horizontal_crs:projectCrs,horizontal_name:'WGS84 UTM 37S',datum_name:'WGS84',units:'metres',zone:37,hemisphere:'S',vertical_datum:'Synthetic BM',distance_mode:'grid',coordinate_precision:3}],rowCount:1,command:'SELECT',oid:0,fields:[]})
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
