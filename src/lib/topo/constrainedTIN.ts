import triangulate from 'cdt2d'
import orientation from 'robust-orientation'
import { buildTIN, type SurfacePoint, type TIN } from '@/lib/survey/surfaceTIN'
import type { Breakline } from './breaklineTIN'

export interface ConstrainedTIN extends TIN { constraintEdges: Array<[number, number]> }
const MAX_POINTS = 10000
const MAX_SEGMENTS = 2000
const sameHeight = (a: number, b: number) => Math.abs(a - b) <= 1e-8
const orient = (a: SurfacePoint, b: SurfacePoint, c: SurfacePoint) => orientation[3]([a.x, a.y], [b.x, b.y], [c.x, c.y])
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`
const parameter = (a: SurfacePoint, b: SurfacePoint, p: SurfacePoint) => Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  ? (p.x - a.x) / (b.x - a.x) : (p.y - a.y) / (b.y - a.y)
const onSegment = (a: SurfacePoint, b: SurfacePoint, p: SurfacePoint) => orient(a, b, p) === 0
  && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
const opposite = (a: number, b: number) => a > 0 && b < 0 || a < 0 && b > 0

/** Complete constrained triangulation, with explicit heights at every vertex. */
export function buildConstrainedTIN(samples: SurfacePoint[], breaklines: Breakline[]): ConstrainedTIN {
  if (!Array.isArray(samples) || samples.length < 3 || samples.length > MAX_POINTS) throw new RangeError('A TIN requires 3–10,000 finite survey points.')
  if (!Array.isArray(breaklines)) throw new RangeError('Breaklines must be an array.')
  const points: SurfacePoint[] = [], lookup = new Map<string, number>()
  function add(point: SurfacePoint): number {
    if (!point || ![point.x, point.y, point.z].every(value => typeof value === 'number' && Number.isFinite(value))) throw new RangeError('Every surface and breakline vertex requires finite easting, northing and height.')
    if (Math.abs(point.x) > 1e10 || Math.abs(point.y) > 1e10 || Math.abs(point.z) > 1e8) throw new RangeError('A vertex exceeds the supported engineering coordinate range.')
    const key = `${point.x}:${point.y}`, existing = lookup.get(key)
    if (existing !== undefined) {
      if (!sameHeight(points[existing].z, point.z)) throw new RangeError('Conflicting heights at the same coordinate require survey review.')
      return existing
    }
    if (points.length >= MAX_POINTS) throw new RangeError('The combined surface exceeds 10,000 vertices; split the surveyed area.')
    const id = points.length
    points.push({ x: point.x, y: point.y, z: point.z }); lookup.set(key, id)
    return id
  }
  samples.forEach(add)
  const rawEdges: Array<[number, number]> = []
  for (const line of breaklines) {
    if (!line || !['hard', 'soft', 'ridge', 'valley'].includes(line.type) || !Array.isArray(line.points) || line.points.length < 2) throw new RangeError('A breakline requires a recognized type and at least two complete vertices.')
    const indices = line.points.map(add)
    for (let i = 1; i < indices.length; i++) {
      if (indices[i - 1] === indices[i]) throw new RangeError('A breakline contains a zero-length segment.')
      rawEdges.push([indices[i - 1], indices[i]])
      if (rawEdges.length > MAX_SEGMENTS) throw new RangeError('The surface exceeds 2,000 breakline segments; split the surveyed area.')
    }
  }
  // Every measured vertex on an edge is retained as an explicit height control.
  const segments: Array<[number, number]> = [], seen = new Set<string>()
  for (const [start, end] of rawEdges) {
    const a = points[start], b = points[end]
    const chain = points.map((p, id) => ({ p, id })).filter(({ p }) => onSegment(a, b, p))
      .sort((left, right) => parameter(a, b, left.p) - parameter(a, b, right.p))
    for (let i = 1; i < chain.length; i++) {
      const x = chain[i - 1].id, y = chain[i].id, key = edgeKey(x, y)
      if (!seen.has(key)) { seen.add(key); segments.push([x, y]) }
    }
  }
  if (segments.length > MAX_SEGMENTS) throw new RangeError('Split breaklines exceed 2,000 segments; split the surveyed area.')
  const splits = segments.map(([a, b]) => [{ t: 0, id: a }, { t: 1, id: b }])
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const [ai, bi] = segments[i], [ci, di] = segments[j]
    if ([ai, bi].some(id => id === ci || id === di)) continue
    const a = points[ai], b = points[bi], c = points[ci], d = points[di]
    if (!opposite(orient(a, b, c), orient(a, b, d)) || !opposite(orient(c, d, a), orient(c, d, b))) continue
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y
    const denominator = rx * sy - ry * sx
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator
    const z = a.z + t * (b.z - a.z), otherZ = c.z + u * (d.z - c.z)
    if (![t, u, z, otherZ].every(Number.isFinite) || !(t > 0 && t < 1 && u > 0 && u < 1)) throw new RangeError('A breakline intersection is numerically ambiguous; review the geometry.')
    if (!sameHeight(z, otherZ)) throw new RangeError('Crossing breaklines have conflicting intersection heights; review the geometry.')
    const id = add({ x: a.x + t * rx, y: a.y + t * ry, z })
    splits[i].push({ t, id }); splits[j].push({ t: u, id })
  }
  const constraints: Array<[number, number]> = [], constraintKeys = new Set<string>()
  for (const entries of splits) {
    entries.sort((a, b) => a.t - b.t)
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1].id, b = entries[i].id, key = edgeKey(a, b)
      if (a !== b && !constraintKeys.has(key)) { constraintKeys.add(key); constraints.push([a, b]) }
    }
  }
  if (constraints.length > MAX_SEGMENTS) throw new RangeError('Intersecting breaklines exceed 2,000 split segments; split the surveyed area.')
  // cdt2d requires a planar graph. Reject ambiguous residual junctions.
  for (let i = 0; i < constraints.length; i++) {
    const [ai, bi] = constraints[i], a = points[ai], b = points[bi]
    for (let id = 0; id < points.length; id++) if (id !== ai && id !== bi && onSegment(a, b, points[id])) throw new RangeError('An unresolved breakline junction requires survey review.')
    for (let j = i + 1; j < constraints.length; j++) {
      const [ci, di] = constraints[j]
      if ([ai, bi].some(id => id === ci || id === di)) continue
      const c = points[ci], d = points[di]
      if (opposite(orient(a, b, c), orient(a, b, d)) && opposite(orient(c, d, a), orient(c, d, b))) throw new RangeError('A residual breakline crossing requires survey review.')
    }
  }
  const base = buildTIN(points)
  if (!base.triangles.length) throw new RangeError('Surface observations must contain at least three non-collinear coordinates.')
  if (constraints.length === 0) {
    if (new Set(base.triangles.flatMap(t => [t.a, t.b, t.c])).size !== points.length) throw new RangeError('Numerically indistinguishable surface coordinates require survey review.')
    return { ...base, constraintEdges: [] }
  }
  const coordinates = points.map(p => [p.x - base.minX, p.y - base.minY])
  const cells = triangulate(coordinates, constraints, { delaunay: true, interior: true, exterior: true, infinity: false })
  const triangles = cells.map(cell => {
    if (cell.length !== 3 || cell.some(index => !Number.isInteger(index) || index < 0 || index >= points.length)
      || orient(points[cell[0]], points[cell[1]], points[cell[2]]) === 0) throw new Error('Constrained triangulation produced an invalid triangle.')
    return { a: cell[0], b: cell[1], c: cell[2] }
  })
  const actualEdges = new Set(triangles.flatMap(t => [edgeKey(t.a, t.b), edgeKey(t.b, t.c), edgeKey(t.c, t.a)]))
  if (new Set(triangles.flatMap(t => [t.a, t.b, t.c])).size !== points.length) throw new RangeError('Constrained triangulation omitted a surface vertex; review numerically indistinguishable coordinates.')
  if (constraints.some(([a, b]) => !actualEdges.has(edgeKey(a, b)))) throw new Error('Constrained triangulation did not preserve every supplied breakline edge.')
  function area(faces: typeof triangles) {
    return faces.reduce((sum, t) => {
      const a = points[t.a], b = points[t.b], c = points[t.c]
      return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
    }, 0)
  }
  const expectedArea = area(base.triangles), computedArea = area(triangles)
  if (!Number.isFinite(computedArea) || computedArea <= 0 || Math.abs(computedArea - expectedArea) > Math.max(Number.EPSILON, expectedArea * 1e-9)) throw new Error('Constrained surface coverage differs from the observation hull; review the geometry.')
  return { ...base, points, triangles, constraintEdges: constraints }
}
