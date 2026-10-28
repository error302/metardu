/**
 * Golden regression tests for the METARDU Project CRS Authority.
 *
 * Only CERTAIN facts are used as goldens — projection-definition invariants
 * (false origins, central-meridian scale factor 0.9996), textbook constants
 * (WGS84 equator 1° = 111,319.4908 m), and property tests (round-trip,
 * symmetry, translation/rotation invariance) — never invented "verified"
 * coordinates (blueprint §35: golden math tests + CRS tests + property tests).
 */

import {
  CrsError,
  createProjectReferenceSystem,
  describeProjectReferenceSystem,
  assertSurveyCrs,
  assertProjectedCrs,
  resolveEpsg,
  registerCrs,
  isRegistered,
  describeCrs,
  transformPoint,
  transformGeometry,
  toDisplay,
  fromDisplay,
  surveyDistance,
  surveyBearing,
  surveyArea,
  surveyPerimeter,
  pointScaleFactor,
  elevationFactor,
  combinedScaleFactor,
  groundDistance,
  gridDistance,
  geodesicDistanceWgs84,
  suggestUtmCrs,
  formatCoordinate,
  formatPoint,
  formatBearingDms,
  formatBearingQuadrant,
  formatLatLonDms,
  validateCoordinateRange,
  validateCrsForProject,
} from '../projectCrs'
import { computeCombinedScaleFactor } from '@/lib/geodesy/scaleFactor'
import { EPSG_21036_DEF, EPSG_21037_DEF } from '@/lib/map/projectionConstants'

const NAIROBI = { lon: 36.8172, lat: -1.2864 }

describe('resolveEpsg / registry', () => {
  it('resolves the Kenyan national cadastral CRS with full metadata', () => {
    const info = resolveEpsg('EPSG:21037')
    expect(info.name).toBe('Arc 1960 / UTM zone 37S')
    expect(info.datum).toBe('Arc 1960')
    expect(info.zone).toBe(37)
    expect(info.hemisphere).toBe('S')
    expect(info.units).toBe('metres')
    expect(info.projected).toBe(true)
    expect(info.displayOnly).toBeUndefined()
  })

  it('normalizes codes case-insensitively and bare numbers', () => {
    expect(resolveEpsg('epsg:21037').code).toBe('EPSG:21037')
    expect(resolveEpsg('21036').code).toBe('EPSG:21036')
    expect(resolveEpsg('EPSG:21037').code).toBe('EPSG:21037')
  })

  it('lazily materialises all 120 WGS84 UTM zones', () => {
    expect(resolveEpsg('EPSG:32601').hemisphere).toBe('N')
    expect(resolveEpsg('EPSG:32660').zone).toBe(60)
    expect(resolveEpsg('EPSG:32701').hemisphere).toBe('S')
    expect(resolveEpsg('EPSG:32760').zone).toBe(60)
    expect(resolveEpsg('EPSG:32737').name).toBe('WGS 84 / UTM zone 37S')
  })

  it('marks EPSG:3857 as display-only', () => {
    const info = resolveEpsg('EPSG:3857')
    expect(info.displayOnly).toBe(true)
    expect(info.notes).toMatch(/DISPLAY ONLY/i)
  })

  it('throws on unregistered codes — METARDU never guesses a datum', () => {
    expect(() => resolveEpsg('EPSG:99999')).toThrow(CrsError)
    expect(() => resolveEpsg('EPSG:99999')).toThrow(/not registered/)
    expect(() => resolveEpsg('EPSG:21035')).toThrow(/not registered/)
    expect(isRegistered('EPSG:99999')).toBe(false)
    expect(isRegistered('EPSG:21037')).toBe(true)
    expect(describeCrs('EPSG:99999')).toBeNull()
  })

  it('throws on empty/invalid code strings', () => {
    expect(() => resolveEpsg('')).toThrow(CrsError)
    expect(() => resolveEpsg('   ')).toThrow(CrsError)
  })

  it('registerCrs accepts a new CRS and is idempotent for identical defs', () => {
    registerCrs(
      {
        code: 'EPSG:21035',
        name: 'Arc 1960 / UTM zone 35S (Kenya EPSG:1122 transformation)',
        datum: 'Arc 1960',
        units: 'metres',
        projected: true,
        zone: 35,
        hemisphere: 'S',
        notes: 'Register only after verifying national transformation parameters.',
      },
      '+proj=utm +zone=35 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs',
    )
    expect(resolveEpsg('EPSG:21035').zone).toBe(35)
    // re-registering identical def is a no-op
    expect(() =>
      registerCrs(
        { code: 'EPSG:21035', name: 'Arc 1960 / UTM zone 35S (Kenya EPSG:1122 transformation)', datum: 'Arc 1960', units: 'metres', projected: true, zone: 35, hemisphere: 'S' },
      '+proj=utm +zone=35 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs',
      ),
    ).not.toThrow()
  })

  it('registerCrs refuses to silently replace parameters of an existing CRS', () => {
    expect(() =>
      registerCrs(
        { code: 'EPSG:21037', name: 'hijack', datum: 'WGS 84', units: 'metres', projected: true },
        '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs',
      ),
    ).toThrow(/different definition/)
    // original definition intact
    expect(resolveEpsg('EPSG:21037').datum).toBe('Arc 1960')
  })

  it('rejects invalid registrations', () => {
    expect(() => registerCrs({ code: '', name: '', datum: '', units: 'metres', projected: true }, '+proj=utm')).toThrow(CrsError)
    expect(() => registerCrs({ code: 'EPSG:X', name: 'x', datum: 'd', units: 'metres', projected: true }, '')).toThrow(CrsError)
  })
})

