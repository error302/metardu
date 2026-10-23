import { computeVerticalCurve, verticalCurveElevation, verticalCurveGrade } from '../engineering'
import { verticalCurveGeometry } from '../../computations/roadDesignEngine'

const base = { pvIChainage: 100, pvIElevation: 100, gradeIn: 2, gradeOut: -2, length: 100 }

describe('project vertical scalar integrity', () => {
  it.each([
    { pvIChainage: 1e30 }, { pvIElevation: 1e30 }, { length: Number.MIN_VALUE },
    { gradeIn: Number.MAX_VALUE, gradeOut: -Number.MAX_VALUE },
    { gradeIn: 1e200, gradeOut: -1e200, length: 1e200 },
  ])('refuses non-representable finite geometry %j', change => {
    const input = { ...base, ...change }
    expect(() => computeVerticalCurve(input.pvIChainage, input.pvIElevation, input.gradeIn, input.gradeOut, input.length)).toThrow()
    expect(() => verticalCurveElevation(input, input.pvIChainage)).toThrow()
    expect(() => verticalCurveGrade(input, input.pvIChainage)).toThrow()
  })

  it('does not overflow an otherwise representable large profile by multiplying before scaling', () => {
    const curve = computeVerticalCurve(0, 0, 1e200, 1e200, 1e110)
    expect(verticalCurveElevation(curve, -5e109)).toBeCloseTo(-5e307, -294)
    expect(verticalCurveElevation(curve, 0)).toBe(0)
    expect(verticalCurveElevation(curve, 5e109)).toBeCloseTo(5e307, -294)
  })

  it('refuses overflow when extending a steep outgoing tangent', () => {
    const curve = computeVerticalCurve(100, 0, 1000, 1000, 100)
    expect(() => verticalCurveElevation(curve, Number.MAX_VALUE)).toThrow(/range|finite|overflow/i)
  })

  it('validates the complete geometry when asked only for grade', () => {
    expect(() => verticalCurveGrade({ ...base, pvIElevation: NaN }, 100)).toThrow()
  })

  it('preserves finite flat tangents even at extreme finite query stations', () => {
    const curve = computeVerticalCurve(0, -10, 0, 0, 100)
    expect(verticalCurveElevation(curve, -Number.MAX_VALUE)).toBe(-10)
    expect(verticalCurveElevation(curve, Number.MAX_VALUE)).toBe(-10)
    expect(verticalCurveGrade(curve, Number.MAX_VALUE)).toBe(0)
  })

  it('requires an explicit request to extend the geometry model onto tangents', () => {
    const model = verticalCurveGeometry({ g1: 2, g2: -2, vpiChainage: 100, vpiRL: 100, curveLength: 100 })
    expect(() => model.elevationAtStation(30)).toThrow(/outside/i)
    expect(() => model.gradeAtStation(170)).toThrow(/outside/i)
    expect(model.elevationAtStation(30, true)).toBeCloseTo(98.6, 12)
    expect(model.gradeAtStation(170, true)).toBe(-2)
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite query %s on every model entry', station => {
    const model = verticalCurveGeometry({ g1: 2, g2: -2, vpiChainage: 100, vpiRL: 100, curveLength: 100 })
    for (const evaluate of [model.rowAtStation, model.rowAtOffset, model.elevationAtStation, model.gradeAtStation]) {
      expect(() => evaluate(station)).toThrow()
    }
  })

  it('does not trust stale derived properties when source parameters change', () => {
    const curve = computeVerticalCurve(100, 100, 2, -2, 100)
    expect(verticalCurveElevation({ ...curve, pvIElevation: 0 }, 100)).toBe(-0.5)
    expect(() => verticalCurveGrade({ ...curve, pvIElevation: 1e30 }, 100)).toThrow(/precision/i)
  })
})
