/** @jest-environment jsdom */
import { renderHook,act } from '@testing-library/react'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { useSavedProjectDrawing } from '@/app/map/hooks/useSavedProjectDrawing'
import { useMapState } from '@/app/map/hooks/useMapState'
import { drawingDraftKey } from '@/lib/mapDrawing/draft'
import type { MapFeatureCollection } from '@/lib/mapDrawing/wire'
const features={type:'FeatureCollection',features:[{type:'Feature',id:0,geometry:{type:'Point',coordinates:[39,-2]},properties:{role:'SYNTHETIC original'}}]}
const baseline={projectId:'project-a',viewerId:'user-a',name:'SYNTHETIC map',version:'a'.repeat(64),features,coordinateCrs:'EPSG:4326',referenceSource:'missing',metrics:{status:'unavailable',areaSqM:null,polygonBoundaryLengthM:null,lineLengthM:null,totalLengthM:null,crs:null,reason:'Reference not declared'}}
const reply=(value:unknown,status=200)=>({ok:status<400,status,json:async()=>value})
type MockRequest=jest.Mock<Promise<ReturnType<typeof reply>>,[string,RequestInit?]>
const requests=()=>fetch as unknown as MockRequest
function sentRequest(){
  const options=requests().mock.calls[1]?.[1]
  if(!options||typeof options.body!=='string')throw new Error('Expected a JSON drawing save')
  return {headers:new Headers(options.headers),body:JSON.parse(options.body) as {features:MapFeatureCollection}}
}
function translateFirst(p:ReturnType<typeof params>){
  const geometry=p.source.current.getFeatures()[0]?.getGeometry()
  if(!geometry)throw new Error('Expected a loaded drawing feature')
  geometry.translate(2,3)
}
const originalFetch=global.fetch
const originalRandomUUIDDescriptor=Object.getOwnPropertyDescriptor(global.crypto,'randomUUID')
let sequence=0
beforeEach(()=>{
  jest.useFakeTimers();localStorage.clear();sequence=0
  Object.defineProperty(global.crypto,'randomUUID',{configurable:true,value:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`})
  global.fetch=jest.fn(async()=>reply(baseline)) as unknown as typeof fetch
})
afterEach(()=>{global.fetch=originalFetch;if(originalRandomUUIDDescriptor)Object.defineProperty(global.crypto,'randomUUID',originalRandomUUIDDescriptor);else Reflect.deleteProperty(global.crypto,'randomUUID');jest.useRealTimers()})
function params(source=new VectorSource()) {return {projectId:'project-a',mapReady:true,source:{current:source},map:{current:null},pushHistory:jest.fn(),clearHistory:jest.fn(),setMessage:jest.fn()}}
test('a linked project restores saved geometry without reading or changing the unlinked drawing record',async()=>{
  localStorage.setItem('metardu-map-features','PRESERVE unlinked training record')
  const p=params(),h=renderHook(()=>useSavedProjectDrawing(p))
  await act(async()=>{})
  expect(p.source.current.getFeatures()).toHaveLength(1)
  expect(h.result.current.snapshot?.version).toBe(baseline.version)
  expect(localStorage.getItem('metardu-map-features')).toBe('PRESERVE unlinked training record')
  expect(JSON.parse(localStorage.getItem(drawingDraftKey('project-a','user-a'))??'null') as unknown).toMatchObject({viewerId:'user-a',projectId:'project-a',features})
  h.unmount()
})
test('failed loading cannot clear a current local drawing',async()=>{
  requests().mockRejectedValueOnce(new Error('Network unavailable'))
  const source=new VectorSource({features:[new Feature({geometry:new Point([0,0])})]}),p=params(source),h=renderHook(()=>useSavedProjectDrawing(p))
  await act(async()=>{})
  expect(h.result.current.error).toContain('not been cleared');expect(source.getFeatures()).toHaveLength(1)
  expect(h.result.current.snapshot).toBeNull();h.unmount()
})

test('editing retains collection metadata while removing a stale bounding box',async()=>{
  const saved={...baseline,features:{...features,bbox:[39,-2,39,-2],surveyNotes:{source:'SYNTHETIC original metadata'}}}
  requests().mockResolvedValueOnce(reply(saved))
  const p=params(),h=renderHook(()=>useSavedProjectDrawing(p));await act(async()=>{})
  expect(h.result.current.dirty).toBe(false)
  act(()=>translateFirst(p))
  requests().mockResolvedValueOnce(reply({error:'Retained test draft'},409))
  await act(async()=>h.result.current.save())
  const sent=sentRequest().body.features
  expect(sent.surveyNotes).toEqual(saved.features.surveyNotes)
  expect(sent.bbox).toBeUndefined()
  h.unmount()
})
test('a rejected save retains the local draft and account binding, then reload/merge preserves both versions',async()=>{
  const p=params(),h=renderHook(()=>useSavedProjectDrawing(p));await act(async()=>{})
  act(()=>translateFirst(p))
  requests().mockResolvedValueOnce(reply({error:'Saved drawing changed'},409))
  await act(async()=>h.result.current.save())
  expect(h.result.current.error).toContain('Saved drawing changed')
  const sent=sentRequest()
  expect(sent.headers.get('X-Metardu-Expected-User')).toBe('user-a')
  const local=sent.body.features
  expect(JSON.parse(localStorage.getItem(drawingDraftKey('project-a','user-a'))??'null') as unknown).toMatchObject({features:local})
  const changed={...baseline,version:'b'.repeat(64),features:{...features,features:[{...features.features[0],geometry:{type:'Point',coordinates:[39.1,-2.1]}}]}}
  requests().mockResolvedValueOnce(reply(changed))
  await act(async()=>h.result.current.reload())
  expect(h.result.current.retained?.features).toEqual(local)
  expect(Object.keys(localStorage).some(key=>key.includes(':recovery:'))).toBe(true)
  act(()=>h.result.current.mergeRetained())
  expect(p.source.current.getFeatures()).toHaveLength(2)
  expect(h.result.current.snapshot?.version).toBe(changed.version)
  expect(h.result.current.notice).toContain('no version was chosen automatically')
  h.unmount()
})
test('a malformed browser record stays intact while the saved project drawing remains usable',async()=>{
  const key=drawingDraftKey('project-a','user-a');localStorage.setItem(key,'MALFORMED ORIGINAL TO RETAIN')
  const p=params(),h=renderHook(()=>useSavedProjectDrawing(p));await act(async()=>{})
  expect(p.source.current.getFeatures()).toHaveLength(1)
  expect(h.result.current.cacheWarning).toContain('Existing browser records are retained')
  expect(localStorage.getItem(key)).toBe('MALFORMED ORIGINAL TO RETAIN');h.unmount()
})
test('old global persistence never writes project drawings into the unlinked workspace',()=>{
  localStorage.setItem('metardu-map-features','PRESERVE')
  const source={current:new VectorSource({features:[new Feature({geometry:new Point([0,0])})]})},map={current:{getView:()=>({getCenter:()=>[0,0],getZoom:()=>10})} as never}
  const h=renderHook(()=>useMapState(map,source,true,'project-a',true))
  act(()=>jest.advanceTimersByTime(20000));h.unmount()
  expect(localStorage.getItem('metardu-map-features')).toBe('PRESERVE')
})
test('a failed original browser restore prevents background replacement or deletion',()=>{
  localStorage.setItem('metardu-map-features','PRESERVE MALFORMED')
  const source={current:new VectorSource()},map={current:{getView:()=>({getCenter:()=>[0,0],getZoom:()=>10})} as never}
  const h=renderHook(()=>useMapState(map,source,true,null,false))
  act(()=>jest.advanceTimersByTime(20000));h.unmount()
  expect(localStorage.getItem('metardu-map-features')).toBe('PRESERVE MALFORMED')
})
