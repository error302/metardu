import { createCaptureDraftData, type BookCaptureSource } from './captureDraft'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
const source:BookCaptureSource={batchId:'33333333-3333-4333-8333-333333333333',observationId:'44444444-4444-4444-8444-444444444444',projectId:project,clientId:'device-01',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,
  raw:{id:'device-01',projectId:project,surveyType:'leveling',station:'TP1',createdAt:'2026-10-21T08:00:00.000Z',backsightReading:0,intermediateReading:1.5,rawForm:{station:'TP1',bs:'0.000',is:'1.5000',fs:'',remarks:'Original notes'}}}
const review={actorId:actor,reviewedAt:'2026-10-21T08:30:00.000Z',requestHash:'b'.repeat(64),bearingEncoding:'uninterpreted' as const}

test('level-book drafts retain exact source strings, measured zero and unknown control without altering originals',()=>{
  const before=JSON.stringify(source)
  const result=createCaptureDraftData('leveling',[source],review)
  expect(result).toMatchObject({openingRL:'',closingRL:'',distanceKm:'',method:'rise_and_fall',rows:[{station:'TP1',bs:'0.000',is:'1.5000',fs:'',remarks:'Original notes'}]})
  expect(result.sourceImport).toMatchObject({authority:'raw_capture_draft',fieldVerified:false,reviewedBy:actor,sources:[{clientId:source.clientId,inputHash:source.inputHash,capturedBy:null,raw:source.raw}]})
  expect(JSON.stringify(source)).toBe(before)
})

const traverse:BookCaptureSource={...source,raw:{...source.raw,surveyType:'traverse',surveyMode:'traverse',instrumentHeight:0,rawForm:{station:'A1',bearing:'045.5056',slopeDist:'125.456000',ih:'0.000',th:'',vaDeg:'',remarks:'Source untouched'}}}
test('traverse drafts leave ambiguous bearings and absent setup values unknown',()=>{
  expect(createCaptureDraftData('traverse',[traverse],review)).toMatchObject({mode:'open',startStation:'',startE:'',startN:'',closeE:'',closeN:'',rows:[{station:'A1',bearing:'',slopeDist:'125.456000',ih:'0.000',th:'',vaDeg:''}]})
})
test('an explicitly adopted packed-DMS bearing uses the existing engine convention without intermediate rounding',()=>{
  const result=createCaptureDraftData('traverse',[traverse],{...review,bearingEncoding:'packed_dms'})
  const row=(result.rows as Record<string,string>[])[0]
  expect(Number(row.bearing)).toBeCloseTo(45+50/60+56/3600,12)
  expect((result.sourceImport as {sources:{raw:unknown}[]}).sources[0].raw).toEqual(traverse.raw)
})
test('decimal and separated-DMS bearings require an explicit adopted encoding',()=>{
  expect((createCaptureDraftData('traverse',[traverse],{...review,bearingEncoding:'decimal_degrees'}).rows as Record<string,string>[])[0].bearing).toBe('45.5056')
  const separated={...traverse,raw:{...traverse.raw,rawForm:{bearing:'45° 50\' 56"',station:'A1',slopeDist:'10'}}}
  expect(Number((createCaptureDraftData('traverse',[separated],{...review,bearingEncoding:'separated_dms'}).rows as Record<string,string>[])[0].bearing)).toBeCloseTo(45+50/60+56/3600,12)
})
test('control drafts retain polar readings but never invent a station or turn grid coordinates into angles',()=>{
  const control={...source,raw:{...source.raw,surveyType:'gnss',surveyMode:'control',rawForm:{pointId:'P0',slopeDistance:'0.000',instrumentHeight:'',targetHeight:'0',bearing:'',verticalAngle:''}}}
  expect(createCaptureDraftData('control',[control],review)).toMatchObject({setups:[{station:{name:'',e:'',n:'',z:''},rows:[{pointId:'P0',slopeDistance:'0.000',instrumentHeight:'',targetHeight:'0',bearing:'',verticalAngle:''}]}]})
  expect(()=>createCaptureDraftData('control',[{...source,raw:{...source.raw,surveyType:'gnss',easting:0,northing:10,rawForm:undefined}}],review)).toThrow(/GNSS|polar/i)
})
test('incompatible survey modes and invalid adopted bearings are refused without a partial book',()=>{
  expect(()=>createCaptureDraftData('traverse',[source],review)).toThrow(/compatible|mode/i)
  const invalid={...traverse,raw:{...traverse.raw,rawForm:{bearing:'45.6099'}}}
  expect(()=>createCaptureDraftData('traverse',[invalid],{...review,bearingEncoding:'packed_dms'})).toThrow(/bearing/i)
})
