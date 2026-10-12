import { describe, it, expect } from '@jest/globals'
import { buildBreaklineTINWithGaps } from '../breaklineTINRefinement'
import { interpolateZ } from '@/lib/survey/surfaceTIN'
import { checkTINSlopes } from '../tinDiagnostics'

describe('contourGenerator', () => {
  it('the compatibility triangulator preserves inserted ridge controls without approximate gap filling', () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }]
    const tin = buildBreaklineTINWithGaps(points, [{ type: 'ridge', points: [{ x: 5, y: 0, z: 2 }, { x: 5, y: 10, z: 2 }] }])
    expect(tin.valid).toBe(true)
    expect(tin.points).toHaveLength(6)
    expect(interpolateZ(tin, 5, 5)).toBeCloseTo(2, 9)
    expect(tin.gapAreaFilled).toBe(0)
  })
  it('assesses the actual facet gradient independently of contour vertex spacing', () => {
    const tin = buildBreaklineTINWithGaps([{ x: 500000, y: 9800000, z: 0 }, { x: 500010, y: 9800000, z: 20 }, { x: 500000, y: 9800010, z: 0 }])
    const result = checkTINSlopes(tin, 45)
    expect(result.passed).toBe(false)
    expect(result.steepCount).toBe(1)
    expect(result.issues[0].slopeDegrees).toBeCloseTo(Math.atan(2) * 180 / Math.PI, 10)
  })
})
