/** @jest-environment node */
import type { FeatureCollection, Geometry } from 'geojson'
import { measureMapGridDrawing } from '@/lib/mapDrawing/metrics'
import { transformPoint } from '@/lib/spatial/projectCrs'
const crs = 'EPSG:32737'
const otherGrids={northern:'EPSG:32632',southern:'EPSG:32736'}
const rect = (x: number, y: number, width: number, height: number) => [[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]].map(([e,n]) => transformPoint(e,n,crs,'EPSG:4326'))
const outer = rect(500000,9800000,100,50), hole = rect(500010,9800010,20,10)
const collection = (...geometries: Geometry[]): FeatureCollection => ({ type: 'FeatureCollection', features: geometries.map(geometry => ({ type: 'Feature', geometry, properties: {} })) })
test('polygon area excludes holes and boundary length includes every ring', () => {
  const result = measureMapGridDrawing(collection({ type: 'Polygon', coordinates: [outer,hole] }),crs)
  expect(result.status).toBe('available'); expect(result.areaSqM).toBeCloseTo(4800,3); expect(result.polygonBoundaryLengthM).toBeCloseTo(360,4)
})
test('multipolygons and multilines include all members', () => {
  const line = [[500000,9800000],[500003,9800004]].map(([e,n]) => transformPoint(e,n,crs,'EPSG:4326'))
  const result = measureMapGridDrawing(collection({ type: 'MultiPolygon', coordinates: [[outer,hole],[rect(500200,9800000,20,10)]] }, { type: 'MultiLineString', coordinates: [line,line] }),crs)
  expect(result.areaSqM).toBeCloseTo(5000,3); expect(result.lineLengthM).toBeCloseTo(10,5); expect(result.totalLengthM).toBeCloseTo(430,4)
})
test.each([null,'EPSG:3857','EPSG:4326','EPSG:999999'])('missing or unsuitable grid %s cannot become successful zero metrics', grid => {
  const result = measureMapGridDrawing(collection({ type: 'Polygon', coordinates: [outer] }),grid)
  expect(result.status).toBe('unavailable'); expect(result.areaSqM).toBeNull(); expect(result.totalLengthM).toBeNull(); expect(result.reason).toBeTruthy()
})
test('invalid hole topology is retained as geometry but cannot produce numeric metrics', () => {
  const result = measureMapGridDrawing(collection({ type: 'Polygon', coordinates: [outer,rect(500200,9800000,20,10)] }),crs)
  expect(result.status).toBe('unavailable'); expect(result.areaSqM).toBeNull()
})

test.each(Object.values(otherGrids))('known rectangle metrics follow the stated grid %s',grid=>{
  const northing=grid===otherGrids.northern?1000000:8000000
  const ring=[[500000,northing],[500040,northing],[500040,northing+30],[500000,northing+30],[500000,northing]].map(([e,n])=>transformPoint(e,n,grid,'EPSG:4326'))
  const result=measureMapGridDrawing(collection({type:'Polygon',coordinates:[ring]}),grid)
  expect(result.status).toBe('available');expect(result.areaSqM).toBeCloseTo(1200,3);expect(result.totalLengthM).toBeCloseTo(140,4)
})

test.each([
  {rings:[outer,hole,rect(500015,9800012,20,10)]},
  {rings:[outer,hole,rect(500012,9800012,2,2)]},
  {rings:[outer,rect(500000,9800010,20,10)]},
])('overlapping, nested or boundary-touching holes fail closed',({rings})=>{
  const result=measureMapGridDrawing(collection({type:'Polygon',coordinates:rings}),crs)
  expect(result.status).toBe('unavailable');expect(result.areaSqM).toBeNull()
})

test('self-intersection, overlapping multipolygon members and excessive geometry cannot become numeric success',()=>{
  const bow=[outer[0],outer[2],outer[1],outer[3],outer[0]]
  for(const geometry of [
    {type:'Polygon',coordinates:[bow]},
    {type:'MultiPolygon',coordinates:[[outer],[outer]]},
    {type:'MultiPoint',coordinates:Array.from({length:2001},()=>outer[0])},
  ] as Geometry[]){expect(measureMapGridDrawing(collection(geometry),crs).status).toBe('unavailable')}
})
