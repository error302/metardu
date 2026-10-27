import type { RoadDesignData } from '@/types/engineering'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { assertSurveyCrs } from '@/lib/spatial/projectCrs'
import { terrainOrientation } from '@/lib/topo/terrainDomainValidation'
import { buildRoadHorizontalGeometry, roadHorizontalSegmentStation } from './roadCoordinateSetout'
import { roadSegmentCurvatureBound, roadStripEnclosure } from './roadStripGeometry'
import type { QuantityReference } from './roadQuantity'

export const ROAD_CORRIDOR_OVERLAP_VERSION = '1.0.0'
export interface RoadCorridorOverlap {
  status: 'clear' | 'unassessed'
  reason: string
  algorithm: 'road-normal-strip-separation'
  algorithmVersion: string
  fieldVerified: false
  start: number | null
  end: number | null
  halfWidthM: number
  checkedPairs: number
  refinements: number
  numericalGuardM: number
  sourceKey: string
}
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0))
function abort(signal?: AbortSignal) {
  if (signal?.aborted) { const error = Error('Corridor overlap review cancelled.'); error.name = 'AbortError'; throw error }
}
function separate(a: ReturnType<typeof roadStripEnclosure>, b: ReturnType<typeof roadStripEnclosure>) {
  // Strict separation only: touching enclosures remain unresolved.
  if (a.bounds.maxX<b.bounds.minX||b.bounds.maxX<a.bounds.minX||a.bounds.maxY<b.bounds.minY||b.bounds.maxY<a.bounds.minY)return true
  for (const [one, other] of [[a.rectangle,b.rectangle],[b.rectangle,a.rectangle]]) {
    if (one.some((p,i,list)=>other.every(q=>terrainOrientation(p,list[(i+1)%4],q)>0))) return true
  }
  return false
}

/**
 * Conservative normal-strip overlap assessment of the canonical analytic route.
 * Each segment is a straight or monotone-turn arc of less than pi radians.
 * For a monotone-turn span Phi<pi and |curvature|<=K, its chord projection on
 * the bisecting tangent is >=2 sin(Phi/2)/K, whereas two width-w normals can
 * contribute at most 2w sin(Phi/2). Thus wK<1 excludes a collision there.
 * For arbitrary curvature signs, nearby stations are separated when
 * ds<=acos((1+wK)/2)/K, using the midpoint-tangent projection bound.
 * Remaining station-interval pairs require strict separation of outward swept
 * enclosures, subdividing contacts. Sampling never establishes a clear result.
 * Numerical join guards admit the builder's analytic C1 construction; this is
 * not interval-arithmetic certification, terrain coverage or quantity approval.
 */
