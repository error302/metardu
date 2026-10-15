import { defined } from '@/test-utils/defined'
import { calculateRoadHorizontal, buildRoadSchedules } from '../roadProjectOutputs'
import { buildRoadHorizontalGeometry, roadHorizontalStation, buildRoadCentrelineSetout } from '../roadCoordinateSetout'
import type { IntersectionPoint, RoadDesignData } from '@/types/engineering'

const crs = 'EPSG:32737', radius = 300, length = 60, delta = 70 * Math.PI / 180, bearing = 23 * Math.PI / 180
const total = length + radius * delta, circularEnd = total - length
// Independent integration of curvature, with no production spiral helpers.
function integrate(distance: number) {
  let x = 0, y = 0
  const breaks = [...new Set([0, length, circularEnd, total].filter(s => s <= distance).concat(distance))].sort((a, b) => a - b)
  for (let j = 1; j < breaks.length; j++) {
    const a = breaks[j - 1], b = breaks[j], n = 2048, h = (b - a) / n
    for (let i = 0; i <= n; i++) {
      const s = a + i * h, heading = s <= length ? s * s / (2 * radius * length)
        : s <= circularEnd ? length / (2 * radius) + (s - length) / radius : delta - (total - s) ** 2 / (2 * radius * length)
      const weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2
      x += h * weight * Math.cos(heading) / 3; y += h * weight * Math.sin(heading) / 3
    }
  }
  return { x, y }
}
const tangent = integrate(total).y / Math.sin(delta)
function fixture(turn = 1): IntersectionPoint[] {
  const pi = { easting: 500000, northing: 9900000 }
  return [
    { id: 'a', name: 'A', easting: pi.easting - 1000 * Math.sin(bearing), northing: pi.northing - 1000 * Math.cos(bearing), radius: 0 },
    { id: 'pi', name: 'PI', ...pi, radius, hasTransition: true, transitionLengthIn: length, transitionLengthOut: length },
    { id: 'b', name: 'B', easting: pi.easting + 1000 * Math.sin(bearing + turn * delta), northing: pi.northing + 1000 * Math.cos(bearing + turn * delta), radius: 0 },
  ]
}
function road(ips: IntersectionPoint[], chainages: number[]): RoadDesignData {
  return { roadName: 'Synthetic transition route', startChainage: 1000, datum: 'Declared', coordinateSystem: crs, roadClass: 'C', designSpeed: 40,
    ips, vips: [], stations: chainages.map(chainage => ({ chainage, groundLevel: 0, designLevel: 0 })),
    crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 0, camber: 0, cutSlope: '2:1', fillSlope: '2:1', subgradeDepth: 0.5 } }
}
it.each([1, -1])('connects project transition chainages, coordinates, tangent bearings and draft exports: turn %s', turn => {
  const ips = fixture(turn), ts = 2000 - tangent, st = ts + total
  const computed = calculateRoadHorizontal(ips, 1000, crs)
  expect(computed.issues).toEqual([])
  const curve = computed.curves[0]
  expect(curve).toMatchObject({ kind: 'spiral-circular-spiral', transitionLength: length })
  expect(curve.tangentLength).toBeCloseTo(tangent, 7)
  expect(curve.arcLength).toBeCloseTo(radius * delta - length, 7)
  expect(curve.chainageTC).toBeCloseTo(ts + length, 7)
  expect(curve.chainageCT).toBeCloseTo(st - length, 7)
  expect(computed.length).toBeCloseTo(2000 - 2 * tangent + total, 7)
  const result = buildRoadHorizontalGeometry(ips, 1000, crs)
  expect(result.issues).toEqual([])
  const alignment = defined(result.alignment)
  const distances = [0, 15, length, (length + circularEnd) / 2, circularEnd, total - 15, total]
  for (const distance of distances) {
    const reference = integrate(distance), point = defined(roadHorizontalStation(alignment, ts + distance))
    const from = { easting: ips[1].easting - tangent * Math.sin(bearing), northing: ips[1].northing - tangent * Math.cos(bearing) }
    expect(point.easting).toBeCloseTo(from.easting + reference.x * Math.sin(bearing) + turn * reference.y * Math.cos(bearing), 7)
    expect(point.northing).toBeCloseTo(from.northing + reference.x * Math.cos(bearing) - turn * reference.y * Math.sin(bearing), 7)
  }
  expect(defined(roadHorizontalStation(alignment, ts + 15)).segment).toBe('entry-spiral')
  expect(defined(roadHorizontalStation(alignment, st - 15)).segment).toBe('exit-spiral')
  expect(defined(roadHorizontalStation(alignment, ts + 15)).bearing).toBeCloseTo((23 + turn * 15 ** 2 / (2 * radius * length) * 180 / Math.PI + 360) % 360, 7)
  const end = defined(roadHorizontalStation(alignment, alignment.end))
  expect(end.easting).toBeCloseTo(ips[2].easting, 7); expect(end.northing).toBeCloseTo(ips[2].northing, 7)
  const data = road(ips, [ts + 15, st - 15])
  const targets = buildRoadCentrelineSetout(data, crs, 'Synthetic BM')
  expect(targets.issues).toEqual([])
  expect(targets.rows.map(row => row.horizontalSegment)).toEqual(['entry-spiral', 'exit-spiral'])
  const schedules = buildRoadSchedules(data, crs, 'Synthetic BM')
  expect(schedules.horizontal.headers).toEqual(expect.arrayContaining(['Curve_type', 'Spiral_in_m', 'Spiral_out_m', 'Chainage_TS_m', 'Chainage_SC_m', 'Chainage_CS_m', 'Chainage_ST_m', 'Declared_CRS', 'Issue_status']))
  expect(schedules.horizontal.rows[0][schedules.horizontal.headers.indexOf('Chainage_TS_m')]).toBeCloseTo(ts, 7)
  expect(schedules.centrelineSetout.rows[0][1]).toBe(targets.rows[0].easting)
})