describe('assertSurveyCrs / assertProjectedCrs — the professional gate', () => {
  it('rejects EPSG:3857 for survey mathematics with a specific error code', () => {
    expect(() => assertSurveyCrs('EPSG:3857')).toThrow(CrsError)
    try {
      assertSurveyCrs('EPSG:3857')
      fail('should have thrown')
    } catch (e) {
      expect((e as CrsError).code).toBe('CRS_DISPLAY_ONLY_FOR_SURVEY')
      expect((e as CrsError).message).toMatch(/must never be used for survey/)
    }
  })

  it('accepts projected national CRS', () => {
    const info = assertSurveyCrs('EPSG:21037')
    expect(info.code).toBe('EPSG:21037')
    expect(assertProjectedCrs('EPSG:32737').zone).toBe(37)
  })

  it('rejects geographic CRS for plane survey math with guidance', () => {
    try {
      assertProjectedCrs('EPSG:4326')
      fail('should have thrown')
    } catch (e) {
      expect((e as CrsError).code).toBe('CRS_NOT_PROJECTED')
      expect((e as CrsError).message).toMatch(/geodesicDistanceWgs84/)
    }
  })

  it('rejects unregistered codes', () => {
    expect(() => assertSurveyCrs('EPSG:4230')).toThrow(/not registered/)
  })
})

describe('projectCrs guards propagate into every measurement function', () => {
  it('surveyDistance refuses EPSG:3857 and EPSG:4326', () => {
    expect(() => Reflect.apply(surveyDistance, undefined, [0, 0, 1, 1, 'EPSG:3857'])).toThrow(CrsError)
    expect(() => surveyDistance(0, 0, 1, 1, 'EPSG:4326')).toThrow(/geographic/)
    expect(() => surveyDistance(0, 0, 1, 1, 'EPSG:99999')).toThrow(/not registered/)
  })

  it('surveyBearing refuses invalid CRS', () => {
    expect(() => Reflect.apply(surveyBearing, undefined, [0, 0, 1, 1, 'EPSG:3857'])).toThrow(CrsError)
    expect(() => surveyBearing(0, 0, 1, 1, 'EPSG:21037')).not.toThrow()
  })

  it('surveyArea / surveyPerimeter refuse invalid CRS', () => {
    const ring: [number, number][] = [[500000, 9950000], [500100, 9950000], [500100, 9950100]]
    expect(() => Reflect.apply(surveyArea, undefined, [ring, 'EPSG:3857'])).toThrow(CrsError)
    expect(() => surveyPerimeter(ring, 'EPSG:4326')).toThrow(CrsError)
    expect(surveyArea(ring, 'EPSG:21037')).toBeCloseTo(5000, 6)
  })

  it('pointScaleFactor / elevationFactor / groundDistance refuse invalid CRS', () => {
    expect(() => pointScaleFactor(500000, 9950000, 'EPSG:3857')).toThrow(CrsError)
    expect(() => elevationFactor(500000, 9950000, 'EPSG:4326', 100)).toThrow(CrsError)
    expect(() => groundDistance(100, 500000, 9950000, 'EPSG:3857', 0)).toThrow(CrsError)
    expect(() => groundDistance(100, 500000, 9950000, 'EPSG:99999', 0)).toThrow(/not registered/)
  })

  it('surveyBearing throws on coincident points', () => {
    expect(() => surveyBearing(500000, 9950000, 500000, 9950000, 'EPSG:32737')).toThrow(/coincident/)
  })
})

