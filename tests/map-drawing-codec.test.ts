/** @jest-environment jsdom */
import VectorSource from 'ol/source/Vector'
import Point from 'ol/geom/Point'
import Circle from 'ol/geom/Circle'
import Feature from 'ol/Feature'
import { decodeMapDrawing,encodeMapDrawing,cloneMapDrawingFeature } from '@/lib/mapDrawing/codec'
import type { MapFeatureCollection } from '@/lib/mapDrawing/wire'
const source:MapFeatureCollection = { type:'FeatureCollection',features:[
  { type:'Feature',id:0,geometry:{ type:'Point',coordinates:[39.125731,-2.852416,0] },properties:{ name:'SYNTHETIC zero',geometry:{ retained:'plain metadata' } } },
  { type:'Feature',id:0,geometry:{ type:'LineString',coordinates:[[39.63,-4.11],[39.631,-4.111]] },properties:{ nested:{ preserve:[0,null,'text'] } } },
  { type:'Feature',geometry:{ type:'MultiPolygon',coordinates:[[[[39.6,-4.1],[39.61,-4.1],[39.61,-4.11],[39.6,-4.1]]]] },properties:null },
] }
test('reopening preserves duplicate/zero/missing source IDs, every geometry and exact unedited data',()=>{
  const features=decodeMapDrawing(source), layer=new VectorSource({features})
  expect(layer.getFeatures()).toHaveLength(3)
  expect(new Set(features.map(f=>f.getId())).size).toBe(3)
  expect(encodeMapDrawing(features)).toEqual(source)
  expect(encodeMapDrawing(features.map(cloneMapDrawingFeature))).toEqual(source)
})
test('a coordinate edit retains the source ID, z and unrelated metadata',()=>{
  const features=decodeMapDrawing(source)
  ;(features[0].getGeometry() as Point).translate(2,3)
  const result=encodeMapDrawing(features.map(cloneMapDrawingFeature))
  expect(result.features[0].id).toBe(0)
  expect((result.features[0].geometry as {coordinates:number[]}).coordinates[2]).toBe(0)
  expect(result.features[0].properties).toEqual(source.features[0].properties)
  expect(result.features[0].geometry).not.toEqual(source.features[0].geometry)
  expect(result.features.slice(1)).toEqual(source.features.slice(1))
})

test('spatial source indexing cannot reorder the retained collection',()=>{
  const original:MapFeatureCollection={type:'FeatureCollection',features:Array.from({length:40},(_,index)=>({
    type:'Feature',id:index%3,geometry:{type:'Point',coordinates:[30+(index*17%40)/100,-2+(index*11%40)/100]},properties:{index},
  }))}
  const layer=new VectorSource({features:decodeMapDrawing(original)})
  expect(encodeMapDrawing(layer.getFeatures())).toEqual(original)
  expect(encodeMapDrawing(layer.getFeatures().map(cloneMapDrawingFeature))).toEqual(original)
})

test('native display circles survive serialization and history without invented survey geometry',()=>{
  const feature=new Feature(new Circle([4300000,-220000],15))
  feature.set('name','SYNTHETIC display circle')
  const encoded=encodeMapDrawing([feature])
  expect(encoded.features[0].geometry).toBeNull()
  expect(encoded.features[0].metarduDisplayGeometry).toEqual({type:'Circle',coordinateCrs:'EPSG:3857',center:[4300000,-220000],radius:15})
  const restored=decodeMapDrawing(encoded).map(cloneMapDrawingFeature)
  expect(restored[0].getGeometry()).toBeInstanceOf(Circle)
  expect(encodeMapDrawing(restored)).toEqual(encoded)
})
