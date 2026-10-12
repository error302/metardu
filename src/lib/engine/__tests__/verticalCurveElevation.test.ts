import { computeVerticalCurve, verticalCurveElevation } from '../engineering'

describe('vertical curve elevations', () => {
  it('uses the percent-to-decimal conversion in the parabolic term and joins tangents continuously', () => {
    const curve = computeVerticalCurve(100, 100, 2, -2, 100)

    expect(verticalCurveElevation(curve, 50)).toBeCloseTo(99, 10) // PVC
    expect(verticalCurveElevation(curve, 100)).toBeCloseTo(99.5, 10) // crest
    expect(verticalCurveElevation(curve, 150)).toBeCloseTo(99, 10) // PVT
    expect(verticalCurveElevation(curve, 30)).toBeCloseTo(98.6, 10) // incoming tangent
    expect(verticalCurveElevation(curve, 170)).toBeCloseTo(98.6, 10) // outgoing tangent
    expect(curve.highLowPoint?.chainage).toBeCloseTo(100, 10)
    expect(curve.highLowPoint?.elevation).toBeCloseTo(99.5, 10)
  })

  it('fails closed for invalid curve lengths and non-finite inputs', () => {
    expect(() => computeVerticalCurve(100, 100, 2, -2, 0)).toThrow(/positive curve length/i)
    expect(() => computeVerticalCurve(100, Number.NaN, 2, -2, 100)).toThrow(/finite PVI/i)
  })
})
