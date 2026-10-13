import { reviewEncumbranceRecords, type PlanarPoint, type Encumbrance, type EncumbranceParcel, type EncumbranceResult, type EncumbranceGeometryRow } from './encumbranceRecords'
export * from './encumbranceRecords'
import { featureCollection, intersect, polygon, union } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { shoelaceArea } from '@/lib/engine/area'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { isSimplePolygonRing, segmentsIntersect, strictPointInRing } from '@/lib/spatial/simplePolygon'

type Shape = Feature<Polygon | MultiPolygon>
const same = (a: PlanarPoint, b: PlanarPoint) => a.easting === b.easting && a.northing === b.northing
function ring(points: PlanarPoint[]): PlanarPoint[] {
  const open = points.length > 1 && same(points[0], points[points.length - 1]) ? points.slice(0, -1) : points
  if (open.length > 2000 || !isSimplePolygonRing(open)) throw new RangeError('Use a finite, simple polygon with 3–2,000 distinct vertices; no self-crossings or collapsed edges.')
  const area = shoelaceArea(open)
  if (!Number.isFinite(area) || area <= 0) throw new RangeError('Polygon area must be finite and positive.')
  return open
}
function ringsTouch(a: PlanarPoint[], b: PlanarPoint[]) {
  return a.some((p, i) => b.some((q, j) => segmentsIntersect(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])))
}
function polygonShape(outer: PlanarPoint[], suppliedHoles: PlanarPoint[][] = []): Shape {
  const boundary = ring(outer), holes = suppliedHoles.map(ring)
  for (const [i, hole] of holes.entries()) {
    if (hole.some(p => !strictPointInRing(p, boundary)) || ringsTouch(hole, boundary)) throw new RangeError('A polygon hole must lie strictly inside its outer boundary.')
    for (const other of holes.slice(0, i)) {
      if (ringsTouch(hole, other) || strictPointInRing(hole[0], other) || strictPointInRing(other[0], hole)) throw new RangeError('Polygon holes must not touch or overlap.')
    }
  }
  return polygon([boundary, ...holes].map(r => [...r, r[0]].map(p => [p.easting, p.northing])))
}
function area(shape: Shape | null): number {
  if (!shape) return 0
  const polygons = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates
  const value = polygons.reduce((sum, rings) => sum + shoelaceArea(rings[0].map(p => ({ easting: p[0], northing: p[1] })))
    - rings.slice(1).reduce((holes, r) => holes + shoelaceArea(r.map(p => ({ easting: p[0], northing: p[1] }))), 0), 0)
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Clipped geometry exceeds the supported finite area range.')
  return value
}
function combine(shapes: Shape[]): Shape | null {
  if (!shapes.length) return null
  if (shapes.length === 1) return shapes[0]
  return union(featureCollection(shapes))
}
function corridorShape(points: PlanarPoint[], width: number): Shape {
  if (points.length < 2 || !Number.isFinite(width) || width <= 0) throw new RangeError('A corridor requires at least two centreline observations and a positive finite full width.')
  const pieces: Shape[] = [], normals: PlanarPoint[] = []
  const shifted = (p: PlanarPoint, n: PlanarPoint, direction: number) => ({ easting: p.easting + direction * n.easting, northing: p.northing + direction * n.northing })
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.easting - a.easting, dy = b.northing - a.northing, length = Math.hypot(dx, dy)
    if (!Number.isFinite(length) || length <= 0) throw new RangeError('Adjacent centreline observations must have distinct coordinates and finite separation.')
    const normal = { easting: -dy / length * width / 2, northing: dx / length * width / 2 }
    normals.push(normal)
    pieces.push(polygonShape([shifted(a, normal, 1), shifted(b, normal, 1), shifted(b, normal, -1), shifted(a, normal, -1)]))
    if (i > 1) for (const direction of [-1, 1]) {
      const triangle = [a, shifted(a, normals[i - 2], direction), shifted(a, normal, direction)]
      if (shoelaceArea(triangle) > 0) pieces.push(polygonShape(triangle))
    }
  }
  const shape = combine(pieces)
  if (!shape) throw new RangeError('The supplied corridor has no polygonal footprint.')
  return shape
}
/** Planar geometry screening of supplied records, never registration or registry verification. */
export function analyzeEncumbrances(records: Encumbrance[], declaredParcelArea?: number, context?: EncumbranceParcel): EncumbranceResult {
  const base = reviewEncumbranceRecords(records, declaredParcelArea)
  if (!context) return base
  if (assertProjectedCrs(context.crsCode).units !== 'metres') throw new RangeError('Parcel coverage requires a declared projected metre CRS.')
  if (context.corridorModel != null && context.corridorModel !== 'butt-bevel') throw new RangeError('The supplied corridor model is unsupported; use butt ends/bevel joins or authoritative polygons.')
  if (context.boundary.length + (context.holes ?? []).reduce((sum, h) => sum + h.length, 0) > 2000) throw new RangeError('Use at most 2,000 parcel boundary/hole vertices.')
  const origin = context.boundary[0]
  if (!origin) throw new RangeError('Supply the measured parcel boundary.')
  const local = (p: PlanarPoint) => ({ easting: p.easting - origin.easting, northing: p.northing - origin.northing })
  const parcel = polygonShape(context.boundary.map(local), context.holes?.map(h => h.map(local)))
  const parcelArea = area(parcel)
  if (parcelArea <= 0) throw new RangeError('The parcel must have positive area after subtracting its holes.')
  const restore = (geometry: Polygon | MultiPolygon | null): Polygon | MultiPolygon | null => {
    if (!geometry) return null
    const transform = (r: number[][]) => r.map(p => [p[0] + origin.easting, p[1] + origin.northing])
    return geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: geometry.coordinates.map(transform) }
      : { type: 'MultiPolygon', coordinates: geometry.coordinates.map(p => p.map(transform)) }
  }
  const clipped: Shape[] = []
  let spatialCount = 0
  const rows = records.map((r): EncumbranceGeometryRow => {
    if (!r.coordinates.length) return { id: r.id, footprintArea: null, withinParcelArea: null, withinParcelGeometry: null, issue: 'No spatial footprint supplied; area is unassessed.' }
    let footprint: Shape
    if (r.geometryType === 'polygon') footprint = polygonShape(r.coordinates.map(local), r.holes?.map(h => h.map(local)))
    else {
      if (context.corridorModel !== 'butt-bevel') throw new RangeError('Explicitly select the full-width, butt-ended, bevel-joined corridor model or supply the authoritative polygon.')
      if (r.holes?.length) throw new RangeError('Centreline corridors cannot contain supplied polygon holes.')
      footprint = corridorShape(r.coordinates.map(local), r.corridorWidth as number)
    }
    spatialCount++
    const within = intersect(featureCollection([parcel, footprint]))
    if (within) clipped.push(within)
    return { id: r.id, footprintArea: area(footprint), withinParcelArea: area(within), withinParcelGeometry: restore(within?.geometry ?? null), issue: null }
  })
  const merged = combine(clipped), assessedUnionArea = spatialCount ? area(merged) : null
  if (assessedUnionArea != null && assessedUnionArea > parcelArea + parcelArea * 1e-9) throw new RangeError('Computed coverage exceeds the parcel; geometry requires review.')
  const complete = records.length > 0 && spatialCount === records.length
  return { ...base, records: rows, parcelArea, crsCode: context.crsCode, method: 'planar-polygon-union-clipped-to-parcel',
    declaredAreaDifference: declaredParcelArea == null ? null : declaredParcelArea - parcelArea,
    totalAffectedArea: complete ? assessedUnionArea : null, affectedPercent: complete ? (assessedUnionArea as number) / parcelArea * 100 : null,
    assessedUnionArea, unionGeometry: restore(merged?.geometry ?? null), corridorModel: context.corridorModel ?? null,
    coverageStatus: complete ? 'complete-for-supplied-geometry' : spatialCount ? 'partial' : 'not-assessed',
    summary: `${spatialCount} of ${records.length} supplied record footprints assessed within the measured parcel. Overlapping footprints are counted once. ${complete ? 'Coverage applies only to supplied geometry.' : 'Unmapped records remain unassessed; no complete coverage total is claimed.'} Registry status is not verified.` }
}