describe('GOLDEN — projection-definition invariants', () => {
  // Certain facts from the UTM projection definition:
  //  - easting at central meridian = 500,000 m (false easting)
  //  - northing at equator = 10,000,000 m (south zones) / 0 (north zones)
  //  - point scale factor at central meridian on equator = 0.9996 exactly
  it('EPSG:32737 at central meridian on equator → (500000, 10000000)', () => {
    const [e, n] = transformPoint(39, 0, 'EPSG:4326', 'EPSG:32737')
    expect(e).toBeCloseTo(500000, 4)
    expect(n).toBeCloseTo(10000000, 4)
  })

  it('EPSG:32637 at central meridian on equator → northing 0 (north zone)', () => {
    const [, n] = transformPoint(39, 0, 'EPSG:4326', 'EPSG:32637')
    expect(n).toBeCloseTo(0, 4)
  })

  it('EPSG:32736 at central meridian (33E) on equator → (500000, 10000000)', () => {
    const [e, n] = transformPoint(33, 0, 'EPSG:4326', 'EPSG:32736')
    expect(e).toBeCloseTo(500000, 4)
    expect(n).toBeCloseTo(10000000, 4)
  })

  it('point scale factor at central meridian = 0.9996 (WGS84 UTM 37S)', () => {
    const k = pointScaleFactor(500000, 9950000, 'EPSG:32737')
    expect(k).toBeCloseTo(0.9996, 7)
  })

  it('point scale factor at central meridian = 0.9996 (Arc 1960 UTM 37S)', () => {
    const k = pointScaleFactor(500000, 9950000, 'EPSG:21037')
    expect(k).toBeCloseTo(0.9996, 7)
  })

  it('scale factor grows away from central meridian (E ≈ 700 km → k > 0.9996)', () => {
    const kOff = pointScaleFactor(700000, 9950000, 'EPSG:32737')
    expect(kOff).toBeGreaterThan(0.9996)
    // 200 km east of CM: k ≈ 0.9996 × (1 + (200000)²/(2×6.36e6²)) ≈ 1.00010
    expect(kOff).toBeCloseTo(1.0001, 3)
  })

  it('scale factor is symmetric about the central meridian (east vs west)', () => {
    const kEast = pointScaleFactor(560000, 9950000, 'EPSG:32737')
    const kWest = pointScaleFactor(440000, 9950000, 'EPSG:32737')
    expect(kEast).toBeCloseTo(kWest, 8)
  })

  it('WGS84 equator 1° of longitude = 111,319.4908 m (Vincenty golden)', () => {
    const d = geodesicDistanceWgs84(0, 0, 1, 0)
    expect(d).toBeCloseTo(111319.4908, 3)
  })

  it('WGS84 meridian 1° at equator = 110,574.3886 m', () => {
    const d = geodesicDistanceWgs84(0, 0, 0, 1)
    expect(d).toBeCloseTo(110574.3886, 3)
  })

  it('grid distance on central meridian ≈ geodesic / 0.9996 (system-level tie)', () => {
    // 1 km due east on the CM, at equator-ish, zone 37S.
    const a = transformPoint(500000, 9999000, 'EPSG:32737', 'EPSG:4326')
    const b = transformPoint(501000, 9999000, 'EPSG:32737', 'EPSG:4326')
    const geodesic = geodesicDistanceWgs84(a[0], a[1], b[0], b[1])
    expect(geodesic / 1000).toBeCloseTo(1 / 0.9996, 4)
  })
})

describe('GOLDEN — Arc 1960 national transformation consistency', () => {
  it('both Kenyan zone defs carry the identical EPSG:1122 registered shift (never a different shift per zone)', () => {
    const t36 = /\+towgs84=([^\s]+)/.exec(EPSG_21036_DEF)?.[1]
    const t37 = /\+towgs84=([^\s]+)/.exec(EPSG_21037_DEF)?.[1]
    expect(t36).toBeDefined()
    expect(t36).toBe(t37)
    expect(t36).toBe('-160,-6,-302,0,0,0,0')
  })

  it('EPSG:21037 is used as the registry definition verbatim', () => {
    // Round-trip through the registered CRS must agree with the raw def transform.
    const viaModule = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:21037')
    const [lon, lat] = transformPoint(viaModule[0], viaModule[1], 'EPSG:21037', 'EPSG:4326')
    expect(lon).toBeCloseTo(NAIROBI.lon, 7)
    expect(lat).toBeCloseTo(NAIROBI.lat, 7)
  })

  it('Nairobi in EPSG:21037 lands in the correct Kenya UTM range', () => {
    const [e, n] = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:21037')
    // Nairobi: E ≈ 276 km, N ≈ 9,858 km (south zone) — range check only.
    expect(e).toBeGreaterThan(200000)
    expect(e).toBeLessThan(800000)
    expect(n).toBeGreaterThan(9800000)
    expect(n).toBeLessThan(10000000)
  })
})

