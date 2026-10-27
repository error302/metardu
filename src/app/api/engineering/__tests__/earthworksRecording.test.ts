/** @jest-environment node */
import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {SaveEarthworksSchema} from '@/lib/validation/apiSchemas'
import {recordDesignRevision,hashDesignPayload} from '@/lib/engineering/designRevisions'
import {POST,GET} from '../earthworks/route'
import {roadWorkbenchExample} from '@/lib/engineering/roadWorkbenchExample'
import {roadGroundAlignmentKey} from '@/lib/engineering/roadGroundAssociation'

jest.mock('@/lib/apiHandler',()=>({apiHandler:(options:{schema?:import('zod').ZodSchema},handler:(req:NextRequest,ctx:unknown)=>Promise<Response>)=>async(req:NextRequest,ctx:{body:unknown;userId:string})=>{
  const parsed=options.schema?.safeParse(ctx.body)
  if(parsed&&!parsed.success)return Response.json({error:'Invalid input'},{status:400})
  try{return await handler(req,{...ctx,body:parsed?.success?parsed.data as unknown:ctx.body})}catch(error){const {AppError}=jest.requireActual<typeof import('@/lib/api/errors')>('@/lib/api/errors');if(error instanceof AppError)return Response.json({error:error.message},{status:error.statusCode});throw error}
}}))
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn(),query:jest.fn(),getClient:jest.fn()},setRlsContext:jest.fn()}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/engineering/designRevisions',()=>({...jest.requireActual<typeof import('@/lib/engineering/designRevisions')>('@/lib/engineering/designRevisions'),recordDesignRevision:jest.fn()}))
jest.mock('@/lib/observations/observationBatches',()=>({recordEvidenceEvent:jest.fn().mockResolvedValue(undefined)}))

const alignment='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',delivery='33333333-3333-4333-8333-333333333333'
const template={carriagewayWidth:6,shoulderWidth:0,camber:0,subgradeDepth:0,cutSlope:'1:1',fillSlope:'1:1'}
const fixtureCrs='EPSG:32737'
let owner='owner',records:Array<Record<string,unknown>>=[],ground=0
let projectEngineering:Record<string,unknown>|null=null
const query=jest.fn(async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>}>=>{
  if(/lock_project_for_read/.test(sql))return{rows:[{user_id:owner}]}
  if(/FROM projects/.test(sql))return{rows:[{id:project,user_id:owner,datum:'WGS84',utm_zone:37,hemisphere:'S',engineering_data:projectEngineering}]}
  if(/FROM road_alignments/.test(sql))return{rows:[{id:alignment,project_id:project,project_owner:owner,user_id:owner,road_name:'Synthetic Road',start_chainage:0,coordinate_system:fixtureCrs,cross_section_template:template}]}
  if(/FROM project_reference_systems/.test(sql))return{rows:[{project_id:project,horizontal_crs:fixtureCrs,horizontal_name:'WGS84 UTM 37S',datum_name:'WGS84',units:'metres',zone:37,hemisphere:'S',vertical_datum:'Synthetic BM',vertical_reference:'local',distance_mode:'grid',coordinate_precision:3}]}
  if(/FROM alignment_ips|FROM alignment_vertical_ips/.test(sql))return{rows:[]}
  if(/FROM cross_section_stations/.test(sql))return{rows:[0,20].map(chainage=>({chainage,existing_ground:{level:ground,profile:[{offset:-10,level:ground},{offset:0,level:ground},{offset:10,level:ground}]},proposed_road:{designLevel:-1,designLevelSource:'manual'}}))}
  if(/FROM design_revisions/.test(sql)){
    if(/clientRunId/.test(sql))return{rows:records.filter(row=>(row.payload as {quantityRun:{clientRunId:string}}).quantityRun.clientRunId===params.at(-1))}
    if(/AND id =/.test(sql))return{rows:records.filter(row=>row.id===params.at(-1))}
    return{rows:records}
  }
  return{rows:[]}
})
const client={query,release:jest.fn()}
type Handler=(req:NextRequest,ctx:{userId:string;body?:unknown;params:Record<string,string>})=>Promise<Response>
const invoke=(handler:unknown,body?:unknown,suffix='')=>(handler as Handler)(new NextRequest(`http://127.0.0.1:3021/api/engineering/earthworks?alignment_id=${alignment}${suffix}`,{method:body?'POST':'GET'}),{userId:'owner',body,params:{}})
async function preview(){const response=await invoke(GET,undefined,'&preview=1');if(response.status!==200)throw new Error(`Preview failed: ${response.status} ${await response.text()}`);return(await response.json() as {data:{input_hash:string}}).data}
beforeEach(()=>{
  jest.clearAllMocks();owner='owner';records=[];ground=0;projectEngineering=null
  jest.mocked(db.transaction).mockImplementation(async work=>{const saved=[...records];try{return await work(client as unknown as import('pg').PoolClient)}catch(error){records=saved;throw error}})
  jest.mocked(db.getClient).mockResolvedValue(client as unknown as import('pg').PoolClient)
  jest.mocked(db.query).mockImplementation(query as unknown as typeof db.query)
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true})
  jest.mocked(recordDesignRevision).mockImplementation(async input=>{
    const row={id:`44444444-4444-4444-8444-${String(records.length+1).padStart(12,'0')}`,project_id:project,discipline:'road',entity_type:'alignment-earthworks',entity_id:alignment,revision:`R0${records.length+1}`,revision_number:records.length+1,status:'DRAFT',created_at:'2026-10-16T00:00:00Z',created_by:'owner',payload:input.payload,content_hash:hashDesignPayload(input.payload??{})}
    records.push(row);return{revision:row as unknown as import('@/lib/engineering/designRevisions').DesignRevisionRecord,supersededId:null}
  })
})

