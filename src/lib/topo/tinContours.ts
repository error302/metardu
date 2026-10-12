import type { TIN } from '@/lib/survey/surfaceTIN'
import type { ContourLine } from './contourGenerator'

export interface TINContourOptions {
  interval: number
  /** Every nth level is an index contour. */
  indexInterval?: number
  /** Densifies straight TIN segments without changing their geometry. */
  maxVertexSpacing?: number
}

const MAX_LEVELS = 500
const MAX_TRIANGLE_LEVEL_PAIRS = 2000000
const MAX_OUTPUT_VERTICES = 200000
type XY = [number, number]

/** Piecewise-linear isolines on the actual TIN, clipped to its observation hull.
 * Shared mesh edges use identical keys; no raster boundary is traced as a contour.
 * Flat triangles have no unique isoline and are deliberately omitted.
 */
export function generateTINContours(tin: TIN, options: TINContourOptions): ContourLine[] {
  const { interval, indexInterval = 5, maxVertexSpacing } = options
  if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Contour interval must be finite and positive.')
  if (!Number.isInteger(indexInterval) || indexInterval < 1) throw new RangeError('Index contour interval must be a positive integer.')
  if (maxVertexSpacing !== undefined && (!Number.isFinite(maxVertexSpacing) || maxVertexSpacing <= 0)) throw new RangeError('Contour vertex spacing must be finite and positive.')
  if (!tin.points.length || tin.points.length > 10000 || !tin.triangles.length || tin.triangles.length > 20000 || tin.points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) throw new RangeError('Contours require a finite non-collinear TIN within the vertex/triangle limit.')
  const elevations = tin.points.map(p => p.z)
  const minZ = Math.min(...elevations), maxZ = Math.max(...elevations)
  if (minZ === maxZ) return []
  const first = Math.ceil(minZ / interval), last = Math.floor(maxZ / interval)
  const count = Math.max(0, last - first + 1)
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || count > MAX_LEVELS || count * tin.triangles.length > MAX_TRIANGLE_LEVEL_PAIRS) throw new RangeError('Contour computation exceeds the level/work limit; increase the interval or split the surface.')
  const output: ContourLine[] = []
  let outputVertices = 0
  for (let index = first; index <= last; index++) {
    const elevation = Number((index * interval).toPrecision(15))
    const nodes = new Map<string, XY>(), edges: Array<[string, string]> = [], seen = new Set<string>()
    function node(key: string): XY {
      const point = nodes.get(key)
      if (!point) throw new Error('Contour connectivity references a missing node.')
      return point
    }
    function vertex(id: number): string {
      const key = `v:${id}`, p = tin.points[id]
      nodes.set(key, [p.x, p.y]); return key
    }
    function crossing(left: number, right: number): string {
      const a = Math.min(left, right), b = Math.max(left, right), key = `e:${a}:${b}`
      if (!nodes.has(key)) {
        const p = tin.points[a], q = tin.points[b], t = (elevation - p.z) / (q.z - p.z)
        nodes.set(key, [p.x + t * (q.x - p.x), p.y + t * (q.y - p.y)])
      }
      return key
    }
    for (const triangle of tin.triangles) {
      const ids = [triangle.a, triangle.b, triangle.c]
      if (ids.some(id => !Number.isInteger(id) || !tin.points[id])) throw new RangeError('TIN contains an invalid triangle index.')
      if (ids.every(id => tin.points[id].z === elevation)) continue
      const hits = new Set<string>()
      for (let i = 0; i < 3; i++) {
        const a = ids[i], b = ids[(i + 1) % 3], az = tin.points[a].z, bz = tin.points[b].z
        if (az === elevation) hits.add(vertex(a))
        if (bz === elevation) hits.add(vertex(b))
        if (az < elevation && bz > elevation || bz < elevation && az > elevation) hits.add(crossing(a, b))
      }
      if (hits.size !== 2) continue
      const [a, b] = [...hits], p = node(a), q = node(b)
      if (p[0] === q[0] && p[1] === q[1]) continue
      const key = [a, b].sort().join('|')
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]) }
    }
    const adjacency = new Map<string, number[]>()
    edges.forEach(([a, b], id) => {
      adjacency.set(a, [...(adjacency.get(a) ?? []), id])
      adjacency.set(b, [...(adjacency.get(b) ?? []), id])
    })
    const used = new Set<number>(), paths: XY[][] = []
    function walk(start: string, firstEdge: number) {
      const path: XY[] = [node(start)]
      let current = start, edge = firstEdge
      while (!used.has(edge)) {
        used.add(edge)
        const [a, b] = edges[edge], next = current === a ? b : a
        path.push(node(next))
        const linked = adjacency.get(next)
        if (!linked) throw new Error('Contour connectivity references a missing edge.')
        if (next === start || linked.length !== 2) break
        const onward = linked.find(id => !used.has(id))
        if (onward === undefined) break
        current = next; edge = onward
      }
      const dense: XY[] = [path[0]]
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1], q = path[i]
        const steps = maxVertexSpacing === undefined ? 1 : Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / maxVertexSpacing))
        if (!Number.isSafeInteger(steps) || outputVertices + dense.length + steps > MAX_OUTPUT_VERTICES) throw new RangeError('Contour output exceeds the vertex limit; increase vertex spacing or split the surface.')
        for (let step = 1; step < steps; step++) dense.push([p[0] + step / steps * (q[0] - p[0]), p[1] + step / steps * (q[1] - p[1])])
        dense.push(q)
      }
      outputVertices += dense.length; paths.push(dense)
    }
    // Endpoints and saddle branches stop explicitly; cycles are handled afterward.
    for (const [node, linked] of adjacency) if (linked.length !== 2) for (const edge of linked) if (!used.has(edge)) walk(node, edge)
    edges.forEach(([a], id) => { if (!used.has(id)) walk(a, id) })
    if (paths.length) output.push({ elevation, isIndex: index % indexInterval === 0, coordinates: paths })
  }
  return output
}