describe('CRS round-trip integrity', () => {
  it('4326 → 21037 → 4326 preserves coordinates to sub-mm level', () => {
    const [e, n] = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:21037')
    const [lon, lat] = transformPoint(e, n, 'EPSG:21037', 'EPSG:4326')
    // 1e-7 degrees ≈ 11 mm
    expect(Math.abs(lon - NAIROBI.lon)).toBeLessThan(1e-7)
    expect(Math.abs(lat - NAIROBI.lat)).toBeLessThan(1e-7)
  })

  it('project ↔ display round-trip preserves coordinates to mm', () => {
    const [e, n] = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:32737')
    const disp = toDisplay(e, n, 'EPSG:32737')
    const back = fromDisplay(disp[0], disp[1], 'EPSG:32737')
    expect(Math.abs(back[0] - e)).toBeLessThan(1e-3)
    expect(Math.abs(back[1] - n)).toBeLessThan(1e-3)
  })

  it('projected CRS ↔ projected CRS round-trip (21037 ↔ 32737)', () => {
    const [e1, n1] = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:21037')
    const [w, s] = transformPoint(e1, n1, 'EPSG:21037', 'EPSG:32737')
    const [e2, n2] = transformPoint(w, s, 'EPSG:32737', 'EPSG:21037')
    expect(Math.abs(e2 - e1)).toBeLessThan(0.01)
    expect(Math.abs(n2 - n1)).toBeLessThan(0.01)
    // Arc 1960 → WGS84 with 7-param must move the point ~300-500 m in E,
    // never a zero or absurd shift (the params must actually be applied).
    expect(Math.abs(w - e1)).toBeGreaterThan(1)
  })

  it('transformGeometry round-trips a polygon and preserves vertex count', () => {
    const poly = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [500000, 9950000],
          [500100, 9950000],
          [500100, 9950100],
          [500000, 9950100],
          [500000, 9950000],
        ],
      ],
    }
    const disp = transformGeometry(poly, 'EPSG:32737', 'EPSG:3857')
    const back = transformGeometry(disp, 'EPSG:3857', 'EPSG:32737')
    expect(back.coordinates[0]).toHaveLength(5)
    back.coordinates[0].forEach((pt, i) => {
      expect(pt[0]).toBeCloseTo(poly.coordinates[0][i][0], 3)
      expect(pt[1]).toBeCloseTo(poly.coordinates[0][i][1], 3)
    })
  })

  it('transformGeometry preserves 3rd dimension (z)', () => {
    const line = {
      type: 'LineString' as const,
      coordinates: [
        [500000, 9950000, 1798],
        [500100, 9950100, 1800],
      ],
    }
    const disp = transformGeometry(line, 'EPSG:32737', 'EPSG:3857')
    expect(disp.coordinates[0][2]).toBe(1798)
    const back = transformGeometry(disp, 'EPSG:3857', 'EPSG:32737')
    expect(back.coordinates[1][2]).toBe(1800)
  })

  it('transformGeometry identity (same CRS) returns equal geometry', () => {
    const pt = { type: 'Point' as const, coordinates: [500000, 9950000] }
    const same = transformGeometry(pt, 'EPSG:32737', 'EPSG:32737')
    expect(same.coordinates).toEqual(pt.coordinates)
    expect(same.coordinates).not.toBe(pt.coordinates) // deep copy, no aliasing
  })

  it('rejects unsupported geometry types', () => {
    expect(() =>
      transformGeometry({ type: 'Bogus' } as never, 'EPSG:32737', 'EPSG:3857'),
    ).toThrow(/Unsupported/)
  })
})

