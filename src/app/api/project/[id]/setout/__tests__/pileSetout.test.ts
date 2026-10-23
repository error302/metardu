/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { POST, GET } from '../route'
import { db } from '@/lib/db'
jest.mock('@/lib/apiHandler',()=>({apiHandler:(_options:unknown,handler:(req:NextRequest,ctx:Record<string,unknown>)=>Promise<Response>)=>async(req:NextRequest,ctx:Record<string,unknown>)=>handler(req,{...ctx,body:req.method==='POST'?await req.json():null})}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn(),getClient:jest.fn()},setRlsContext:jest.fn().mockResolvedValue(undefined)}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectOwnership:jest.fn().mockResolvedValue({ok:true,projectUserId:'alice'})}))
jest.mock('@/lib/workspaces/stageReference',()=>({resolveStageReference:jest.fn(()=>({code:fixtureCrs,verticalDatum:'Synthetic BM'}))}))
const fixtureCrs = 'EPSG:32737'
jest.mock('@/lib/observations/observationBatches',()=>({recordEvidenceEvent:jest.fn().mockResolvedValue(undefined)}))
const profile={name:'Synthetic issued criteria',jurisdiction:'Synthetic contract',version:'R1',horizontalMm:'8',verticalMm:'4',effectiveDate:'2026-10-14',source:'Synthetic specification',approvedBy:'Synthetic reviewer',acknowledged:true}
const body={action:'save_definition',name:'Fixture',originEasting:500000,originNorthing:9800000,originRL:0,rows:2,columns:2,rowSpacing:5,columnSpacing:6,rotation:0,startLabel:'A1',labelRowsAs:'alpha',labelColumnsAs:'numeric',toleranceProfile:profile}
const clientQuery=jest.fn()
const invoke=async(payload:Record<string,unknown>)=>(POST as unknown as(req:NextRequest,ctx:Record<string,unknown>)=>Promise<NextResponse>)(new NextRequest('http://localhost/api/project/p/setout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),{params:{id:'p'},userId:'alice'})
beforeEach(()=>{
  jest.clearAllMocks()
  ;(db.query as jest.Mock).mockResolvedValue({rows:[{utm_zone:37,hemisphere:'S',datum:'WGS84'}]})
  clientQuery.mockImplementation(async(sql:string,values?:unknown[])=>({
    rows:sql.includes('FROM projects')?[{user_id:'alice',utm_zone:37,hemisphere:'S',datum:'WGS84'}]
      :sql.includes('FROM project_reference_systems')?[{utm_zone:37,hemisphere:'S',datum:'WGS84'}]
      :sql.includes('INSERT INTO tolerance_profiles')?[{id:'profile-1'}]:sql.includes('INSERT INTO setout_definitions')?[{id:'definition-1'}]:sql.includes('MAX(revision)')?[{revision:1}]:[],
    rowCount:sql.includes('INSERT INTO setout_points')?((values?.length??2)-2)/8:1,
  }))
  ;(db.getClient as jest.Mock).mockResolvedValue({query:clientQuery,release:jest.fn()})
})
it('retains the supplied pile-grid tolerance profile and snapshot on its stored definition',async()=>{
  const response=await invoke(body)
  expect(response.status).toBe(201)
  const calls=clientQuery.mock.calls as Array<[string,unknown[]?]>
  expect(calls.some(([sql])=>sql.includes('INSERT INTO tolerance_profiles'))).toBe(true)
  const binding=calls.find(([sql])=>sql.includes('UPDATE setout_definitions')&&sql.includes('tolerance_profile_id'))
  expect(binding?.[1]).toContain('profile-1')
  expect(binding?.[1]?.some(v=>typeof v==='string'&&v.includes('setoutToleranceProfileSnapshot')&&v.includes('Synthetic specification'))).toBe(true)
  const points=calls.find(([sql])=>sql.includes('INSERT INTO setout_points'))
  expect(points?.[0]).toContain('metadata')
  expect(points?.[1]?.some(v=>typeof v==='string'&&v.includes('setoutToleranceProfileSnapshot')&&v.includes('Synthetic specification'))).toBe(true)
})
it('rejects a partly entered project criterion before a database write',async()=>{
  const response=await invoke({...body,toleranceProfile:{horizontalMm:'8'}})
  expect(response.status).toBe(400)
  expect(db.getClient).not.toHaveBeenCalled()
})
it('exposes complete saved grid parameters for a source-preserving reload',async()=>{
  ;(db.query as jest.Mock).mockImplementation(async(sql:string)=>({rows:sql.includes('FROM setout_definitions')&&sql.includes('origin_rl')?[{id:'definition-1',origin_rl:0,row_spacing:5,column_spacing:6,start_label:'A1',rotation:0,label_rows_as:'alpha',label_columns_as:'numeric',revision:1}]:[]}))
  const response=await(GET as unknown as(req:NextRequest,ctx:Record<string,unknown>)=>Promise<NextResponse>)(new NextRequest('http://localhost/api/project/p/setout'),{params:{id:'p'},userId:'alice'})
  expect(await response.json()).toMatchObject({data:{definitions:[{id:'definition-1',origin_rl:0,row_spacing:5,column_spacing:6,start_label:'A1',revision:1}]}})
})
