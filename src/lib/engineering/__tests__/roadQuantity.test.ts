import {roadQuantityInputs,calculateRoadQuantityRun,roadQuantityCsv} from '../roadQuantity'
import type {RoadDesignData} from '@/types/engineering'

const reference={code:'EPSG:32737',verticalDatum:'Synthetic BM',distanceMode:'grid' as const}
const otherFixtureCrs='EPSG:21037'
const template={carriagewayWidth:6,shoulderWidth:0,camber:0,subgradeDepth:0,cutSlope:'1:1',fillSlope:'1:1'}
const road=():RoadDesignData=>({roadName:'Synthetic Road',startChainage:0,coordinateSystem:reference.code,datum:'WGS84',designSpeed:40,roadClass:'C',ips:[],vips:[],crossSectionTemplate:template,
  stations:[0,20].map(chainage=>({chainage,groundLevel:0,designLevel:-1,groundProfile:[{offset:-10,level:0},{offset:0,level:0},{offset:10,level:0}]}))})

it('retains zero/negative inputs and computes the independently known 7 m2 section over 20m',()=>{
  const result=calculateRoadQuantityRun(road(),reference)
  expect(result.inputs.road.stations[0]).toMatchObject({groundLevel:0,designLevel:-1})
  expect(result.result.rows.map(row=>row.cutArea)).toEqual([7,7])
  expect(result.result.totalCut).toBe(140)
  expect(result.result.totalFill).toBe(0)
  expect(result.result.rows[0].cutVolume).toBe(0)
  expect(result.status).toBe('DRAFT')
  expect(result.algorithmVersion).toBe('1.0.1')
})

it('uses the saved vertical design rather than caller cached target levels',()=>{
  const input=road();input.vips=[{id:'A',chainage:0,reducedLevel:-1},{id:'B',chainage:20,reducedLevel:-1}]
  input.stations=input.stations.map(station=>({...station,designLevelSource:'vertical-alignment',designLevel:999}))
  expect(calculateRoadQuantityRun(input,reference).result.totalCut).toBe(140)
  expect(roadQuantityInputs(input,reference).road.stations[0].designLevel).toBeNull()
})

it('refuses unknown references, mismatched CRS, missing targets and insufficient measured daylight',()=>{
  expect(()=>calculateRoadQuantityRun(road(),{...reference,verticalDatum:null})).toThrow(/vertical/i)
  expect(()=>calculateRoadQuantityRun(road(),{...reference,code:'EPSG:3857'})).toThrow()
  expect(()=>calculateRoadQuantityRun(road(),{...reference,code:otherFixtureCrs})).toThrow(/match/i)
  const missing=road();missing.stations[0].designLevel=undefined
  expect(()=>calculateRoadQuantityRun(missing,reference)).toThrow(/design/i)
  const short=road();short.stations[0].groundProfile=[{offset:-1,level:0},{offset:1,level:0}]
  expect(()=>calculateRoadQuantityRun(short,reference)).toThrow(/measured|daylight/i)
})

it('excludes untrusted derived caches while retaining meaningful source changes in its input identity',()=>{
  const input=road(),original=JSON.stringify(roadQuantityInputs(input,reference))
  input.stations[0].cutArea=999;input.earthworksTable=[{chainage:0,cutArea:999,fillArea:0,cutVolume:999,fillVolume:0,cumulativeCut:999,cumulativeFill:0}]
  expect(JSON.stringify(roadQuantityInputs(input,reference))).toBe(original)
  const points=input.stations[0].groundProfile
  if(!points)throw new Error('Missing synthetic ground profile')
  points[0].level=1
  expect(JSON.stringify(roadQuantityInputs(input,reference))).not.toBe(original)
  input.stations[0].groundLevel=NaN
  expect(()=>roadQuantityInputs(input,reference)).toThrow(/finite/i)
})

it('exports the selected archived run identity, basis, units and exact quantities',()=>{
  const calculation=calculateRoadQuantityRun(road(),reference)
  const csv=roadQuantityCsv({id:'run',revision:'R01',status:'SUPERSEDED',created_at:'2026-10-16T00:00:00Z',created_by:'actor',quantity:{...calculation,inputHash:'a'.repeat(64),outputHash:'b'.repeat(64),clientRunId:'delivery'}})
  expect(csv).toContain('Input_SHA256')
  expect(csv).toContain('SUPERSEDED')
  expect(csv).toContain('DRAFT')
  expect(csv).toContain('Synthetic BM')
  expect(csv).toContain('average-end-area')
  expect(csv).toContain('140')
  expect(csv).not.toContain('999')
  const old={...calculation,algorithmVersion:'1.0.0',inputHash:'a'.repeat(64),outputHash:'b'.repeat(64),clientRunId:'old-delivery'}
  const prior=roadQuantityCsv({id:'old-run',revision:'R00',status:'SUPERSEDED',created_at:'2026-10-16T00:00:00Z',created_by:'actor',quantity:old})
  expect(prior).toContain('Earlier profile arithmetic')
  expect(prior).toContain('1.0.0')
})