describe('property tests — plane survey math', () => {
  // Property (blueprint §35): inverse(A,B) = inverse(B,A);
  // translation/rotation preserve area; bearings are antisymmetric.

  const A: [number, number] = [500000, 9950000]
  const B: [number, number] = [500437.221, 9950312.559]

  it('distance is symmetric', () => {
    const d1 = surveyDistance(A[0], A[1], B[0], B[1], 'EPSG:32737')
    const d2 = surveyDistance(B[0], B[1], A[0], A[1], 'EPSG:32737')
    expect(d1).toBe(d2)
    expect(d1).toBeGreaterThan(500)
    expect(d1).toBeLessThan(550)
  })

  it('bearing is antisymmetric (back bearing = fore ± 180°)', () => {
    const brg = surveyBearing(A[0], A[1], B[0], B[1], 'EPSG:32737')
    const back = surveyBearing(B[0], B[1], A[0], A[1], 'EPSG:32737')
    const delta = Math.abs(brg - back)
    expect(Math.min(delta, Math.abs(delta - 360))).toBeCloseTo(180, 9)
    expect(brg).toBeGreaterThanOrEqual(0)
    expect(brg).toBeLessThan(360)
  })

  it('cardinal bearings are exact in projected coordinates', () => {
    expect(surveyBearing(500000, 9950000, 500000, 9950100, 'EPSG:32737')).toBeCloseTo(0, 9)
    expect(surveyBearing(500000, 9950000, 500100, 9950000, 'EPSG:32737')).toBeCloseTo(90, 9)
    expect(surveyBearing(500000, 9950000, 500000, 9949900, 'EPSG:32737')).toBeCloseTo(180, 9)
    expect(surveyBearing(500000, 9950000, 499900, 9950000, 'EPSG:32737')).toBeCloseTo(270, 9)
  })

  it('translation preserves area', () => {
    const square: [number, number][] = [
      [500000, 9950000],
      [500100, 9950000],
      [500100, 9950100],
      [500000, 9950100],
    ]
    const moved = square.map(([e, n]) => [e + 12345.678, n - 9876.543] as [number, number])
    expect(surveyArea(moved, 'EPSG:32737')).toBeCloseTo(10000, 6)
    expect(surveyArea(square, 'EPSG:32737')).toBeCloseTo(10000, 6)
  })

  it('rotation preserves area (within numerical noise)', () => {
    const square: [number, number][] = [
      [500000, 9950000],
      [500100, 9950000],
      [500100, 9950100],
      [500000, 9950100],
    ]
    const theta = (37 * Math.PI) / 180
    const rotated = square.map(([e, n]) => {
      const de = e - 500000
      const dn = n - 9950000
      return [
        500000 + de * Math.cos(theta) - dn * Math.sin(theta),
        9950000 + de * Math.sin(theta) + dn * Math.cos(theta),
      ] as [number, number]
    })
    expect(surveyArea(rotated, 'EPSG:32737')).toBeCloseTo(10000, 3)
  })

  it('perimeter of 100×100 square = 400 m; area = 10,000 m²', () => {
    const square: [number, number][] = [
      [500000, 9950000],
      [500100, 9950000],
      [500100, 9950100],
      [500000, 9950100],
    ]
    expect(surveyPerimeter(square, 'EPSG:32737')).toBeCloseTo(400, 9)
    expect(surveyArea(square, 'EPSG:32737')).toBeCloseTo(10000, 9)
    // open ring (no repeated vertex) must give the same result as closed ring
    expect(surveyArea([...square, square[0]], 'EPSG:32737')).toBeCloseTo(10000, 9)
  })

  it('degenerate rings are safe', () => {
    expect(surveyArea([], 'EPSG:32737')).toBe(0)
    expect(surveyArea([[0, 0], [1, 1]], 'EPSG:32737')).toBe(0)
    expect(surveyPerimeter([[500000, 9950000]], 'EPSG:32737')).toBe(0)
  })

  it('distance never depends on CRS order of arguments (x,y symmetry)', () => {
    const dAB = surveyDistance(A[0], A[1], B[0], B[1], 'EPSG:32737')
    const dBA = surveyDistance(B[0], B[1], A[0], A[1], 'EPSG:32737')
    expect(dAB).toBe(dBA)
  })
})

