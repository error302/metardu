import { roadHorizontalSegmentStation, type ProjectHorizontalGeometry } from './roadCoordinateSetout'
export type RoadStripSegment = ProjectHorizontalGeometry['segments'][number]
export type StripPoint = { x: number; y: number }

export function roadSegmentCurvatureBound(segment: RoadStripSegment): number {
  const k = segment.kind === 'tangent' ? 0 : 1 / (segment.kind === 'circular' ? segment.radius : segment.spiral.input.radius)
  if (!Number.isFinite(k) || k < 0) throw new RangeError('The route lacks a finite non-negative curvature bound.')
  return k
}

/** Shared outward enclosure of every offset in a complete arc-length interval.
 * |P(s)-P(0)-sT(0)| <= K h²/8; |N(s)-N(0)| <= K h/2.
 * Boundary contact is retained. A bounding rectangle is not a sampled corridor.
 */
export function roadStripEnclosure(segment: RoadStripSegment, start: number, end: number, halfWidthM: number) {
  const h = end - start, middle = start + h / 2
  if (![start,end,halfWidthM,h].every(Number.isFinite)||halfWidthM<=0||halfWidthM>500||start<segment.start||end>segment.end||h<=0||middle<=start||middle>=end) throw new RangeError('The strip enclosure lacks a bounded interval, width or reliable chainage resolution.')
  const position = roadHorizontalSegmentStation(segment,middle)
  if (!position) throw new RangeError('The strip enclosure lies outside its evaluated segment.')
  const k = roadSegmentCurvatureBound(segment)
  const numericalGuardM = Math.max(1e-7,128*Number.EPSILON*Math.max(1,Math.abs(position.easting),Math.abs(position.northing),h,k?1/k:0))
  const expansion = k*h*h/8+halfWidthM*k*h/2+numericalGuardM
  const along=h/2+expansion,across=halfWidthM+expansion,angle=position.bearing*Math.PI/180
  const t={x:Math.sin(angle),y:Math.cos(angle)},n={x:-Math.cos(angle),y:Math.sin(angle)}
  const rectangle:StripPoint[]=[[-along,-across],[along,-across],[along,across],[-along,across]].map(([u,v])=>({x:position.easting+u*t.x+v*n.x,y:position.northing+u*t.y+v*n.y}))
  if (rectangle.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw new RangeError('The strip enclosure exceeds the finite coordinate range.')
  const bounds={minX:Math.min(...rectangle.map(p=>p.x)),minY:Math.min(...rectangle.map(p=>p.y)),maxX:Math.max(...rectangle.map(p=>p.x)),maxY:Math.max(...rectangle.map(p=>p.y))}
  return {position,rectangle,bounds,numericalGuardM,curvatureBoundPerM:k}
}
