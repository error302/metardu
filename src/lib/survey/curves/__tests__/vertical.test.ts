import { computeVerticalCurve, computeVerticalCurveStations } from '../vertical'

describe('parabolic vertical curve percent units', () => {
  it('meets the outgoing tangent at PVT and reports the interior crest', () => {
    const curve = computeVerticalCurve({ g1: 2, g2: -2, length: 100, pvcElevation: 99, pvcChainage: 50 })
    expect(curve.pvtElevation).toBeCloseTo(99, 10)
    expect(curve.turningPointDistance).toBeCloseTo(50, 10)
    expect(curve.turningPointElevation).toBeCloseTo(99.5, 10)
    expect(curve.curveType).toBe('crest')
    const stations = computeVerticalCurveStations(curve, 30)
    const pvt = stations.find(station => station.chainage === curve.pvtChainage)
    expect(pvt?.elevation).toBeCloseTo(curve.pvtElevation, 3)
    expect(pvt?.tangentOffset).toBeCloseTo(-2, 10)
  })

  it('does not invent a turning point outside the curve or on a flat grade', () => {
    const monotonic = computeVerticalCurve({ g1: 2, g2: 3, length: 100, pvcElevation: 99, pvcChainage: 0 })
    expect(monotonic.turningPointDistance).toBeUndefined()
    const flat = computeVerticalCurve({ g1: 2, g2: 2, length: 100, pvcElevation: 99, pvcChainage: 0 })
    expect(flat.curveType).toBe('flat')
    expect(flat.turningPointElevation).toBeUndefined()
  })

  it('rejects invalid lengths and intervals', () => {
    expect(() => computeVerticalCurve({ g1: 1, g2: -1, length: 0, pvcElevation: 0, pvcChainage: 0 })).toThrow(/positive length/i)
    const curve = computeVerticalCurve({ g1: 2, g2: -2, length: 100, pvcElevation: 99, pvcChainage: 0 })
    expect(() => computeVerticalCurveStations(curve, 0)).toThrow(/interval/i)
  })
  it('preserves shallow grade changes and always includes the exact final station', () => {
    const curve = computeVerticalCurve({ g1: 1.23456789, g2: 1.23434445, length: 200.005, pvcElevation: 0, pvcChainage: 0 })
    expect(curve.A).toBe(1.23434445 - 1.23456789)
    const stations = computeVerticalCurveStations(curve, 100)
    expect(stations.at(-1)?.chainage).toBe(200.005)
    expect(stations.at(-1)?.elevation).toBeCloseTo(curve.pvtElevation, 12)
  })
})