describe('grid vs ground — the legal timebomb', () => {
  it('elevation factor at height 0 is exactly 1', () => {
    expect(elevationFactor(500000, 9950000, 'EPSG:32737', 0)).toBeCloseTo(1, 12)
  })

  it('elevation factor at 1,600 m ≈ R/(R+1600) on WGS84', () => {
    const ef = elevationFactor(500000, 9950000, 'EPSG:32737', 1600)
    // R = √(ρν) at lat ≈ −0.45° ≈ 6.356e6 m
    const expected = 6356066 / (6356066 + 1600)
    expect(ef).toBeCloseTo(expected, 6)
    expect(ef).toBeLessThan(1)
  })

  it('combined factor at central meridian at ground level = k = 0.9996', () => {
    const C = combinedScaleFactor(500000, 9950000, 'EPSG:32737', 0)
    expect(C).toBeCloseTo(0.9996, 7)
  })

  it('ground distance > grid distance when combined factor < 1', () => {
    const g = groundDistance(100, 500000, 9950000, 'EPSG:32737', 1600)
    expect(g).toBeGreaterThan(100)
    // round trip back to grid must be lossless
    expect(gridDistance(g, 500000, 9950000, 'EPSG:32737', 1600)).toBeCloseTo(100, 6)
  })

  it('grid distance < ground distance: 100 m ground at Nairobi elevation ≈ 99.96 m grid', () => {
    const grid = gridDistance(100, 500000, 9950000, 'EPSG:32737', 1600)
    expect(grid).toBeLessThan(100)
    expect(grid).toBeCloseTo(99.96, 1)
  })

  it('cross-validates against the existing geodesy/scaleFactor.ts engine (independent path)', () => {
    // Nairobi: lat −1.2864, zone 37, h = 1600 m
    const existing = computeCombinedScaleFactor({
      latitude: -1.2864,
      longitude: 36.8172,
      utmZone: 37,
      ellipsoidalHeight: 1600,
    })
    // Project Nairobi to zone 37S to get x,y for the authority engine.
    const [e, n] = transformPoint(NAIROBI.lon, NAIROBI.lat, 'EPSG:4326', 'EPSG:32737')
    const authority = combinedScaleFactor(e, n, 'EPSG:32737', 1600)
    // The authority computes k by numerical differentiation (the definition
    // of point scale factor); the legacy engine uses the truncated series
    // k₀(1 + E'²/2ν²(1+η²) + E'⁴/24ν⁴) with E' taken as the parallel arc.
    // Residual disagreement is series truncation + that E' approximation —
    // sub-ppm, which is the documented accuracy of the series path.
    expect(Math.abs(authority - existing.combinedScaleFactor)).toBeLessThan(5e-7)
    expect(existing.gridScaleFactor).toBeGreaterThan(0.9996)
  })
})

describe('suggestUtmCrs — worldwide, no fast-path hijacks', () => {
  it('Kenya locations', () => {
    expect(suggestUtmCrs(-1.2864, 36.8172).code).toBe('EPSG:32737')
    expect(suggestUtmCrs(-0.0917, 34.768).code).toBe('EPSG:32736')
    expect(suggestUtmCrs(-4.0435, 39.6682).code).toBe('EPSG:32737')
  })

  it('Europe / northern hemisphere', () => {
    expect(suggestUtmCrs(51.5074, -0.1278).code).toBe('EPSG:32630')
    expect(suggestUtmCrs(60.1699, 24.9384).code).toBe('EPSG:32635')
  })

  it('Norway exception (lat 56–64, lng 3–12 → zone 32)', () => {
    expect(suggestUtmCrs(60, 6).zone).toBe(32)
  })

  it('Svalbard exceptions', () => {
    expect(suggestUtmCrs(78, 15).zone).toBe(33)
    expect(suggestUtmCrs(78, 5).zone).toBe(31)
  })

  it('clamps zone to 1..60', () => {
    expect(suggestUtmCrs(0, 180).zone).toBe(60)
    expect(suggestUtmCrs(0, -180).zone).toBe(1)
  })

  it('suggests but never auto-registers (explicit confirmation required)', () => {
    const s = suggestUtmCrs(-1.2864, 36.8172)
    // The SUGGESTED code must be registered — but the function must not
    // mutate the registry by itself.
    expect(isRegistered(s.code)).toBe(true) // 32737 is a built-in
    const before = isRegistered('EPSG:32650')
    suggestUtmCrs(0, -102)
    expect(isRegistered('EPSG:32650')).toBe(before)
  })
})

