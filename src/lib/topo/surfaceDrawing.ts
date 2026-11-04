/** Retained terrain geometry and a separate, inspectable draft-plan layout. */
import { buildTopoEntities, type Extents } from '@/lib/drawing/topoEntities'
import { getFeatureCode } from './featureCodes'
import type { ContourLine } from './contourGenerator'
import type { TerrainDomain } from './terrainDomain'

interface SurfaceDrawingSource {
  name: string; revision: number; revisionId: string; inputHash: string; crs: string; verticalDatum: string
  projectId?: string
  parameters?: { interval?: unknown }
  contours: ContourLine[]
  snapshot: { observations: Array<{ id: string; pointName: string | null; x: number; y: number; z: number; code: string | null }>;
    breaklines?: Array<{ points: Array<{x:number;y:number;z:number}> }>; terrainDomain?: (TerrainDomain & { sourceLabel: string }) | null }
  domain?: { area: number; derivedVertexCount: number } | null
}
type Box = Extents
type Segment = Box & { a: [number, number]; b: [number, number] }
const intersects = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
const lineBox = (a: [number,number], b: [number,number]): Box => ({minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])})
/** Bounded spatial buckets; long obstacles are retained globally, never truncated. */
class SpatialIndex<T extends Box> {
  private cells = new Map<string,T[]>()
  private global: T[] = []
  constructor(private size: number) {}
  private keys(box: Box) {
    const x0=Math.floor(box.minX/this.size),x1=Math.floor(box.maxX/this.size),y0=Math.floor(box.minY/this.size),y1=Math.floor(box.maxY/this.size)
    if((x1-x0+1)*(y1-y0+1)>1024)return null
    const keys:string[]=[]
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)keys.push(`${x}:${y}`)
    return keys
  }
  add(item:T) { const keys=this.keys(item);if(!keys){this.global.push(item);return}for(const key of keys){const cell=this.cells.get(key)??[];cell.push(item);this.cells.set(key,cell)} }
  query(box:Box) { const keys=this.keys(box);return new Set(keys?[...this.global,...keys.flatMap(key=>this.cells.get(key)??[])]:[...this.global,...[...this.cells.values()].flat()]) }
}
function crosses(segment:Segment,box:Box) {
  const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1]
  let lower=0,upper=1
  for(const [p,q] of [[-dx,segment.a[0]-box.minX],[dx,box.maxX-segment.a[0]],[-dy,segment.a[1]-box.minY],[dy,box.maxY-segment.a[1]]]){
    if(p===0){if(q<0)return false;continue}
    const t=q/p
    if(p<0)lower=Math.max(lower,t);else upper=Math.min(upper,t)
    if(lower>upper)return false
  }
  return true
}
function wrap(text:string,columns:number) {
  const lines:string[]=[]
  let line=''
  for(const word of text.trim().split(/\s+/)){
    if(line&&Array.from(line+' '+word).length>columns){lines.push(line);line=''}
    const chars=Array.from(word)
    while(chars.length>columns){if(line){lines.push(line);line=''}lines.push(chars.splice(0,columns).join(''))}
    if(chars.length)line+=(line?' ':'')+chars.join('')
  }
  if(line)lines.push(line)
  return lines
}