export async function assessRoadCorridorOverlap(road: RoadDesignData, reference: QuantityReference, halfWidthM: number, signal?: AbortSignal): Promise<RoadCorridorOverlap> {
  const result: RoadCorridorOverlap={status:'unassessed',reason:'',algorithm:'road-normal-strip-separation',algorithmVersion:ROAD_CORRIDOR_OVERLAP_VERSION,fieldVerified:false,start:null,end:null,halfWidthM,checkedPairs:0,refinements:0,numericalGuardM:0,sourceKey:''}
  try {
    abort(signal)
    if (!Number.isFinite(halfWidthM)||halfWidthM<=0||halfWidthM>500) throw Error('Supply a finite review half-width in (0, 500] metres.')
    if (!reference.code||reference.code!==road.coordinateSystem||assertSurveyCrs(reference.code).units!=='metres'||reference.distanceMode!=='grid'||!reference.verticalDatum?.trim()) throw Error('Corridor review requires matching declared projected metre, grid and height references.')
    if (!Array.isArray(road.ips)||road.ips.length>1000) throw Error('Open a bounded route with at most 1,000 alignment points.')
    const ips=road.ips.map(p=>({...p}))
    if (ips.some(p=>Math.abs(p.easting)>1e10||Math.abs(p.northing)>1e10)) throw Error('The route exceeds the supported engineering coordinate range.')
    const built=buildRoadHorizontalGeometry(ips,road.startChainage,reference.code)
    if (!built.alignment) throw Error(built.issues.join(' '))
    const alignment=built.alignment,segments=alignment.segments
    result.start=alignment.start;result.end=alignment.end
    result.sourceKey=canonicalJson({algorithm:result.algorithm,algorithmVersion:result.algorithmVersion,ips,startChainage:road.startChainage,reference:{...reference},halfWidthM})
    const ks=segments.map(roadSegmentCurvatureBound),k=Math.max(...ks),kw=k*halfWidthM
    if (!Number.isFinite(kw)||1-kw<=64*Number.EPSILON*Math.max(1,kw)) throw Error('The review strip folds or is numerically singular at the minimum curve radius. Narrow it or review the design; no separation verdict was inferred.')
    const localSpan=k?Math.min(alignment.end-alignment.start,Math.acos((1+kw)/2)/k):alignment.end-alignment.start
    if (!(localSpan>0)) throw Error('Local corridor separation is below reliable chainage resolution.')
    const positive=[0],negative=[0],angles=[0]
    for (const [i,segment] of segments.entries()) {
      const angle=segment.kind==='tangent'?0:segment.kind==='circular'?(segment.end-segment.start)/segment.radius:segment.spiral.deltaRad
      const sign=segment.kind==='tangent'?0:segment.kind==='circular'?segment.turn:Math.sign(segment.spiral.input.intersectionAngleDeg)
      if (!Number.isFinite(angle)||angle<0||angle>=Math.PI-128*Number.EPSILON*Math.max(1,angle)) throw Error('A segment exceeds the supported simple monotone-turn geometry.')
      positive.push(positive[i]+(sign>0?1:0));negative.push(negative[i]+(sign<0?1:0));angles.push(angles[i]+angle)
      if (i) {
        const previous=segments[i-1],a=roadHorizontalSegmentStation(previous,previous.end),b=roadHorizontalSegmentStation(segment,segment.start)
        if (!a||!b||previous.end!==segment.start) throw Error('The corridor contains an unresolved chainage join.')
        const guard=Math.max(1e-7,128*Number.EPSILON*Math.max(1,Math.abs(a.easting),Math.abs(a.northing),Math.abs(b.easting),Math.abs(b.northing)))
        result.numericalGuardM=Math.max(result.numericalGuardM,guard)
        const heading=Math.abs((((b.bearing-a.bearing+540)%360)-180)*Math.PI/180)
        if (Math.hypot(a.easting-b.easting,a.northing-b.northing)>guard||heading>1e-10) throw Error('The corridor lacks a consistent analytic tangent/curve join within its numerical guards.')
      }
    }
    const angleGuard=128*Number.EPSILON*Math.max(1,angles[angles.length-1])
    const monotone=(i:number,j:number)=>!(positive[j+1]-positive[i]&&negative[j+1]-negative[i])&&angles[j+1]-angles[i]+angleGuard<Math.PI
    type Interval={index:number;start:number;end:number}
    const cache=new Map<string,ReturnType<typeof roadStripEnclosure>>()
    const enclosure=(a:Interval)=>{
      const key=`${a.index}:${a.start}:${a.end}`,prior=cache.get(key)
      if (prior)return prior
      if (cache.size>=20000) throw Error('Corridor review exceeds 20,000 enclosures. Split the work package; separation remains unassessed.')
      const next=roadStripEnclosure(segments[a.index],a.start,a.end,halfWidthM)
      result.numericalGuardM=Math.max(result.numericalGuardM,next.numericalGuardM);cache.set(key,next);return next
    }
    await pause();abort(signal)
    const roots=segments.map((s,index)=>({index,start:s.start,end:s.end}))
    for (let i=0;i<roots.length;i++) for (let j=i+1;j<roots.length;j++) {
      const pending=[{a:roots[i],b:roots[j],depth:0}]
      while (pending.length) {
        if (++result.checkedPairs>2000000) throw Error('Corridor review exceeds the bounded pair budget. Split the work package; separation remains unassessed.')
        if (result.checkedPairs%256===0){await pause();abort(signal)}
        const pair=pending.pop()
        if (!pair)break
        const {a,b,depth}=pair
        if (monotone(a.index,b.index)||b.end-a.start<=localSpan)continue
        if (separate(enclosure(a),enclosure(b)))continue
        if (depth>=24) throw Error(`Possible strip overlap or unresolved enclosure separation between chainages ${a.start}–${a.end} and ${b.start}–${b.end}. Review this corridor; volume totals remain unassessed.`)
        const first=a.end-a.start>=b.end-b.start,chosen=first?a:b,middle=chosen.start+(chosen.end-chosen.start)/2
        if (middle<=chosen.start||middle>=chosen.end) throw Error('Corridor separation is below reliable chainage resolution; boundary contact was not discarded.')
        const left={...chosen,end:middle},right={...chosen,start:middle}
        if (first) pending.push({a:left,b,depth:depth+1},{a:right,b,depth:depth+1})
        else pending.push({a,b:left,depth:depth+1},{a,b:right,depth:depth+1})
        result.refinements++
      }
    }
    abort(signal)
    result.status='clear'
    result.reason=`Review strip does not overlap itself in the evaluated model (±${halfWidthM} m). Whole-road volumes remain unassessed.`
  } catch(error) {
    abort(signal)
    result.reason=error instanceof Error?error.message:'Corridor separation could not be assessed.'
  }
  return result
}
