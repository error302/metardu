/**
 * Regression tests for the Combined Scale Factor engine.
 *
 * This engine has no independent oracle of its own — it is cross-validated
 * against the exact numerical point scale factor in
 * src/lib/spatial/projectCrs.ts (see projectCrs.test.ts). The goldens below
 * are closed-form values (k₀ at the central meridian; R = √(ρν) elevation
 * factor) plus the Nairobi working point.
 */

import {
  computeCombinedScaleFactor,
  convertGridAreaToGround,
} from '../scaleFactor'

const NAIROBI = { latitude: -1.2864, longitude: 36.8172, utmZone: 37, ellipsoidalHeight: 1600 }

describe('computeCombinedScaleFactor — grid scale factor k', () => {
  it('is exactly k₀ = 0.9996 on the central meridian of either Kenyan zone', () => {
    const zone37 = computeCombinedScaleFactor({
      latitude: -1.2864,
      longitude: 39, // zone 37 CM
      utmZone: 37,
      ellipsoidalHeight: 0,
    })
    const zone36 = computeCombinedScaleFactor({
      latitude: -0.0917,
      longitude: 33, // zone 36 CM
      utmZone: 36,
      ellipsoidalHeight: 0,
    })
    expect(zone37.gridScaleFactor).toBeCloseTo(0.9996, 12)
    expect(zone36.gridScaleFactor).toBeCloseTo(0.9996, 12)
  })

  it('grows away from the central meridian and never at the CM', () => {
    const at = (lon: number) =>
      computeCombinedScaleFactor({ latitude: -1.2864, longitude: lon, utmZone: 37, ellipsoidalHeight: 0 })
    const cm = at(39)
    const near = at(37.5)
    const far = at(35)
    expect(cm.gridScaleFactor).toBeCloseTo(0.9996, 12)
    expect(near.gridScaleFactor).toBeGreaterThan(cm.gridScaleFactor)
    expect(far.gridScaleFactor).toBeGreaterThan(near.gridScaleFactor)
    expect(far.distanceFromCentralMeridian).toBeGreaterThan(near.distanceFromCentralMeridian)
    expect(far.centralMeridian).toBe(39)
  })

  it('Nairobi grid scale factor golden (k from the truncated TM series)', () => {
    const r = computeCombinedScaleFactor(NAIROBI)
    // k₀(1 + E'²/2ν²(1+η²cos²φ) + …) at 243 km west of the zone 37 CM.
    // This value is cross-checked to < 0.4 ppm against the exact numerical
    // point scale factor in projectCrs.test.ts.
    expect(r.gridScaleFactor).toBeCloseTo(1.0003300, 6)
    expect(r.distanceFromCentralMeridian).toBeGreaterThan(242_000)
    expect(r.distanceFromCentralMeridian).toBeLessThan(244_000)
  })
})

describe('computeCombinedScaleFactor — elevation factor Fh = √(ρν)/(√(ρν)+h)', () => {
  it('is exactly 1 at height 0 and matches the closed form at 1,600 m', () => {
    const at0 = computeCombinedScaleFactor({ ...NAIROBI, ellipsoidalHeight: 0 })
    expect(at0.elevationFactor).toBeCloseTo(1, 12)

    // Closed form computed independently from ρ = a(1−e²)/(1−e²sin²φ)^{3/2},
    // ν = a/√(1−e²sin²φ), R = √(ρν).
    const a = 6378137
    const f = 1 / 298.257223563
    const e2 = 2 * f - f * f
    const sinLat = Math.sin((NAIROBI.latitude * Math.PI) / 180)
    const om = 1 - e2 * sinLat * sinLat
    const rho = (a * (1 - e2)) / Math.pow(om, 1.5)
    const nu = a / Math.sqrt(om)
    const R = Math.sqrt(rho * nu)
    const expected = R / (R + 1600)

    const at1600 = computeCombinedScaleFactor(NAIROBI)
    expect(at1600.elevationFactor).toBeCloseTo(expected, 12)
    expect(at1600.elevationFactor).toBeLessThan(1)
  })

  it('combined factor = k × Fh exactly', () => {
    const r = computeCombinedScaleFactor(NAIROBI)
    expect(r.combinedScaleFactor).toBeCloseTo(r.gridScaleFactor * r.elevationFactor, 15)
  })
})

describe('convertGridAreaToGround — the legal area conversion', () => {
  it('100 ha grid at Nairobi elevation converts with C² and reports the delta', () => {
    const csf = computeCombinedScaleFactor(NAIROBI).combinedScaleFactor
    const out = convertGridAreaToGround(1_000_000, csf) // 100 ha grid
    expect(out.groundAreaSqM).toBeCloseTo(1_000_000 / (csf * csf), 9)
    expect(out.groundAreaHa).toBeCloseTo(out.groundAreaSqM / 10_000, 9)
    expect(out.percentDifference).toBeCloseTo((1 / (csf * csf) - 1) * 100, 9)
    expect(out.csf).toBe(csf)
  })

  it('degenerate zero area is safe', () => {
    const out = convertGridAreaToGround(0, 0.9997)
    expect(out.groundAreaSqM).toBe(0)
    expect(out.percentDifference).toBe(0)
  })
})
