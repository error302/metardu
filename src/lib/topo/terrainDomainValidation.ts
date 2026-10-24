import orientation from 'robust-orientation'
import type { TerrainXY, TerrainDomain, TerrainRegion } from './terrainDomainTypes'
export const terrainXYKey = (point: TerrainXY) => `${point.x}:${point.y}`
export const terrainOrientation = (a: TerrainXY, b: TerrainXY, c: TerrainXY) => orientation[3]([a.x,a.y],[b.x,b.y],[c.x,c.y])
const onSegment = (a: TerrainXY, b: TerrainXY, point: TerrainXY) => terrainOrientation(a,b,point) === 0 && point.x >= Math.min(a.x,b.x) && point.x <= Math.max(a.x,b.x) && point.y >= Math.min(a.y,b.y) && point.y <= Math.max(a.y,b.y)
const opposite = (a: number, b: number) => a < 0 && b > 0 || a > 0 && b < 0
function segmentsMeet(a: TerrainXY, b: TerrainXY, c: TerrainXY, d: TerrainXY) {
  return onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b)
    || opposite(terrainOrientation(a,b,c),terrainOrientation(a,b,d)) && opposite(terrainOrientation(c,d,a),terrainOrientation(c,d,b))
}
export function terrainRingArea(ring: TerrainXY[]): number {
  const origin=ring[0]
  let sum=0,correction=0
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length]
    const value=(a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y)-correction
    const next=sum+value;correction=(next-sum)-value;sum=next
  }
  return sum/2
}
/** -1 outside, 0 on the boundary, 1 inside. No distance/survey tolerance. */
export function locateInTerrainRing(point: TerrainXY, ring: TerrainXY[]): -1 | 0 | 1 {
  let inside=false
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length]
    if(onSegment(a,b,point))return 0
    if((a.y>point.y)!==(b.y>point.y)) {
      // robust-orientation has the opposite sign to the usual 2D cross product.
      const side=terrainOrientation(a,b,point)
      if(b.y>a.y?side<0:side>0)inside=!inside
    }
  }
  return inside?1:-1
}
function ringsMeet(a: TerrainXY[],b: TerrainXY[]) {
  return a.some((point,i)=>b.some((other,j)=>segmentsMeet(point,a[(i+1)%a.length],other,b[(j+1)%b.length])))
}
function normalizeRing(value: TerrainXY[]): TerrainXY[] {
  if(!Array.isArray(value)||value.length<3||value.length>2001)throw new RangeError('Each terrain boundary needs 3–2,000 finite vertices.')
  if(value.some(point=>!point||![point.x,point.y].every(Number.isFinite)||Math.abs(point.x)>1e10||Math.abs(point.y)>1e10))throw new RangeError('Terrain boundary coordinates must be finite engineering coordinates.')
  const ring=value.map(point=>({x:point.x,y:point.y}))
  if(terrainXYKey(ring[0])===terrainXYKey(ring[ring.length-1]))ring.pop()
  if(ring.length<3||new Set(ring.map(terrainXYKey)).size!==ring.length)throw new RangeError('A terrain ring has repeated vertices or a zero-length segment.')
  for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++) {
    if(j===i+1||i===0&&j===ring.length-1)continue
    if(segmentsMeet(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]))throw new RangeError('A terrain boundary crosses or touches itself. Review the original definition.')
  }
  const area=terrainRingArea(ring)
  if(!Number.isFinite(area)||area===0)throw new RangeError('A terrain boundary has no finite enclosed area.')
  return ring
}
export function normalizeTerrainDomain(value: TerrainDomain): TerrainDomain {
  if(!value||!Array.isArray(value.regions)||!value.regions.length||value.regions.length>32)throw new RangeError('Declare 1–32 separate terrain regions.')
  // Admit total work before quadratic ring/segment comparisons, including
  // invalid inputs. A repeated closing vertex does not consume another vertex.
  let boundaryCount=0
  for(const region of value.regions) {
    if(!region||!Array.isArray(region.holes)||region.holes.length>64)throw new RangeError('Declare at most 64 exclusion rings per terrain region.')
    for(const ring of [region.outer,...region.holes]) {
      if(!Array.isArray(ring))throw new RangeError('Each terrain boundary needs 3–2,000 finite vertices.')
      const closed=ring.length>1&&ring[0]&&ring[ring.length-1]&&terrainXYKey(ring[0])===terrainXYKey(ring[ring.length-1])
      boundaryCount+=ring.length-(closed?1:0)
      if(boundaryCount>2000)throw new RangeError('Terrain definitions exceed 2,000 boundary vertices; split the area.')
    }
  }
  const regions=value.regions.map(region=>{
    if(!region||!Array.isArray(region.holes)||region.holes.length>64)throw new RangeError('Declare at most 64 exclusion rings per terrain region.')
    const outer=normalizeRing(region.outer),holes=region.holes.map(normalizeRing)
    for(const hole of holes)if(ringsMeet(outer,hole)||hole.some(point=>locateInTerrainRing(point,outer)!==1))throw new RangeError('Each exclusion must lie strictly inside its outer boundary without touching it.')
    for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)if(ringsMeet(holes[i],holes[j])||locateInTerrainRing(holes[i][0],holes[j])!==-1||locateInTerrainRing(holes[j][0],holes[i])!==-1)throw new RangeError('Exclusions must be disjoint and cannot nest or touch.')
    return {outer,holes}
  })
  const inRegion=(point: TerrainXY,region: TerrainRegion)=>locateInTerrainRing(point,region.outer)===1&&region.holes.every(hole=>locateInTerrainRing(point,hole)===-1)
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++) {
    const a=regions[i],b=regions[j]
    if([a.outer,...a.holes].some(left=>[b.outer,...b.holes].some(right=>ringsMeet(left,right)))||inRegion(a.outer[0],b)||inRegion(b.outer[0],a))throw new RangeError('Separate terrain regions must not overlap or touch.')
  }
  return {regions}
}