export function buildSurfaceRevisionDrawing(source:SurfaceDrawingSource) {
  const points=source.snapshot.observations.map(point=>({id:point.id,pointNumber:point.pointName??point.id,easting:point.x,northing:point.y,elevation:point.z,code:point.code??''}))
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity
  for(const point of points){x0=Math.min(x0,point.easting);x1=Math.max(x1,point.easting);y0=Math.min(y0,point.northing);y1=Math.max(y1,point.northing)}
  const span=Math.max(1,x1-x0,y1-y0)
  // Canonical identity order cannot establish feature connectivity.
  const drawing=buildTopoEntities(points,{scale:1000,includeSpotHeights:false,includeTitleBlock:false,includeLabels:false,includeLegend:false,gridTickInterval:span/10},
    {projectName:source.name,featureLineMode:'explicit-only',reference:{horizontalCrs:source.crs,verticalDatum:source.verticalDatum},contours:source.contours,labelContours:false})
  const mapFrame={...drawing.extents}
  drawing.entities=drawing.entities.filter(entity=>entity.kind==='point'||(entity.kind==='line'&&entity.layer==='GRID')||((entity.kind==='polyline'||entity.kind==='polyline3d')&&entity.layer!=='BORDER'&&entity.layer!=='LEGEND'))
  const entities=drawing.entities
  const layer=(name:string,colorHex='#ffffff')=>{if(!drawing.layers.some(value=>value.name===name))drawing.layers.push({name,colorHex,lineTypeName:'CONTINUOUS'})}
  for(const name of ['POINT_LABELS','PLAN_LEADERS'])layer(name,name==='PLAN_LEADERS'?'#808080':'#ffffff')
  if(source.snapshot.terrainDomain){
    layer('TERRAIN_BOUNDARY','#00ff00');layer('TERRAIN_EXCLUSIONS','#ff0000')
    for(const region of source.snapshot.terrainDomain.regions)for(const [ring,name]of [[region.outer,'TERRAIN_BOUNDARY'],...region.holes.map(hole=>[hole,'TERRAIN_EXCLUSIONS'] as const)] as const){
      const pts:Array<[number,number]>=ring.map(point=>[point.x,point.y]);if(pts.length>3&&pts[0][0]===pts.at(-1)?.[0]&&pts[0][1]===pts.at(-1)?.[1])pts.pop()
      entities.push({kind:'polyline',layer:name,pts,closed:true})
    }
  }
  if(source.snapshot.breaklines?.length){layer('SURVEY_BREAKLINES_3D','#00ffff');for(const line of source.snapshot.breaklines)entities.push({kind:'polyline3d',layer:'SURVEY_BREAKLINES_3D',pts:line.points.map(point=>[point.x,point.y,point.z])})}
  const interval=source.parameters?.interval
  const intervalText=typeof interval==='number'&&Number.isFinite(interval)&&interval>0?`${interval} m`:'not recorded'
  const legendRows=drawing.layerResults.map(result=>({name:result.layer,text:`${getFeatureCode(source.snapshot.observations.find(point=>getFeatureCode(point.code??'')?.dxfLayer===result.layer)?.code??'')?.description??result.layer} (${result.points.length})`,line:false}))
  if(source.contours.length)legendRows.push({name:'CONTOURS',text:`Contours; interval ${intervalText}`,line:true})
  if(source.snapshot.breaklines?.length)legendRows.push({name:'SURVEY_BREAKLINES_3D',text:'Reviewed XYZ breaklines',line:true})
  if(source.snapshot.terrainDomain)legendRows.push({name:'TERRAIN_BOUNDARY',text:'Reviewed terrain boundary',line:true},{name:'TERRAIN_EXCLUSIONS',text:'Terrain exclusions',line:true})
  const metadata=[`Surface: ${source.name} | R${source.revision}`,`CRS: ${source.crs} | Horizontal and height units: metres`,
    `Height reference: ${source.verticalDatum}`,`${points.length} retained observations | ${source.contours.length} contour levels | Interval: ${intervalText}`,
    ...(source.projectId?[`Project ID: ${source.projectId}`]:[]),`Surface revision: ${source.revisionId}`,`Input SHA-256: ${source.inputHash}`,
    'Survey date: not recorded in this surface | Review: pending',
    'COMPUTED DRAFT | Independent survey review and field acceptance required.']
  if(source.domain)metadata.push(`Terrain mask area: ${source.domain.area.toFixed(3)} m2 | ${source.domain.derivedVertexCount} derived clip vertices`)
  const reportIndex=metadata.length,contourPathCount=source.contours.reduce((total,contour)=>total+contour.coordinates.length,0)
  metadata.push(`Point labels: ${points.length}/${points.length} | Omitted contour labels: ${contourPathCount} | All coordinates retained.`)
  // Keep the annotation scale tied to the survey extent. Long evidence text
  // may require a larger sheet; it must not enlarge labels over the observations.
  const scales=Array.from({length:12},(_,exponent)=>[1,2,2.5,5].map(factor=>factor*10**exponent)).flat()
  const nominalScale=scales.find(value=>span/value*1000<=200)
  if(!nominalScale)throw new RangeError('The drawing extent exceeds the supported plan scale.')
  const h=nominalScale*0.0025,panelWidth=34*h,gap=2*h
  const width=mapFrame.maxX-mapFrame.minX+gap+panelWidth
  const columns=Math.max(8,Math.floor((width-4*h)/h))
  const footerLines=metadata.flatMap(value=>wrap(value,columns)),footerHeight=(footerLines.length*1.6+6)*h
  const legendHeight=(32+legendRows.reduce((rows,row)=>rows+wrap(row.text,25).length*1.5+1,0))*h
  const height=Math.max(mapFrame.maxY-mapFrame.minY,legendHeight)+gap+footerHeight
  const paper=[{name:'A4 landscape',width:277,height:190},{name:'A3 landscape',width:400,height:277},{name:'A2 landscape',width:574,height:400},{name:'A1 landscape',width:821,height:574},{name:'A0 landscape',width:1169,height:821}]
    .find(size=>width/nominalScale*1000<=size.width&&height/nominalScale*1000<=size.height)
  if(!paper)throw new RangeError('The retained reference and legend do not fit one sheet. Prepare separate sheets; no annotations were truncated.')
  const panelX=mapFrame.maxX+gap
  const contentBottom=Math.min(mapFrame.minY,mapFrame.maxY-legendHeight)
  const extents={minX:mapFrame.minX,maxX:panelX+panelWidth,minY:contentBottom-gap-footerHeight,maxY:mapFrame.maxY}
  drawing.extents=extents
  const text=(value:string,e:number,n:number,height=h,name='ANNOTATIONS',rotation=0)=>entities.push({kind:'text',layer:name,e,n,height,text:value,...(rotation?{rotation}:{})})
  const line=(name:string,a:[number,number],b:[number,number])=>entities.push({kind:'line',layer:name,x1:a[0],y1:a[1],x2:b[0],y2:b[1]})
  const frame=(box:Box)=>entities.push({kind:'polyline',layer:'BORDER',closed:true,pts:[[box.minX,box.minY],[box.maxX,box.minY],[box.maxX,box.maxY],[box.minX,box.maxY]]})
  frame(extents);frame(mapFrame)
  const markers=new SpatialIndex<Box>(h*12),labels=new SpatialIndex<Box>(h*12),segments=new SpatialIndex<Segment>(h*12)
  for(const point of source.snapshot.observations){const r=h*0.35;markers.add({minX:point.x-r,maxX:point.x+r,minY:point.y-r,maxY:point.y+r})}
  for(const entity of entities){
    const vertices=entity.kind==='polyline'||entity.kind==='polyline3d'?entity.pts:null
    if(!vertices||['BORDER','LEGEND'].includes(entity.layer))continue
    const edgeCount=entity.kind==='polyline'&&entity.closed?vertices.length:vertices.length-1
    for(let index=0;index<edgeCount;index++){const next=(index+1)%vertices.length;const a:[number,number]=[vertices[index][0],vertices[index][1]],b:[number,number]=[vertices[next][0],vertices[next][1]];segments.add({...lineBox(a,b),a,b})}
  }
  // Coordinate references occupy reserved edge strips, outside the observations.
  const gridBase=span/10,gridStep=Math.max(gridBase,Math.ceil(12*h/gridBase)*gridBase),gridHeight=h*0.85
  for(let x=Math.ceil(mapFrame.minX/gridStep)*gridStep;x<=mapFrame.maxX;x+=gridStep){
    const value='E'+Number(x.toFixed(3)),width=Array.from(value).length*gridHeight
    const e=x-width/2,n=mapFrame.maxY-1.5*gridHeight
    if(e<mapFrame.minX+h||e+width>mapFrame.maxX-h)continue
    labels.add({minX:e,maxX:e+width,minY:n,maxY:n+gridHeight});text(value,e,n,gridHeight,'ANNOTATIONS')
  }
  for(let y=Math.ceil(mapFrame.minY/gridStep)*gridStep;y<=mapFrame.maxY;y+=gridStep){
    const value='N'+Number(y.toFixed(3)),width=Array.from(value).length*gridHeight
    const e=mapFrame.minX+1.5*gridHeight,n=y-width/2
    if(n<mapFrame.minY+h||n+width>mapFrame.maxY-h)continue
    labels.add({minX:e-gridHeight,maxX:e,minY:n,maxY:n+width});text(value,e,n,gridHeight,'ANNOTATIONS',90)
  }
  const placed=(lines:string[],anchor:[number,number],name:string,height=h)=>{
    const width=Math.max(...lines.map(value=>Array.from(value).length))*height+height*0.4,blockHeight=(lines.length*1.4)*height
    for(const radius of [1,2,4,8]){
      const distance=radius*height
      const east=anchor[0]+distance,west=anchor[0]-distance-width,centre=anchor[0]-width/2
      const above=anchor[1]+distance,below=anchor[1]-distance-blockHeight,middle=anchor[1]-blockHeight/2
      for(const [e,n]of [[east,above],[west,above],[east,below],[west,below],[east,middle],[west,middle],[centre,above],[centre,below]]){
        const box={minX:e,maxX:e+width,minY:n,maxY:n+blockHeight}
        if(box.minX<mapFrame.minX+h||box.maxX>mapFrame.maxX-h||box.minY<mapFrame.minY+h||box.maxY>mapFrame.maxY-h)continue
        if([...markers.query(box),...labels.query(box)].some(other=>intersects(box,other))||[...segments.query(box)].some(segment=>crosses(segment,box)))continue
        const end:[number,number]=[Math.max(box.minX,Math.min(box.maxX,anchor[0])),Math.max(box.minY,Math.min(box.maxY,anchor[1]))]
        const leader={...lineBox(anchor,end),a:anchor,b:end}
        if([...labels.query(leader)].some(other=>crosses(leader,other)))continue
        labels.add(box);line('PLAN_LEADERS',anchor,end)
        lines.forEach((value,index)=>text(value,e,n+blockHeight-height-index*height*1.4,height,name))
        return true
      }
    }
    return false
  }
  let omittedPointLabels=0,omittedContourLabels=0
  for(const point of source.snapshot.observations){
    const value=[...wrap(point.pointName??point.id,18),point.z.toFixed(3)]
    if(!placed(value,[point.x,point.y],'POINT_LABELS'))omittedPointLabels++
  }
  for(const contour of source.contours)for(const path of contour.coordinates){if(!path.length)continue;const anchor=path[Math.floor(path.length/2)];if(!placed([contour.elevation.toFixed(3)],[anchor[0],anchor[1]],'ANNOTATIONS',h*0.95))omittedContourLabels++}
  // Every metadata row occupies its own line below the map, including full hashes.
  let footerY=contentBottom-gap-2*h
  text('TOPOGRAPHIC SURVEY | COMPUTED DRAFT',extents.minX+2*h,footerY,1.3*h,'TITLE_BLOCK');footerY-=2*h
  metadata[reportIndex]=`Point labels: ${points.length-omittedPointLabels}/${points.length} | Omitted contour labels: ${omittedContourLabels} | All coordinates retained.`
  for(const value of metadata.flatMap(value=>wrap(value,columns))){text(value,extents.minX+2*h,footerY,h,'TITLE_BLOCK');footerY-=1.6*h}
  const px=panelX+2*h,arrowX=panelX+panelWidth/2,top=extents.maxY-2*h
  text('GRID NORTH',px,top-h,h,'NORTH_ARROW')
  const arrowTop=top-4*h
  line('NORTH_ARROW',[arrowX,arrowTop-7*h],[arrowX,arrowTop]);line('NORTH_ARROW',[arrowX,arrowTop],[arrowX-h,arrowTop-2*h]);line('NORTH_ARROW',[arrowX,arrowTop],[arrowX+h,arrowTop-2*h])
  text('N',arrowX-h*0.4,arrowTop+h,h,'NORTH_ARROW')
  let legendY=top-15*h
  text('LEGEND',px,legendY,h*1.2,'LEGEND');legendY-=2.5*h
  for(const row of legendRows){
    if(row.line)line(row.name,[px,legendY+h*0.4],[px+3*h,legendY+h*0.4]);else{line(row.name,[px,legendY],[px+2*h,legendY]);line(row.name,[px+h,legendY-h],[px+h,legendY+h])}
    const lines=wrap(row.text,25)
    for(const [index,value]of lines.entries())text(value,px+4*h,legendY-index*1.5*h,h,'LEGEND')
    legendY-=(lines.length*1.5+1)*h
  }
  const available=panelWidth-8*h,magnitude=10**Math.floor(Math.log10(available))
  const barWidth=[1,2,5,10].map(value=>value*magnitude).filter(value=>value<=available&&value>=12*h).at(-1)??available,scaleY=legendY-3*h
  // The graphic bar uses real model-space metres; screen zoom does not change its meaning.
  line('SCALE_BAR',[px,scaleY],[px+barWidth,scaleY]);for(const offset of[0,barWidth/2,barWidth])line('SCALE_BAR',[px+offset,scaleY-h*.4],[px+offset,scaleY+h*.4])
  text('0',px,scaleY-1.8*h,h,'SCALE_BAR');text(`${Number((barWidth/2).toPrecision(4))}`,px+barWidth/2-h,scaleY-1.8*h,h,'SCALE_BAR');text(`${Number(barWidth.toPrecision(4))} m`,px+barWidth-4*h,scaleY-1.8*h,h,'SCALE_BAR')
  text(`Nominal scale 1:${nominalScale}`,px,scaleY-4*h,h,'SCALE_BAR')
  text(`METARDU | ${paper.name}`,px,scaleY-6*h,h,'TITLE_BLOCK')
  const layout={mapFrame,nominalScale,annotationHeight:h,paper:paper.name,omittedPointLabels,omittedContourLabels,placedPointLabels:points.length-omittedPointLabels}
  return {...drawing,layout}
}
