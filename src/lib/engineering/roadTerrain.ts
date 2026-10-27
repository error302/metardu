import {z} from 'zod'
import type {RoadDesignData} from '@/types/engineering'
import type {QuantityReference} from './roadQuantity'
import {buildRoadHorizontalGeometry,roadHorizontalStation} from './roadCoordinateSetout'
import {roadGroundAlignmentKey} from './roadGroundAssociation'
const hash=z.string().regex(/^[a-f0-9]{64}$/),finite=z.number().finite()
export const roadTerrainIdentitySchema=z.object({projectId:z.string().uuid(),surfaceId:z.string().uuid(),revisionId:z.string().uuid(),revision:z.number().int().positive(),name:z.string().min(1),inputHash:hash,meshHash:hash,referenceHash:hash,crs:z.string().min(1),verticalDatum:z.string().min(1),fieldVerified:z.literal(false)}).strict()
export const roadTerrainBindingSchema=roadTerrainIdentitySchema.extend({intervalM:finite.min(0.1).max(10000),halfWidthM:finite.positive().max(500)}).strict()
export const terrainMeshSchema=z.object({points:z.array(z.object({x:finite,y:finite,z:finite})).min(3).max(60000),triangles:z.array(z.object({a:z.number().int().nonnegative(),b:z.number().int().nonnegative(),c:z.number().int().nonnegative()})).min(1).max(20000)}).strict()
export const roadTerrainDataSchema=z.object({identity:roadTerrainIdentitySchema,mesh:terrainMeshSchema}).strict()
export const roadTerrainScopeSchema=z.object({actorId:z.string().uuid(),projectId:z.string().uuid(),engineeringHash:hash,referenceHash:hash}).strict()
export type RoadTerrainScope=z.infer<typeof roadTerrainScopeSchema>
export const roadTerrainRevisionSchema=z.object({revisionId:z.string().uuid(),surfaceId:z.string().uuid(),name:z.string(),revision:z.number().int().positive(),crs:z.string(),pointCount:z.number().int().positive(),triangleCount:z.number().int().positive()}).strict()
export const roadTerrainListSchema=z.object({scope:roadTerrainScopeSchema,revisions:z.array(roadTerrainRevisionSchema).max(200),limited:z.boolean()}).strict()
export const roadTerrainReplySchema=z.object({scope:roadTerrainScopeSchema,terrain:roadTerrainDataSchema}).strict()
export type TerrainMesh=z.infer<typeof terrainMeshSchema>
export type RoadTerrainIdentity=z.infer<typeof roadTerrainIdentitySchema>
export type RoadTerrainBinding=z.infer<typeof roadTerrainBindingSchema>
export type RoadTerrainData=z.infer<typeof roadTerrainDataSchema>
type Position={easting:number;northing:number;bearing:number}
type Segment={lo:number;hi:number;level:(t:number)=>number;edge:string|null}
function fail(s:string):never{throw Error(s)}
/** Exact intersections with retained triangle planes; no nearest-face/convex-hull extrapolation. */
export function sectionFromRetainedTerrain(mesh:TerrainMesh,position:Position,halfWidthM:number){
  if(![position.easting,position.northing,position.bearing,halfWidthM].every(Number.isFinite)||halfWidthM<=0||halfWidthM>500)fail('Supply a finite terrain review position and half-width in (0, 500] metres.')
  if(mesh.triangles.length>20000||mesh.points.length>60000)fail('Split this terrain into a bounded work package.')
  const angle=position.bearing*Math.PI/180,dx=Math.cos(angle),dy=-Math.sin(angle),epsilon=1e-7
  const ends=[{x:position.easting-halfWidthM*dx,y:position.northing-halfWidthM*dy},{x:position.easting+halfWidthM*dx,y:position.northing+halfWidthM*dy}]
  const segments:Segment[]=[]
  for(const face of mesh.triangles){
    const ids=[face.a,face.b,face.c],points=ids.map(i=>mesh.points[i])
    if(points.some(p=>!p)||new Set(ids).size!==3)fail('The retained terrain has invalid triangle indices.')
    const [a,b,c]=points
    if(Math.max(a.x,b.x,c.x)<Math.min(ends[0].x,ends[1].x)-epsilon||Math.min(a.x,b.x,c.x)>Math.max(ends[0].x,ends[1].x)+epsilon||Math.max(a.y,b.y,c.y)<Math.min(ends[0].y,ends[1].y)-epsilon||Math.min(a.y,b.y,c.y)>Math.max(ends[0].y,ends[1].y)+epsilon)continue
    const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx
    if(!Number.isFinite(det)||det===0)fail('The retained terrain has a degenerate triangle.')
    const sign=Math.sign(det)
    let lo=-halfWidthM,hi=halfWidthM,edge:string|null=null,empty=false
    for(let i=0;i<3;i++){
      const p=points[i],q=points[(i+1)%3],ex=q.x-p.x,ey=q.y-p.y
      const aa=sign*(ex*(position.northing-p.y)-ey*(position.easting-p.x)),bb=sign*(ex*dy-ey*dx),tol=epsilon*Math.hypot(ex,ey)
      if(Math.abs(bb)<1e-12*Math.hypot(ex,ey)){
        if(aa < -tol){empty=true;break}
        if(Math.abs(aa)<=tol)edge=[ids[i],ids[(i+1)%3]].sort((x,y)=>x-y).join(':')
      }else if(bb>0)lo=Math.max(lo,-aa/bb)
      else hi=Math.min(hi,-aa/bb)
    }
    if(empty||hi-lo<=epsilon)continue
    const level=(t:number)=>{
      const x=position.easting-a.x+t*dx,y=position.northing-a.y+t*dy
      const z=a.z+(x*cy-y*cx)/det*(b.z-a.z)+(bx*y-by*x)/det*(c.z-a.z)
      if(!Number.isFinite(z))fail('The terrain intersection did not produce a finite height.')
      return z
    }
    segments.push({lo,hi,level,edge})
  }
  const values=[-halfWidthM,0,halfWidthM,...segments.flatMap(s=>[s.lo,s.hi])].sort((a,b)=>a-b)
  const breaks=values.filter((v,i)=>i===0||v-values[i-1]>epsilon)
  if(breaks.length>2000)fail('This terrain section exceeds 2,000 breakpoints; use a bounded work package.')
  const choose=(offset:number)=>segments.filter(s=>s.lo<=offset+epsilon&&s.hi>=offset-epsilon)
  for(let i=1;i<breaks.length;i++){
    const middle=(breaks[i-1]+breaks[i])/2,cover=choose(middle)
    if(!cover.length)fail('The retained terrain does not cover the full section. A gap or exclusion remains unknown.')
    if(cover.length>1&&(!cover[0].edge||cover.some(s=>s.edge!==cover[0].edge)))fail('Overlapping terrain faces make this section ambiguous.')
  }
  return breaks.map(offset=>{
    const cover=choose(offset)
    if(!cover.length)fail('The retained terrain does not cover the full section.')
    const level=cover[0].level(offset)
    if(cover.some(s=>Math.abs(s.level(offset)-level)>1e-6))fail('The terrain has inconsistent heights at a shared edge.')
    return{offset:Math.abs(offset)<epsilon?0:offset,level}
  })
}
/** A separate computed review road. Original station observations are never changed or adopted. */
export function terrainPreviewRoad(road:RoadDesignData,reference:QuantityReference,mesh:TerrainMesh,recipe:{intervalM:number;halfWidthM:number}):RoadDesignData{
  if(!reference.code||reference.code!==road.coordinateSystem||!reference.verticalDatum||reference.distanceMode!=='grid')fail('Terrain review requires matching declared grid and height references.')
  const parsed=z.object({intervalM:finite.min(0.1).max(10000),halfWidthM:finite.positive().max(500)}).parse(recipe)
  const geometry=buildRoadHorizontalGeometry(road.ips,road.startChainage,reference.code)
  if(!geometry.alignment)fail(geometry.issues.join(' '))
  const alignment=geometry.alignment
  const count=Math.ceil((alignment.end-alignment.start)/parsed.intervalM)
  if(count+1>500)fail('Terrain review supports at most 500 sections. Increase the interval or split the work package.')
  const chainages=Array.from({length:count},(_,i)=>alignment.start+i*parsed.intervalM).concat(alignment.end)
  let total=0
  const stations=chainages.map(chainage=>{
    const position=roadHorizontalStation(alignment,chainage)
    if(!position)fail('Terrain section lies outside the evaluated alignment.')
    const groundProfile=sectionFromRetainedTerrain(mesh,position,parsed.halfWidthM)
    total+=groundProfile.length
    if(total>250000)fail('Terrain review exceeds 250,000 profile points. Split the work package.')
    const centre=groundProfile.find(p=>p.offset===0)
    if(!centre)fail('The terrain centreline height remains unknown.')
    return{chainage,groundLevel:centre.level,groundProfile,designLevelSource:'vertical-alignment' as const}
  })
  return{...road,stations,groundSectionAlignmentKey:roadGroundAlignmentKey(road)}
}
