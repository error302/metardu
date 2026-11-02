import type {DrawingEntity} from '@/lib/drawing/topoEntities'
import {buildBreaklineTIN} from '../breaklineTIN'
import {generateTINContours} from '../tinContours'
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

const planPoints = Array.from({length:30},(_,index)=>({id:'ground-'+index,pointName:'G'+String(index+1).padStart(2,'0'),x:500000+(index%6)*20,y:9850000+Math.floor(index/6)*20,z:100+index*0.05,code:'SH'})).concat(
 Array.from({length:4},(_,index)=>({id:'edge-'+index,pointName:'E'+(index+1),x:500010,y:9850010+index*20,z:100.2+index*0.16,code:'RD'})),
 Array.from({length:4},(_,index)=>({id:'centre-'+index,pointName:'C'+(index+1),x:500016,y:9850010+index*20,z:100.3+index*0.16,code:'RD-CTR'})),
 [{id:'corner-1',pointName:'B1',x:500065,y:9850025,z:101.5,code:'BLD'},{id:'corner-2',pointName:'B2',x:500085,y:9850025,z:101.6,code:'BLD'},{id:'corner-3',pointName:'B3',x:500085,y:9850045,z:101.8,code:'BLD'},{id:'corner-4',pointName:'B4',x:500065,y:9850045,z:101.7,code:'BLD'}]
)
const planSource={...source,name:'Synthetic topographical site: retained ground for client review',parameters:{interval:0.5},snapshot:{observations:planPoints,breaklines:[{points:planPoints.slice(30,34).map(({x,y,z})=>({x,y,z}))}]}}
const bounds=(text:{e:number;n:number;height:number;text:string;rotation?:number})=>text.rotation===90?{minX:text.e-text.height,maxX:text.e,minY:text.n,maxY:text.n+Array.from(text.text).length*text.height*0.75}:{minX:text.e,minY:text.n,maxX:text.e+Array.from(text.text).length*text.height*0.75,maxY:text.n+text.height}
const intersects=(a:ReturnType<typeof bounds>,b:ReturnType<typeof bounds>)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY

test('the 42-point plan keeps its title, reference, provenance and point labels separate',()=>{
 const drawing=buildSurfaceRevisionDrawing(planSource)
 const text=drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text')
 for(let index=0;index<text.length;index++)for(let other=index+1;other<text.length;other++)expect({first:text[index].text,second:text[other].text,overlap:intersects(bounds(text[index]),bounds(text[other]))}).toMatchObject({overlap:false})
 expect(text.some(entity=>entity.text.includes('0.5 m'))).toBe(true)
 expect(drawing).toHaveProperty('layout.omittedPointLabels',0)
 expect(drawing.entities.filter(entity=>entity.kind==='point'&&entity.layer!=='LEGEND')).toHaveLength(42)
})

test('the complete map includes every annotation inside the sheet frame',()=>{
 const drawing=buildSurfaceRevisionDrawing(planSource)
 for(const text of drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text')){const area=bounds(text);expect(area.minX).toBeGreaterThanOrEqual(drawing.extents.minX);expect(area.maxX).toBeLessThanOrEqual(drawing.extents.maxX);expect(area.minY).toBeGreaterThanOrEqual(drawing.extents.minY);expect(area.maxY).toBeLessThanOrEqual(drawing.extents.maxY)}
 const surveyBounds={minX:500000,maxX:500100,minY:9850000,maxY:9850080}
 for(const text of drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text'&&entity.layer==='LEGEND'))expect(intersects(bounds(text),surveyBounds)).toBe(false)
})


test('four retained contour levels stay labelled without covering the point annotations',()=>{
 const contours=[100.5,101,101.5,102].map((elevation,index)=>({elevation,isIndex:false,coordinates:[Array.from({length:81},(_,n):[number,number]=>[500021+index*20,9850000+n])]}))
 const drawing=buildSurfaceRevisionDrawing({...planSource,contours})
 const text=drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text')
 for(let index=0;index<text.length;index++)for(let other=index+1;other<text.length;other++)expect(intersects(bounds(text[index]),bounds(text[other]))).toBe(false)
 expect(drawing.layout.omittedPointLabels).toBe(0)
 expect(drawing.layout.omittedContourLabels).toBe(0)
 for(const contour of contours)expect(text.some(entity=>entity.text===contour.elevation.toFixed(3))).toBe(true)
})


test('long recorded titles and references wrap within the sheet without losing source labels',()=>{
 const drawing=buildSurfaceRevisionDrawing({...planSource,projectId:'11111111-1111-4111-8111-111111111111',name:'Synthetic project description '.repeat(5),verticalDatum:'Synthetic local benchmark 100.000 m; no field control. '.repeat(3)})
 expect(drawing.layout.omittedPointLabels).toBe(0)
 const text=drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text')
 for(let index=0;index<text.length;index++){const area=bounds(text[index]);expect(area.minX).toBeGreaterThanOrEqual(drawing.extents.minX);expect(area.maxX).toBeLessThanOrEqual(drawing.extents.maxX);expect(area.minY).toBeGreaterThanOrEqual(drawing.extents.minY);expect(area.maxY).toBeLessThanOrEqual(drawing.extents.maxY);for(let other=index+1;other<text.length;other++)expect(intersects(area,bounds(text[other]))).toBe(false)}
 expect(text.some(entity=>entity.text.includes('11111111-1111-4111-8111-111111111111'))).toBe(true)
})


test('the demonstration TIN contours and all 42 actual synthetic heights fit the plan',()=>{
 const observations=planPoints.map(point=>{const x=point.x-500000,y=point.y-9850000;return{...point,z:+(100+.015*x+.008*y+.5*Math.exp(-((x-60)**2+(y-40)**2)/800)).toFixed(3)}})
 const breaklines=[{points:observations.slice(30,34).map(({x,y,z})=>({x,y,z})),type:'hard' as const}]
 const contours=generateTINContours(buildBreaklineTIN(observations,breaklines),{interval:.5,maxVertexSpacing:1})
 const drawing=buildSurfaceRevisionDrawing({...planSource,contours,snapshot:{observations:[...observations].reverse(),breaklines}})
 expect(contours.map(contour=>contour.elevation)).toEqual([100.5,101,101.5,102])
 expect(drawing.layout.omittedPointLabels).toBe(0)
 expect(drawing.layout.omittedContourLabels).toBe(0)
 const text=drawing.entities.filter((entity):entity is Extract<DrawingEntity,{kind:'text'}>=>entity.kind==='text')
 for(let index=0;index<text.length;index++)for(let other=index+1;other<text.length;other++)expect({first:text[index].text,second:text[other].text,overlap:intersects(bounds(text[index]),bounds(text[other]))}).toMatchObject({overlap:false})
})