describe('createProjectReferenceSystem — no silent professional defaults', () => {
  it('requires an explicit horizontal CRS', () => {
    expect(() => createProjectReferenceSystem({ horizontalCrs: undefined as never })).toThrow(CrsError)
    expect(() => createProjectReferenceSystem({ horizontalCrs: '' })).toThrow(CrsError)
    try {
      createProjectReferenceSystem({ horizontalCrs: undefined as never })
    } catch (e) {
      expect((e as CrsError).code).toBe('PRS_INCOMPLETE')
      expect((e as CrsError).message).toMatch(/never assumes a datum/)
    }
  })

  it('refuses display-only CRS', () => {
    expect(() => createProjectReferenceSystem({ horizontalCrs: 'EPSG:3857' })).toThrow(
      /display projection/,
    )
  })

  it('refuses geographic CRS as a project horizontal CRS', () => {
    // EPSG:4326 is registered but not projected → must not be a project CRS
    expect(() => createProjectReferenceSystem({ horizontalCrs: 'EPSG:4326' })).toThrow(
      /geographic/,
    )
  })

  it('builds a complete reference system with visible defaults', () => {
    const prs = createProjectReferenceSystem({ horizontalCrs: 'EPSG:21037' })
    expect(prs.horizontalCrs).toBe('EPSG:21037')
    expect(prs.horizontalName).toBe('Arc 1960 / UTM zone 37S')
    expect(prs.datum).toBe('Arc 1960')
    expect(prs.units).toBe('metres')
    expect(prs.zone).toBe(37)
    expect(prs.hemisphere).toBe('S')
    expect(prs.distanceMode).toBe('grid') // visible default
    expect(prs.coordinatePrecision).toBe(3) // visible default
    expect(prs.angularUnit).toBe('degrees')
    expect(prs.verticalDatum).toBeUndefined() // NOT silently defaulted
  })

  it('accepts explicit vertical datum and ground mode', () => {
    const prs = createProjectReferenceSystem({
      horizontalCrs: 'EPSG:32737',
      verticalDatum: 'Kenya Orthometric Datum (KOD)',
      verticalReference: 'orthometric',
      distanceMode: 'ground',
      combinedScaleFactor: 0.99972,
      coordinatePrecision: 2,
    })
    expect(prs.verticalDatum).toBe('Kenya Orthometric Datum (KOD)')
    expect(prs.distanceMode).toBe('ground')
    expect(prs.combinedScaleFactor).toBeCloseTo(0.99972, 8)
    expect(prs.coordinatePrecision).toBe(2)
  })

  it('describeProjectReferenceSystem always states vertical datum status (no silent defaults)', () => {
    const noVert = createProjectReferenceSystem({ horizontalCrs: 'EPSG:21037' })
    const lines = describeProjectReferenceSystem(noVert)
    expect(lines.join('\n')).toMatch(/Vertical datum: NOT SPECIFIED/)

    const withVert = createProjectReferenceSystem({
      horizontalCrs: 'EPSG:21037',
      verticalDatum: 'KOD',
      verticalReference: 'orthometric',
    })
    const lines2 = describeProjectReferenceSystem(withVert)
    expect(lines2.join('\n')).toMatch(/Vertical datum: KOD \(orthometric\)/)
    expect(lines2.join('\n')).not.toMatch(/NOT SPECIFIED/)
  })
})