it('rejects caller-authored reductions and methods instead of stripping or storing them',()=>{
  const body={alignment_id:alignment,client_run_id:delivery,expected_input_hash:'a'.repeat(64)}
  expect(SaveEarthworksSchema.safeParse(body).success).toBe(true)
  expect(SaveEarthworksSchema.safeParse({...body,method:'end-area',results:[{chainage:0,cut_area:999,fill_area:0,cut_volume:999,fill_volume:0,cumulative_cut:999,cumulative_fill:0,net_volume:999,mass_ordinate:999}]}).success).toBe(false)
})
it('uses the complete saved project road rather than an older relational mirror for preview and recording',async()=>{
  const road=roadWorkbenchExample().road
  road.roadName='Synthetic Road';road.vips[0].reducedLevel=99
  road.groundSectionAlignmentKey=roadGroundAlignmentKey(road)
  projectEngineering={mode:'road',standard:'KRDM2017',road}
  const response=await invoke(GET,undefined,'&preview=1')
  expect(response.status).toBe(200)
  const result=await response.json() as {data:{inputs:{road:{vips:Array<{reducedLevel:number}>}},input_hash:string}}
  expect(result.data.inputs.road.vips[0].reducedLevel).toBe(99)
  expect(query.mock.calls.some(([sql])=>/FROM cross_section_stations/.test(sql))).toBe(false)
  const saved=await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:result.data.input_hash})
  expect(saved.status).toBe(201)
})
it('refuses a moved saved alignment with its original ground association before consulting legacy sections',async()=>{
  const road=roadWorkbenchExample().road
  road.roadName='Synthetic Road';road.groundSectionAlignmentKey=roadGroundAlignmentKey(road)
  road.ips[0].easting-=1
  projectEngineering={mode:'road',standard:'KRDM2017',road}
  const response=await invoke(GET,undefined,'&preview=1')
  expect(response.status).toBe(422)
  expect(await response.text()).toMatch(/ground sections.*alignment/i)
  expect(query.mock.calls.some(([sql])=>/FROM cross_section_stations/.test(sql))).toBe(false)
  expect(recordDesignRevision).not.toHaveBeenCalled()
})
it('refuses malformed current project data instead of falling back to apparently usable old sections',async()=>{
  projectEngineering={road:{roadName:'Synthetic Road',ips:[]}}
  const response=await invoke(GET,undefined,'&preview=1')
  expect(response.status).toBe(422)
  expect(await response.text()).toMatch(/legacy rows are not substituted/i)
  expect(query.mock.calls.some(([sql])=>/FROM cross_section_stations/.test(sql))).toBe(false)
})
it('keeps a separately named historical alignment on its own source rather than substituting another road',async()=>{
  const road=roadWorkbenchExample().road
  road.roadName='A separate synthetic road'
  projectEngineering={road}
  const response=await invoke(GET,undefined,'&preview=1')
  expect(response.status).toBe(200)
  const result=await response.json() as {data:{inputs:{road:{roadName:string}},result:{totalCut:number}}}
  expect(result.data.inputs.road.roadName).toBe('Synthetic Road')
  expect(result.data.result.totalCut).toBe(140)
})
it('records the engine result and source snapshot atomically without touching legacy quantities',async()=>{
  const source=await preview()
  const response=await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})
  expect(response.status).toBe(201)
  const result=await response.json() as {data:import('@/lib/engineering/roadQuantity').RoadQuantityRecord}
  expect(result.data.quantity.result.totalCut).toBe(140)
  expect(result.data.quantity.result.totalFill).toBe(0)
  expect(result.data.quantity.inputs.road.stations[0].groundLevel).toBe(0)
  expect(recordDesignRevision).toHaveBeenCalledWith(expect.objectContaining({entityType:'alignment-earthworks',draftOnly:true}),client)
  expect(query.mock.calls.some(([sql])=>/earthworks_results/.test(sql))).toBe(false)
})
it('returns one original record for a retry and conflicts on delivery ID reuse for changed input',async()=>{
  const source=await preview(),body={alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash}
  await invoke(POST,body)
  expect((await invoke(POST,body)).status).toBe(200)
  expect(recordDesignRevision).toHaveBeenCalledTimes(1)
  expect((await invoke(POST,{...body,expected_input_hash:'b'.repeat(64)})).status).toBe(409)
})
it('refuses stale saved inputs before any new revision is created',async()=>{
  const source=await preview();ground=1
  expect((await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})).status).toBe(409)
  expect(recordDesignRevision).not.toHaveBeenCalled()
})
it('rechecks the recorded owner under the write lock',async()=>{
  const source=await preview();owner='other'
  expect((await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})).status).toBe(403)
  expect(recordDesignRevision).not.toHaveBeenCalled()
})
it('enforces project read access before exposing a preview or archive',async()=>{
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:false,error:Response.json({error:'Forbidden'},{status:403}) as import('next/server').NextResponse})
  expect((await invoke(GET,undefined,'&preview=1')).status).toBe(403)
  expect(query.mock.calls.some(([sql])=>/FROM design_revisions|FROM cross_section_stations/.test(sql))).toBe(false)
})
it('keeps an old immutable run readable after the current measurements change',async()=>{
  const source=await preview();await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})
  ground=1
  const response=await invoke(GET,undefined,`&run_id=${records[0].id as string}`)
  expect(response.status).toBe(200)
  const result=await response.json() as {data:import('@/lib/engineering/roadQuantity').RoadQuantityRecord}
  expect(result.data.quantity.result.totalCut).toBe(140)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('retains an earlier algorithm archive without rewriting its inputs, results or version',async()=>{
  const source=await preview();await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})
  const payload=records[0].payload as {quantityRun:import('@/lib/engineering/roadQuantity').RoadQuantityRecord['quantity']}
  payload.quantityRun.algorithmVersion='1.0.0'
  records[0].content_hash=hashDesignPayload(payload)
  const original=JSON.stringify(records[0]),response=await invoke(GET,undefined,`&run_id=${records[0].id as string}`)
  expect(response.status).toBe(200)
  const saved=await response.json() as {data:import('@/lib/engineering/roadQuantity').RoadQuantityRecord}
  expect(saved.data.quantity.algorithmVersion).toBe('1.0.0')
  expect(saved.data.quantity.result.totalCut).toBe(140)
  const replay=await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})
  expect(replay.status).toBe(200)
  expect((await replay.json() as {data:import('@/lib/engineering/roadQuantity').RoadQuantityRecord}).data.quantity.algorithmVersion).toBe('1.0.0')
  expect(JSON.stringify(records[0])).toBe(original)
})
it('refuses an unknown archived algorithm even with matching payload hashes',async()=>{
  const source=await preview();await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:source.input_hash})
  const payload=records[0].payload as {quantityRun:import('@/lib/engineering/roadQuantity').RoadQuantityRecord['quantity']}
  payload.quantityRun.algorithmVersion='unknown-engine'
  records[0].content_hash=hashDesignPayload(payload)
  expect((await invoke(GET,undefined,`&run_id=${records[0].id as string}`)).status).toBe(409)
})
it('reports read-only access without allowing a project reader to record a run',async()=>{
  owner='other'
  const response=await invoke(GET)
  expect(response.status).toBe(200)
  expect((await response.json() as {can_record:boolean}).can_record).toBe(false)
  expect((await invoke(POST,{alignment_id:alignment,client_run_id:delivery,expected_input_hash:'a'.repeat(64)})).status).toBe(403)
})