it('corrects the chainage of later curves without losing the connecting tangent', () => {
  const ips: IntersectionPoint[] = [
    { id: 'a', name: 'A', easting: 0, northing: 0, radius: 0 },
    { id: 'b', name: 'B', easting: 0, northing: 1000, radius: 100, hasTransition: true, transitionLengthIn: 20, transitionLengthOut: 20 },
    { id: 'c', name: 'C', easting: 1000, northing: 1000, radius: 50 },
    { id: 'd', name: 'D', easting: 1000, northing: 2000, radius: 0 },
  ]
  const computed = calculateRoadHorizontal(ips, 0, crs)
  expect(computed.issues).toEqual([])
  const first = computed.curves[0], second = computed.curves[1]
  const correction = 2 * first.tangentLength - (20 + 100 * Math.PI / 2)
  expect(second.chainageTC).toBeCloseTo(2000 - correction - 50, 8)
  const route = defined(buildRoadHorizontalGeometry(ips, 0, crs).alignment)
  const junction = defined(roadHorizontalStation(route, second.chainageTC)), end = defined(roadHorizontalStation(route, route.end))
  expect(junction.easting).toBeCloseTo(950, 8); expect(junction.northing).toBeCloseTo(1000, 8)
  expect(end.easting).toBeCloseTo(1000, 8); expect(end.northing).toBeCloseTo(2000, 8)
})

it.each([
  { hasTransition: true, transitionLengthIn: undefined, transitionLengthOut: undefined },
  { transitionLengthOut: undefined }, { transitionLengthIn: NaN }, { transitionLengthIn: -1 },
  { transitionLengthOut: 70 }, { hasTransition: false }, { transitionLengthIn: 400, transitionLengthOut: 400 },
])('rejects unsupported or incomplete transition evidence atomically: %j', change => {
  const ips = fixture(); ips[1] = { ...ips[1], ...change }
  expect(calculateRoadHorizontal(ips, 1000, crs).curves).toEqual([])
  expect(buildRoadHorizontalGeometry(ips, 1000, crs).alignment).toBeNull()
})

it('does not silently discard transition inputs on endpoints or collinear PIs', () => {
  const ips = fixture(); ips[0] = { ...ips[0], hasTransition: true, transitionLengthIn: 10, transitionLengthOut: 10 }
  expect(calculateRoadHorizontal(ips, 1000, crs).issues.join(' ')).toMatch(/endpoint|middle/i)
  expect(calculateRoadHorizontal(fixture().map((p, i) => ({ ...p, easting: 0, northing: i * 1000 })), 0, crs).issues.join(' ')).toMatch(/straight|collinear|deflection/i)
})

it('allows an explicitly zero transition to use the finite circular limit and blocks tangent overlap', () => {
  const ips = fixture(); ips[1] = { ...ips[1], transitionLengthIn: 0, transitionLengthOut: 0 }
  const result = calculateRoadHorizontal(ips, 1000, crs)
  expect(result.issues).toEqual([])
  expect(result.curves[0].arcLength).toBeCloseTo(radius * delta, 8)
  const short = fixture(); short[0] = { ...short[0], easting: short[1].easting - 100 * Math.sin(bearing), northing: short[1].northing - 100 * Math.cos(bearing) }
  expect(calculateRoadHorizontal(short, 1000, crs).issues.join(' ')).toMatch(/overlap|extend/i)
})