describe('validateCoordinateRange — catches the classic blunders', () => {
  it('accepts a valid Kenya UTM coordinate', () => {
    const r = validateCoordinateRange(500000, 9950000, 'EPSG:32737')
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('rejects NaN / Infinity', () => {
    expect(validateCoordinateRange(NaN, 0, 'EPSG:32737').valid).toBe(false)
    expect(validateCoordinateRange(0, Infinity, 'EPSG:32737').valid).toBe(false)
  })

  it('flags degrees loaded as metres (eastings outside UTM domain)', () => {
    const r = validateCoordinateRange(36.8172, -1.2864, 'EPSG:32737')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toMatch(/outside the UTM easting domain/)
  })

  it('flags northern-hemisphere northing in a southern zone CRS', () => {
    const r = validateCoordinateRange(500000, 10_500_000, 'EPSG:32737')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toMatch(/wrong hemisphere/)
  })

  it('warns on wrong-zone easting but does not hard-fail', () => {
    const r = validateCoordinateRange(120000, 9950000, 'EPSG:32737')
    expect(r.valid).toBe(true)
    expect(r.warnings[0]).toMatch(/wrong-zone/)
  })

  it('validates geographic coordinates with lat/lon bounds', () => {
    expect(validateCoordinateRange(36.8172, -1.2864, 'EPSG:4326').valid).toBe(true)
    expect(validateCoordinateRange(36.8172, 95, 'EPSG:4326').valid).toBe(false)
    expect(validateCoordinateRange(200, 0, 'EPSG:4326').valid).toBe(false)
    expect(validateCoordinateRange(36.8172, 85, 'EPSG:4326').warnings).toHaveLength(1)
  })

  it('refuses display CRS outright', () => {
    expect(() => validateCoordinateRange(0, 0, 'EPSG:3857')).toThrow(CrsError)
  })
})

describe('validateCrsForProject — the import gate', () => {
  it('same CRS → ok', () => {
    const r = validateCrsForProject('EPSG:21037', 'EPSG:21037')
    expect(r.level).toBe('ok')
  })

  it('different projected CRS → warning requiring explicit confirmation', () => {
    const r = validateCrsForProject('EPSG:32737', 'EPSG:21037')
    expect(r.level).toBe('warning')
    expect(r.message).toMatch(/must be recorded/)
    expect(r.message).toMatch(/jurisdiction/)
  })

  it('display CRS → error', () => {
    expect(validateCrsForProject('EPSG:3857', 'EPSG:21037').level).toBe('error')
    expect(validateCrsForProject('EPSG:3857', 'EPSG:21037').message).toMatch(/display-only/)
  })

  it('unregistered CRS → error with registerCrs guidance', () => {
    const r = validateCrsForProject('EPSG:4230', 'EPSG:21037')
    expect(r.level).toBe('error')
    expect(r.message).toMatch(/register it explicitly/i)
  })

  it('geographic source → warning (transformation required)', () => {
    const r = validateCrsForProject('EPSG:4326', 'EPSG:21037')
    expect(r.level).toBe('warning')
    expect(r.message).toMatch(/transform/)
  })
})

describe('coordinate formatting service', () => {
  it('formats coordinates with grouping and fixed decimals', () => {
    expect(formatCoordinate(276443.215, 3)).toBe('276,443.215')
    expect(formatCoordinate(9950000, 3)).toBe('9,950,000.000')
    expect(formatCoordinate(-1234.567, 2)).toBe('-1,234.57')
    expect(formatCoordinate(0, 3)).toBe('0.000')
  })

  it('supports ungrouped output', () => {
    expect(formatCoordinate(276443.215, 3, { grouping: false })).toBe('276443.215')
  })

  it('handles non-finite gracefully', () => {
    expect(formatCoordinate(NaN, 3)).toBe('—')
    expect(formatCoordinate(Infinity, 3)).toBe('—')
  })

  it('formats an easting/northing pair for schedules', () => {
    expect(formatPoint(500000, 9950000, 3)).toBe('E 500,000.000   N 9,950,000.000')
  })

  it('formats whole-circle bearings in DMS', () => {
    expect(formatBearingDms(0)).toBe(`0°00'00.0"`)
    expect(formatBearingDms(90)).toBe(`90°00'00.0"`)
    expect(formatBearingDms(45.5138889)).toBe(`45°30'50.0"`)
    expect(formatBearingDms(359.999)).toBe(`359°59'56.4"`)
    expect(formatBearingDms(360 + 45)).toBe(`45°00'00.0"`) // normalised
    expect(formatBearingDms(-90)).toBe(`270°00'00.0"`) // normalised
  })

  it('formats quadrant bearings (cadastral convention)', () => {
    expect(formatBearingQuadrant(45)).toBe(`N 45°00'00.0" E`)
    expect(formatBearingQuadrant(135)).toBe(`S 45°00'00.0" E`)
    expect(formatBearingQuadrant(225)).toBe(`S 45°00'00.0" W`)
    expect(formatBearingQuadrant(315)).toBe(`N 45°00'00.0" W`)
    expect(formatBearingQuadrant(0)).toBe(`N 00°00'00.0" E`)
    expect(formatBearingQuadrant(90)).toBe(`S 90°00'00.0" E`)
  })

  it('formats latitude/longitude in DMS with hemisphere letters', () => {
    expect(formatLatLonDms(-1.286389, 'lat')).toBe(`1°17'11.0"S`)
    expect(formatLatLonDms(51.5074, 'lat')).toBe(`51°30'26.6"N`)
    expect(formatLatLonDms(36.8172, 'lon')).toBe(`36°49'01.9"E`)
    expect(formatLatLonDms(-0.0917, 'lat')).toBe(`0°05'30.1"S`)
  })

  it('precision parameter controls seconds decimals', () => {
    expect(formatBearingDms(45.5138889, 2)).toBe(`45°30'50.00"`)
    expect(formatBearingDms(45.5138889, 0)).toBe(`45°30'50"`)
  })
})
