import {act,renderHook} from '@testing-library/react'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Circle from 'ol/geom/Circle'
import Point from 'ol/geom/Point'
import {useMapInteractions} from '../useMapInteractions'
import {decodeMapDrawing} from '@/lib/mapDrawing/codec'
import {transformPoint} from '@/lib/spatial/projectCrs'
import {parseLandXML} from '@/lib/import/totalStation/parseLandXML'
import type {MapFeatureCollection} from '@/lib/mapDrawing/wire'
const grid='EPSG:32737'
const position=(e:number,n:number,z?:number)=>[...transformPoint(e,n,grid,'EPSG:4326'),...(z==null?[]:[z])]
const ring=(e:number,n:number)=>[[e,n],[e+10,n],[e+10,n+10],[e,n+10],[e,n]].map(([x,y])=>position(x,y))
const collection:MapFeatureCollection={type:'FeatureCollection',features:[
  {type:'Feature',id:0,properties:{name:'SYNTHETIC polygon'},geometry:{type:'Polygon',coordinates:[ring(500000,9800000),ring(500002,9800002)]}},
  {type:'Feature',id:0,properties:{name:'SYNTHETIC duplicate'},geometry:{type:'MultiPoint',coordinates:[position(500120,9800070,0),position(500130,9800070)]}},
  {type:'Feature',properties:{name:'SYNTHETIC collection'},geometry:{type:'GeometryCollection',geometries:[{type:'LineString',coordinates:[position(500150,9800000),position(500160,9800010)]},{type:'Point',coordinates:position(500170,9800010)}]}},
]}
const originalFetch=global.fetch,originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
let captured:Blob|undefined
beforeEach(()=>{
  captured=undefined
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({referenceSystem:{prs:{zone:37,hemisphere:'S',datum:'WGS84',horizontalCrs:grid,verticalDatum:'SYNTHETIC declared orthometric BM',verticalReference:'orthometric'}}})})) as unknown as typeof fetch
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:jest.fn((blob:Blob)=>{captured=blob;return 'blob:synthetic-export'})})
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:jest.fn()})
  jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
})
afterEach(()=>{
  global.fetch=originalFetch;jest.restoreAllMocks()
  if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else Reflect.deleteProperty(URL,'createObjectURL')
  if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else Reflect.deleteProperty(URL,'revokeObjectURL')
})
function harness(source:VectorSource){
  const setSaveMsg=jest.fn<void,[string]>()
  const params={currentSurveyCrs:grid,projectId:'synthetic-export-project',mapInstance:{current:null},drawSourceRef:{current:source},hasFeature:()=>true,setSaveMsg} as unknown as Parameters<typeof useMapInteractions>[0]
  return {...renderHook(()=>useMapInteractions(params)),setSaveMsg}
}
async function contents(){
  if(!captured)throw new Error('Expected a complete LandXML download')
  return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(captured as Blob)})
}
test('LandXML retains every polygon ring and collection member, with unique names and no invented vertical reference',async()=>{
  const source=new VectorSource({features:decodeMapDrawing(collection)}),h=harness(source)
  await act(async()=>h.result.current.exportFeatures('LandXML'))
  const xml=await contents(),parsed=parseLandXML(xml)
  expect(parsed.errors).toEqual([])
  expect(parsed.records).toHaveLength(15)
  expect(new Set(parsed.records.map(p=>p.pointId)).size).toBe(15)
  expect(xml.match(/<PlanFeature /g)).toHaveLength(3)
  expect(xml).toContain('polygon-hole')
  expect(xml).toContain('map_drawing_unverified')
  expect(xml).not.toContain('verticalDatum=')
  expect(parsed.records.find(p=>Math.abs((p.easting??0)-500120)<0.001)?.elevation).toBe(0)
  expect(parsed.records.find(p=>Math.abs((p.easting??0)-500130)<0.001)?.elevation).toBeUndefined()
  expect(source.getFeatures()).toHaveLength(3)
  h.unmount()
})
test('an unsupported circle refuses the whole LandXML export without clearing its source',async()=>{
  const source=new VectorSource({features:[new Feature(new Point([4300000,-220000])),new Feature(new Circle([4300000,-220000],10))]}),h=harness(source)
  await act(async()=>h.result.current.exportFeatures('LandXML'))
  expect(captured).toBeUndefined()
  expect(h.setSaveMsg.mock.calls.at(-1)?.[0]).toMatch(/circle|Circle/)
  expect(source.getFeatures()).toHaveLength(2);h.unmount()
})
