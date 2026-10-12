import { fieldControlSchema, assessFieldControl } from '@/lib/engine/fieldControlCheck'
const body = { projectId:'00000000-0000-4000-8000-000000000001', pointId:'00000000-0000-4000-8000-000000000002', requestId:'00000000-0000-4000-8000-000000000003', pointType:'survey_point', observedAt:'2026-10-09T08:00:00Z', condition:'good', method:'total_station', instrument:'Synthetic TS', evidenceReference:'Synthetic field book page 1', measuredEasting:103, measuredNorthing:204, horizontalTolerance:5, toleranceReference:'Synthetic job specification', measuredElevation:null, verticalTolerance:null }
const base = {easting:100,northing:200,elevation:0}
Object.assign(body,{basisHash:'a'.repeat(64)})
test('declared criterion compares a 3-4-5 vector and preserves zero height',()=>{
 const parsed=fieldControlSchema.parse(body)
 expect(assessFieldControl(base,parsed)).toMatchObject({deltaE:3,deltaN:4,horizontalDisplacement:5,horizontalPass:true,verticalPass:null,status:'within_declared_tolerance',certified:false})
 expect(assessFieldControl(base,{...parsed,measuredElevation:0,verticalTolerance:0})).toMatchObject({deltaH:0,verticalPass:true})
 expect(assessFieldControl(base,{...parsed,horizontalTolerance:4.9}).status).toBe('exceeds_declared_tolerance')
})
test('visual inspection does not claim a measurement or tolerance result',()=>{
 const parsed=fieldControlSchema.parse({...body,method:'visual',measuredEasting:null,measuredNorthing:null,horizontalTolerance:null,toleranceReference:null,instrument:null})
 expect(assessFieldControl(base,parsed)).toMatchObject({horizontalDisplacement:null,horizontalPass:null,status:'not_measured'})
 expect(assessFieldControl(base,{...parsed,condition:'missing'}).status).toBe('unsuitable_condition')
})
test('height-only levelling checks signed height difference without invented horizontal data',()=>{
 const parsed=fieldControlSchema.parse({...body,method:'level',measuredEasting:null,measuredNorthing:null,horizontalTolerance:null,measuredElevation:-0.02,verticalTolerance:0.01})
 expect(assessFieldControl(base,parsed)).toMatchObject({deltaH:-0.02,horizontalPass:null,verticalPass:false,status:'exceeds_declared_tolerance'})
 expect(()=>assessFieldControl({...base,elevation:null},parsed)).toThrow('height')
})
test('finite complete observations, actual dates and criterion evidence are required',()=>{
 for(const change of [{measuredEasting:'103garbage'},{measuredNorthing:null},{horizontalTolerance:null},{toleranceReference:''},{evidenceReference:''},{observedAt:'2026-02-30T00:00:00Z'},{measuredEasting:Infinity},{published_easting:100},{fieldVerified:true},{method:'visual'}])
  expect(fieldControlSchema.safeParse({...body,...change}).success).toBe(false)
 expect(assessFieldControl(base,fieldControlSchema.parse({...body,condition:'disturbed'})).status).toBe('unsuitable_condition')
})
