import type { RoadDesignData } from '@/types/engineering'
import { assertSurveyCrs } from '@/lib/spatial/projectCrs'
import { terrainOrientation } from '@/lib/topo/terrainDomainValidation'
import { buildRoadHorizontalGeometry, roadHorizontalStation, type ProjectHorizontalGeometry } from './roadCoordinateSetout'
import { terrainMeshSchema, type TerrainMesh } from './roadTerrain'
import type { QuantityReference } from './roadQuantity'

export const ROAD_TERRAIN_COVERAGE_VERSION = '1.0.0'
export interface RoadTerrainCoverage {
  status: 'covered' | 'unassessed'
  reason: string
  algorithm: 'retained-tin-strip-enclosures'
  algorithmVersion: string
  fieldVerified: false
  start: number | null
  end: number | null
  halfWidthM: number
  checkedEnclosures: number
}
type XY = { x: number; y: number }
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type Face = Bounds & { id: number; points: XY[] }
type Edge = Bounds & { a: XY; b: XY }
type Tree<T extends Bounds> = Bounds & ({ items: T[] } | { children: Tree<T>[] })
const cross = (a: XY, b: XY, c: XY) => -terrainOrientation(a, b, c)
const bounds = (points: XY[]): Bounds => ({ minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) })
const meets = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
const inside = (point: XY, face: Face) => face.points.every((a, i, list) => cross(a, list[(i + 1) % 3], point) >= 0)
function tree<T extends Bounds>(items: T[]): Tree<T> {
  const box = items.reduce((b, item) => ({ minX: Math.min(b.minX, item.minX), minY: Math.min(b.minY, item.minY), maxX: Math.max(b.maxX, item.maxX), maxY: Math.max(b.maxY, item.maxY) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  if (items.length <= 8) return { ...box, items }
  const x = box.maxX - box.minX >= box.maxY - box.minY
  items.sort((a, b) => x ? a.minX + a.maxX - b.minX - b.maxX : a.minY + a.maxY - b.minY - b.maxY)
  const middle = Math.floor(items.length / 2)
  return { ...box, children: [tree(items.slice(0, middle)), tree(items.slice(middle))] }
}
function candidates<T extends Bounds>(root: Tree<T>, box: Bounds, spend: () => void): T[] {
  const pending = [root], found: T[] = []
  while (pending.length) {
    const node = pending.pop()
    if (!node) break
    spend()
    if (!meets(node, box)) continue
    if ('items' in node) for (const item of node.items) { spend(); if (meets(item, box)) found.push(item) }
    else pending.push(...node.children)
  }
  return found
}
/** Strict positive-area intersection; touching shared edges are not overlaps. */
function overlaps(a: Face, b: Face) {
  for (const [one, other] of [[a, b], [b, a]]) {
    if (one.points.some((p, i, list) => other.points.every(q => cross(p, list[(i + 1) % 3], q) <= 0))) return false
  }
  return true
}
function segmentMeetsRectangle(edge: Edge, rectangle: XY[]) {
  // Convex separating axes: rectangle edges and the segment's supporting line.
  for (let i = 0; i < 4; i++) {
    if (cross(rectangle[i], rectangle[(i + 1) % 4], edge.a) < 0 && cross(rectangle[i], rectangle[(i + 1) % 4], edge.b) < 0) return false
  }
  const sides = rectangle.map(p => cross(edge.a, edge.b, p))
  return !(sides.every(s => s < 0) || sides.every(s => s > 0))
}
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0))
function abort(signal?: AbortSignal) {
  if (signal?.aborted) { const error = new Error('Terrain coverage check cancelled.'); error.name = 'AbortError'; throw error }
}

/**
 * Proves coverage of the entire ±halfWidth strip, independently of review stations.
 * A non-overlapping triangle complex plus no boundary in a connected enclosure
 * and one contained point implies the whole enclosure is contained in the mesh.
 *
 * For an arc-length interval h with |curvature| <= K, relative to its midpoint
 * tangent, |P(s)-P(0)-sT(0)| <= K h²/8 and |N(s)-N(0)| <= K h/2.
 * Thus the swept width lies in the tangent rectangle expanded in both axes by
 * K h²/8 + halfWidth K h/2. This also encloses the clothoid transitions (K<=1/R).
 * A numerical outward guard is added; boundary contact is never rounded away.
 * Failure to prove coverage is unassessed, never an inferred gap-free surface.
 * This is neither a quantity integration nor a field/professional acceptance.
 */
export async function assessRoadTerrainCoverage(
  road: RoadDesignData, reference: QuantityReference, mesh: TerrainMesh, halfWidthM: number, signal?: AbortSignal,
): Promise<RoadTerrainCoverage> {
  const result: RoadTerrainCoverage = { status: 'unassessed', reason: '', algorithm: 'retained-tin-strip-enclosures', algorithmVersion: ROAD_TERRAIN_COVERAGE_VERSION, fieldVerified: false, start: null, end: null, halfWidthM, checkedEnclosures: 0 }
  let work = 0
  const spend = () => { if (++work > 2_000_000) throw Error('Continuous terrain coverage exceeds the bounded geometry budget. Split the work package; no coverage verdict was inferred.') }
  try {
    abort(signal)
    if (!Number.isFinite(halfWidthM) || halfWidthM <= 0 || halfWidthM > 500) throw Error('Supply a finite terrain half-width in (0, 500] metres.')
    if (!reference.code || reference.code !== road.coordinateSystem || assertSurveyCrs(reference.code).units !== 'metres' || !reference.verticalDatum?.trim() || reference.distanceMode !== 'grid') throw Error('Continuous terrain review requires matching declared projected metre, grid and height references.')
    terrainMeshSchema.parse(mesh)
    if (mesh.points.some(p => Math.abs(p.x) > 1e10 || Math.abs(p.y) > 1e10 || Math.abs(p.z) > 1e8)) throw Error('The retained mesh exceeds the supported finite engineering coordinate range.')
    if (new Set(mesh.points.map(p => `${p.x}:${p.y}`)).size !== mesh.points.length) throw Error('Repeated terrain XY vertices require topology review.')
    const horizontal = buildRoadHorizontalGeometry(road.ips, road.startChainage, reference.code)
    if (!horizontal.alignment) throw Error(horizontal.issues.join(' '))
    const alignment = horizontal.alignment
    result.start = alignment.start; result.end = alignment.end
    const faces: Face[] = [], edges = new Map<string, { ids: number[]; count: number; direction: number }>()
    for (const [id, face] of mesh.triangles.entries()) {
      const ids = [face.a, face.b, face.c]
      if (new Set(ids).size !== 3 || ids.some(i => !mesh.points[i])) throw Error('The retained terrain has invalid triangle indices.')
      const points = ids.map(i => mesh.points[i]), sign = cross(points[0], points[1], points[2])
      if (!Number.isFinite(sign) || sign === 0) throw Error('The retained terrain has a degenerate triangle.')
      if (sign < 0) { ids.reverse(); points.reverse() }
      faces.push({ id, points, ...bounds(points) })
      for (let i = 0; i < 3; i++) {
        const a = ids[i], b = ids[(i + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`, direction = a < b ? 1 : -1, previous = edges.get(key)
        if (previous && (previous.count >= 2 || previous.direction === direction)) throw Error('Overlapping or non-manifold terrain faces require review.')
        edges.set(key, { ids: [a, b], count: (previous?.count ?? 0) + 1, direction })
      }
    }
    const faceTree = tree(faces.slice())
    // Check disconnected/nested overlaps too; edge incidence alone is insufficient.
    for (const face of faces) {
      if (face.id % 32 === 0) { await pause(); abort(signal) }
      for (const other of candidates(faceTree, face, spend)) {
        if (other.id > face.id) { spend(); if (overlaps(face, other)) throw Error('Overlapping retained faces make continuous terrain coverage ambiguous.') }
      }
    }
    const boundary = [...edges.values()].filter(edge => edge.count === 1).map(({ ids }) => ({ a: mesh.points[ids[0]], b: mesh.points[ids[1]], ...bounds(ids.map(i => mesh.points[i])) }))
    if (!boundary.length) throw Error('No consistent terrain boundary is available for coverage review.')
    const edgeTree = tree(boundary)
    type Segment = ProjectHorizontalGeometry['segments'][number]
    const pending: Array<{ segment: Segment; start: number; end: number; depth: number }> = alignment.segments.map(segment => ({ segment, start: segment.start, end: segment.end, depth: 0 }))
    while (pending.length) {
      if (result.checkedEnclosures++ >= 20_000) throw Error('Continuous terrain coverage exceeds 20,000 enclosures. Split the work package; coverage remains unassessed.')
      if (result.checkedEnclosures % 32 === 1) { await pause(); abort(signal) }
      const interval = pending.pop()
      if (!interval) break
      const { segment, start, end, depth } = interval, middle = start + (end - start) / 2, h = end - start
      if (!Number.isFinite(h) || h <= 0 || middle <= start || middle >= end) throw Error('The terrain interval is below reliable chainage resolution. Coverage remains unassessed.')
      const position = roadHorizontalStation(alignment, middle)
      if (!position) throw Error('The continuous terrain enclosure lies outside the evaluated alignment.')
      const point = { x: position.easting, y: position.northing }
      if (!candidates(faceTree, bounds([point]), spend).some(face => inside(point, face))) throw Error(`Terrain gap or exclusion at chainage ${middle}; continuous coverage remains unassessed.`)
      const k = segment.kind === 'tangent' ? 0 : 1 / (segment.kind === 'circular' ? segment.radius : segment.spiral.input.radius)
      const guard = Math.max(1e-7, 128 * Number.EPSILON * Math.max(1, Math.abs(point.x), Math.abs(point.y), h, k ? 1 / k : 0))
      const expansion = k * h * h / 8 + halfWidthM * k * h / 2 + guard
      const along = h / 2 + expansion, across = halfWidthM + expansion, angle = position.bearing * Math.PI / 180
      const t = { x: Math.sin(angle), y: Math.cos(angle) }, n = { x: -Math.cos(angle), y: Math.sin(angle) }
      const rectangle = [[-along, -across], [along, -across], [along, across], [-along, across]].map(([u, v]) => ({ x: point.x + u * t.x + v * n.x, y: point.y + u * t.y + v * n.y }))
      if (rectangle.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('A terrain enclosure exceeds the finite coordinate range.')
      const contact = candidates(edgeTree, bounds(rectangle), spend).some(edge => segmentMeetsRectangle(edge, rectangle))
      if (!contact) continue
      if (segment.kind === 'tangent' || depth >= 20 || middle <= start || middle >= end) throw Error(`Terrain boundary, gap or exclusion intersects the conservative strip enclosure at chainage ${start}–${end}. Coverage remains unassessed; boundary contact is not rounded away.`)
      pending.push({ segment, start, end: middle, depth: depth + 1 }, { segment, start: middle, end, depth: depth + 1 })
    }
    abort(signal)
    result.status = 'covered'
    result.reason = `Full review strip covered by retained faces: chainage ${result.start}–${result.end}, ±${halfWidthM} m. Volume integration remains unassessed.`
  } catch (error) {
    abort(signal)
    result.reason = error instanceof Error ? error.message : 'Continuous terrain coverage could not be verified.'
    if (result.reason.startsWith('[')) result.reason = 'The retained mesh lacks complete finite geometry for continuous coverage review.'
  }
  return result
}
