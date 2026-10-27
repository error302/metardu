/** @jest-environment node */
import { assessRoadTerrainCoverage } from '../roadTerrainCoverage'
import { sectionFromRetainedTerrain, type TerrainMesh } from '../roadTerrain'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import { buildRoadHorizontalGeometry, roadHorizontalStation } from '../roadCoordinateSetout'
import type { RoadDesignData } from '@/types/engineering'

const { road: example, reference } = roadWorkbenchExample()
const otherFixtureCrs = 'EPSG:32637'
function straight(): RoadDesignData {
  return { ...example, ips: [{ ...example.ips[0], easting: 0, northing: 0 },
    { ...example.ips[2], easting: 0, northing: 100 }], startChainage: 0 }
}
function grid(xs: number[], ys: number[], omit: (x: number, y: number) => boolean = () => false): TerrainMesh {
  const points = ys.flatMap(y => xs.map(x => ({ x, y, z: 0 })))
  const triangles: TerrainMesh['triangles'] = []
  for (let y = 0; y < ys.length - 1; y++) for (let x = 0; x < xs.length - 1; x++) {
    if (omit(x, y)) continue
    const a = y * xs.length + x, b = a + 1, c = b + xs.length, d = a + xs.length
    triangles.push({ a, b, c }, { a, b: c, c: d })
  }
  return { points, triangles }
}
const plane = () => grid([-50, 50], [-20, 120])

