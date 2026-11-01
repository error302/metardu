import {buildSurfaceRevisionDrawing} from '../surfaceDrawing'

const observations = [
  {id:'id-a',pointName:'B1',x:500000,y:9850000,z:100,code:'BLD'},
  {id:'id-b',pointName:'B3',x:500020,y:9850020,z:100.4,code:'BLD'},
  {id:'id-c',pointName:'B2',x:500020,y:9850000,z:100.2,code:'BLD'},
  {id:'id-d',pointName:'B4',x:500000,y:9850020,z:100.2,code:'BLD'},
]
const chain = [observations[0],observations[2],observations[1],observations[3]].map(({x,y,z})=>({x,y,z}))
const source = {name:'Synthetic retained terrain',revision:1,revisionId:'revision-example',inputHash:'a'.repeat(64),crs:'EPSG:21037',verticalDatum:'Synthetic local datum',contours:[],snapshot:{observations,breaklines:[{points:chain}]}}

test('canonical observation identity order does not become an invented building outline',()=>{
  const drawing=buildSurfaceRevisionDrawing(source)
  expect(drawing.entities.filter(entity=>entity.kind==='polyline'&&entity.layer==='STRUCT-BUILDING')).toEqual([])
  expect(drawing.entities.filter(entity=>entity.kind==='point'&&entity.layer==='STRUCT-BUILDING')).toHaveLength(4)
  expect(drawing.entities).toContainEqual({kind:'polyline3d',layer:'SURVEY_BREAKLINES_3D',pts:chain.map(point=>[point.x,point.y,point.z])})
})

test('permuting the unordered observations cannot change the reviewed retained feature chain',()=>{
  const other=buildSurfaceRevisionDrawing({...source,snapshot:{...source.snapshot,observations:[...observations].reverse()}})
  const retained=other.entities.filter(entity=>entity.kind==='polyline3d'&&entity.layer==='SURVEY_BREAKLINES_3D')
  expect(retained).toEqual([{kind:'polyline3d',layer:'SURVEY_BREAKLINES_3D',pts:chain.map(point=>[point.x,point.y,point.z])}])
  expect(other.entities.filter(entity=>entity.kind==='polyline'&&entity.layer==='STRUCT-BUILDING')).toHaveLength(0)
})
