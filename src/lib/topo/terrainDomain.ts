import type { TIN, SurfacePoint, Triangle } from '@/lib/survey/surfaceTIN'
import { intersect, featureCollection, polygon, multiPolygon } from '@turf/turf'
import triangulate from 'cdt2d'
import type { Polygon, MultiPolygon } from 'geojson'
export interface DomainTIN extends TIN { normalizedDomain: TerrainDomain; area: number; derivedVertexCount: number; vertexOrigins: Array<{ kind: 'retained_tin_vertex'; vertex: number } | { kind: 'derived_clip_vertex'; triangle: number }> }
import { normalizeTerrainDomain, terrainXYKey as key, terrainOrientation as orient, terrainRingArea as signedArea } from './terrainDomainValidation'
import type { TerrainXY, TerrainDomain } from './terrainDomainTypes'
export type { TerrainXY, TerrainDomain, TerrainRegion } from './terrainDomainTypes'
export { normalizeTerrainDomain, locateInTerrainRing } from './terrainDomainValidation'
/** Clip every retained TIN face separately. Interpolated clip vertices remain
 * derived data; this operation never re-fits the selected observations. */
export function clipTerrainDomain(tin: TIN, value: TerrainDomain): DomainTIN {
  const domain=normalizeTerrainDomain(value)
  if(!tin.points.length||tin.points.length>10000||!tin.triangles.length||tin.triangles.length>20000||tin.points.some(point=>![point.x,point.y,point.z].every(Number.isFinite)))throw new RangeError('Terrain clipping needs a finite retained TIN within its model limits.')
  const vertexCount=domain.regions.reduce((sum,region)=>sum+region.outer.length+region.holes.reduce((n,hole)=>n+hole.length,0),0)
  if(vertexCount*tin.triangles.length>2000000)throw new RangeError('Terrain clipping exceeds the work limit; simplify the reviewed boundary or split the area.')
  for(const region of domain.regions)for(const ring of [region.outer,...region.holes])for(const point of ring) {
    const covered=tin.triangles.some(face=>{
      const [a,b,c]=[tin.points[face.a],tin.points[face.b],tin.points[face.c]]
      if(!a||!b||!c)return false
      const sides=[orient(a,b,point),orient(b,c,point),orient(c,a,point)]
      return !(sides.some(value=>value<0)&&sides.some(value=>value>0))
    })
    if(!covered)throw new RangeError('A terrain boundary vertex lies outside the retained TIN. No extrapolation or silent boundary trimming is allowed.')
  }
  const minX=Math.min(...tin.points.map(point=>point.x)),minY=Math.min(...tin.points.map(point=>point.y))
  const local=(point:TerrainXY):[number,number]=>[point.x-minX,point.y-minY]
  const closed=(ring:TerrainXY[])=>[...ring,ring[0]].map(local)
  const mask=multiPolygon(domain.regions.map(region=>[closed(region.outer),...region.holes.map(closed)]))
  const points:SurfacePoint[]=[],triangles:Triangle[]=[],vertexOrigins:DomainTIN['vertexOrigins']=[],lookup=new Map<string,number>()
  const original=new Map(tin.points.map((point,i)=>[key(point),i]))
  let area=0
  for(let triangleIndex=0;triangleIndex<tin.triangles.length;triangleIndex++) {
    const face=tin.triangles[triangleIndex],ids=[face.a,face.b,face.c]
    if(new Set(ids).size!==3||ids.some(id=>!Number.isInteger(id)||!tin.points[id]))throw new RangeError('Terrain clipping received an invalid TIN face.')
    const [a,b,c]=ids.map(id=>tin.points[id]),[al,bl,cl]=[local(a),local(b),local(c)]
    const determinant=(bl[1]-cl[1])*(al[0]-cl[0])+(cl[0]-bl[0])*(al[1]-cl[1])
    if(!Number.isFinite(determinant)||determinant===0)throw new RangeError('A retained terrain face has no finite area.')
    const clipped=intersect(featureCollection<Polygon|MultiPolygon>([mask,polygon([[al,bl,cl,al]])]))
    if(!clipped)continue
    const polygons=clipped.geometry.type==='Polygon'?[clipped.geometry.coordinates]:clipped.geometry.coordinates
    for(const fragment of polygons) {
      const vertices:number[][]=[],edges:Array<[number,number]>=[]
      const fragmentKeys=new Set<string>()
      for(const ring of fragment) {
        const open=ring.slice(0,-1),start=vertices.length
        for(const xy of open) {
          if(fragmentKeys.has(`${xy[0]}:${xy[1]}`))throw new RangeError('Clipping produced a numerically ambiguous polygon junction.')
          fragmentKeys.add(`${xy[0]}:${xy[1]}`);vertices.push([xy[0],xy[1]])
        }
        for(let i=0;i<open.length;i++)edges.push([start+i,start+(i+1)%open.length])
      }
      const cells=triangulate(vertices,edges,{delaunay:true,interior:true,exterior:false,infinity:false})
      const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`
      const actualEdges=new Set(cells.flatMap(cell=>[edgeKey(cell[0],cell[1]),edgeKey(cell[1],cell[2]),edgeKey(cell[2],cell[0])]))
      if(edges.some(([a,b])=>!actualEdges.has(edgeKey(a,b))))throw new RangeError('Clipping triangulation omitted a reviewed boundary segment.')
      const global=vertices.map(([x,y])=>{
        const point={x:x+minX,y:y+minY},k=key(point),retained=original.get(k)
        const wx=point.x-minX,wy=point.y-minY
        const l1=((bl[1]-cl[1])*(wx-cl[0])+(cl[0]-bl[0])*(wy-cl[1]))/determinant
        const l2=((cl[1]-al[1])*(wx-cl[0])+(al[0]-cl[0])*(wy-cl[1]))/determinant
        if(![l1,l2].every(Number.isFinite)||Math.min(l1,l2,1-l1-l2)<-1e-8)throw new RangeError('A clipped vertex cannot be located on its retained TIN face.')
        const z=retained===undefined?l1*a.z+l2*b.z+(1-l1-l2)*c.z:tin.points[retained].z
        const existing=lookup.get(k)
        if(existing!==undefined) {
          if(Math.abs(points[existing].z-z)>Math.max(1e-8,64*Number.EPSILON*Math.max(1,Math.abs(z))))throw new RangeError('Clipped face heights disagree at a shared model vertex.')
          return existing
        }
        if(points.length>=10000)throw new RangeError('Clipped terrain exceeds 10,000 model vertices; split the area.')
        const id=points.length;lookup.set(k,id);points.push({...point,z})
        vertexOrigins.push(retained===undefined?{kind:'derived_clip_vertex',triangle:triangleIndex}:{kind:'retained_tin_vertex',vertex:retained})
        return id
      })
      let fragmentArea=0
      for(const cell of cells) {
        if(cell.length!==3||cell.some(id=>!Number.isInteger(id)||global[id]===undefined))throw new RangeError('Clipping triangulation returned an invalid face.')
        const [ai,bi,ci]=cell.map(id=>global[id]),[p,q,r]=[points[ai],points[bi],points[ci]]
        const faceArea=Math.abs((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x))/2
        if(!Number.isFinite(faceArea)||faceArea<=0)throw new RangeError('A clipped terrain face collapsed at the supplied coordinate precision.')
        if(triangles.length>=20000)throw new RangeError('Clipped terrain exceeds 20,000 model faces; split the area.')
        fragmentArea+=faceArea;triangles.push({a:ai,b:bi,c:ci})
      }
      const expected=Math.abs(signedArea(fragment[0].slice(0,-1).map(([x,y])=>({x,y}))))-fragment.slice(1).reduce((sum,ring)=>sum+Math.abs(signedArea(ring.slice(0,-1).map(([x,y])=>({x,y})))),0)
      if(expected<=0||Math.abs(expected-fragmentArea)>Math.max(Number.EPSILON,expected*1e-8))throw new RangeError('Clipped polygon coverage does not match its triangulation.')
      area+=fragmentArea
    }
  }
  const expectedArea=domain.regions.reduce((sum,region)=>sum+Math.abs(signedArea(region.outer))-region.holes.reduce((n,hole)=>n+Math.abs(signedArea(hole)),0),0)
  if(!triangles.length||Math.abs(area-expectedArea)>Math.max(Number.EPSILON,expectedArea*1e-8))throw new RangeError('The reviewed terrain area is not completely covered by the retained TIN. No extrapolation was used.')
  return {points,triangles,minX:Math.min(...points.map(point=>point.x)),maxX:Math.max(...points.map(point=>point.x)),minY:Math.min(...points.map(point=>point.y)),maxY:Math.max(...points.map(point=>point.y)),
    normalizedDomain:domain,area,derivedVertexCount:vertexOrigins.filter(origin=>origin.kind==='derived_clip_vertex').length,vertexOrigins}
}