it('proves the complete straight strip across internal triangle edges without using sampled stations', async () => {
  const road = straight(), mesh = plane(), before = JSON.stringify({ road, mesh })
  const result = await assessRoadTerrainCoverage(road, reference, mesh, 10)
  expect(result.status).toBe('covered')
  expect(result).toMatchObject({ start: 0, end: 100, halfWidthM: 10, fieldVerified: false })
  expect(result.checkedEnclosures).toBeGreaterThan(0)
  expect(JSON.stringify({ road, mesh })).toBe(before)
})
it('finds an off-centre exclusion between successful transects even when the centreline is covered', async () => {
  const mesh = grid([-50, 3, 3.01, 50], [-20, 49, 49.01, 120], (x, y) => x === 1 && y === 1)
  for (const northing of [0, 100]) {
    const profile = sectionFromRetainedTerrain(mesh, { easting: 0, northing, bearing: 0 }, 10)
    expect(profile[0].offset).toBe(-10)
    expect(profile.at(-1)?.offset).toBe(10)
  }
  const result = await assessRoadTerrainCoverage(straight(), reference, mesh, 10)
  expect(result.status).toBe('unassessed')
  expect(result.reason).toMatch(/boundary|gap|exclusion/i)
})
it('refuses a very narrow exclusion without an area or station-spacing tolerance', async () => {
  const mesh = grid([-50, 4, 4.00000001, 50], [-20, 75, 75.00000001, 120], (x, y) => x === 1 && y === 1)
  expect((await assessRoadTerrainCoverage(straight(), reference, mesh, 10)).status).toBe('unassessed')
})
it('accepts curved and transition strips with conservative enclosures', async () => {
  const mesh = grid([499900, 500400], [9499900, 9500400])
  for (const hasTransition of [false, true]) {
    const road = { ...example, ips: example.ips.map((p, i) => i === 1 ? { ...p, hasTransition, transitionLengthIn: hasTransition ? 10 : undefined, transitionLengthOut: hasTransition ? 10 : undefined } : p) }
    expect(await assessRoadTerrainCoverage(road, reference, mesh, 20)).toMatchObject({ status: 'covered' })
  }
})
it('subdivides a conservative curved enclosure until a close but complete terrain boundary is cleared', async () => {
  const mesh = grid([499970, 500150], [9499970, 9500150])
  const result = await assessRoadTerrainCoverage(example, reference, mesh, 20)
  expect(result).toMatchObject({ status: 'covered' })
  expect(result.checkedEnclosures).toBeGreaterThan(3)
})
it('refuses a curved strip that leaves the retained terrain', async () => {
  const mesh = grid([499999, 500121], [9499979, 9500121])
  const result = await assessRoadTerrainCoverage(example, reference, mesh, 20)
  expect(result.status).toBe('unassessed')
})
it.each([false, true])('finds a small off-centre exclusion along a curved route (transition=%s)', async hasTransition => {
  const road = { ...example, ips: example.ips.map((p, i) => i === 1 ? { ...p, hasTransition, transitionLengthIn: hasTransition ? 10 : undefined, transitionLengthOut: hasTransition ? 10 : undefined } : p) }
  const geometry = buildRoadHorizontalGeometry(road.ips, 0, reference.code).alignment
  if (!geometry) throw Error('The synthetic curved fixture must have valid horizontal geometry.')
  const curve = geometry.segments.find(s => s.kind !== 'tangent')
  if (!curve) throw Error('The synthetic curved fixture must contain a curve.')
  const p = roadHorizontalStation(geometry, curve.start + (curve.end - curve.start) / 3)
  if (!p) throw Error('The synthetic curve position must be within the alignment.')
  const angle = p.bearing * Math.PI / 180, x = p.easting + 5 * Math.cos(angle), y = p.northing - 5 * Math.sin(angle)
  const mesh = grid([499900, x, x + 0.01, 500400], [9499900, y, y + 0.01, 9500400], (i, j) => i === 1 && j === 1)
  expect((await assessRoadTerrainCoverage(road, reference, mesh, 20)).status).toBe('unassessed')
})
it('refuses overlapping disconnected faces even when sampled transects could miss them', async () => {
  const mesh = plane(), n = mesh.points.length
  mesh.points.push({ x: 1, y: 50, z: 0 }, { x: 2, y: 50, z: 0 }, { x: 1, y: 51, z: 0 })
  mesh.triangles.push({ a: n, b: n + 1, c: n + 2 })
  const result = await assessRoadTerrainCoverage(straight(), reference, mesh, 10)
  expect(result.status).toBe('unassessed')
  expect(result.reason).toMatch(/overlap/i)
})
it('does not claim coverage when the strip merely touches the terrain boundary', async () => {
  const result = await assessRoadTerrainCoverage(straight(), reference, grid([-10, 10], [0, 100]), 10)
  expect(result.status).toBe('unassessed')
  expect(result.reason).toMatch(/boundary|enclosure/i)
})
it.each([0, -1, 501, NaN, Infinity])('refuses unsupported review half-width %s', async width => {
  expect((await assessRoadTerrainCoverage(straight(), reference, plane(), width)).status).toBe('unassessed')
})
it.each(['reference', 'indices', 'height', 'degenerate', 'duplicate', 'size'])('refuses invalid %s inputs', async kind => {
  const mesh = plane(), ref = { ...reference }
  if (kind === 'reference') ref.code = otherFixtureCrs
  if (kind === 'indices') mesh.triangles[0].a = 10
  if (kind === 'height') mesh.points[0].z = NaN
  if (kind === 'degenerate') mesh.points[1] = { ...mesh.points[0] }
  if (kind === 'duplicate') mesh.triangles.push({ ...mesh.triangles[0] })
  if (kind === 'size') mesh.triangles = Array.from({ length: 20001 }, () => mesh.triangles[0])
  expect((await assessRoadTerrainCoverage(straight(), ref, mesh, 10)).status).toBe('unassessed')
})
it('does not turn an aborted calculation into a coverage verdict', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(assessRoadTerrainCoverage(straight(), reference, plane(), 10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
})
it('yields and honors cancellation during a larger mesh check', async () => {
  const controller = new AbortController()
  const mesh = grid(Array.from({ length: 30 }, (_, i) => -50 + i * 4), Array.from({ length: 40 }, (_, i) => -20 + i * 4))
  const pending = assessRoadTerrainCoverage(straight(), reference, mesh, 10, controller.signal)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})
it('checks a 20,000-face retained work package within the bounded budget', async () => {
  const mesh = grid(Array.from({ length: 101 }, (_, i) => -50 + i), Array.from({ length: 101 }, (_, i) => -20 + i * 1.4))
  expect(mesh.triangles).toHaveLength(20000)
  expect(await assessRoadTerrainCoverage(straight(), reference, mesh, 10)).toMatchObject({ status: 'covered' })
}, 20000)
it.each([0, 30, 90, 180, 270])('covers a translated strip at bearing %s', async bearing => {
  const angle = bearing * Math.PI / 180, road = straight()
  road.ips = road.ips.map(p => ({ ...p, easting: 500000 + p.northing * Math.sin(angle), northing: 9500000 + p.northing * Math.cos(angle) }))
  expect((await assessRoadTerrainCoverage(road, reference, grid([499800, 500200], [9499800, 9500200]), 10)).status).toBe('covered')
})
