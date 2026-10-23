import { compoundCurveElements, reverseCurveApprox, curveStakeout } from '../curves'

test('compound PCC station is joined by actual arc lengths, not tangent lengths', () => {
  const result = compoundCurveElements({ R1: 100, R2: 200, delta1Deg: 60, delta2Deg: 30, junctionChainage: 500 })
  expect(result.chainT1).toBeCloseTo(395.28024488034, 9)
  expect(result.chainJ).toBe(500)
  expect(result.chainT2).toBeCloseTo(604.71975511966, 9)
  expect(result.totalLength).toBeCloseTo(209.43951023932, 9)
})

test.each([{ R1: -1 }, { delta1Deg: 0 }, { delta2Deg: 180 }, { delta1Deg: 100, delta2Deg: 100 }, { junctionChainage: Infinity }, { junctionChainage: 1e30 }])('compound rejects invalid or unresolved geometry %j', override => {
  expect(() => compoundCurveElements({ R1: 100, R2: 200, delta1Deg: 60, delta2Deg: 30, junctionChainage: 500, ...override })).toThrow()
})

test('reverse curve length includes supplied arcs and the actual intervening tangent', () => {
  expect(() => reverseCurveApprox({ R1: 100, R2: 200, AB: 150, delta1: 60, delta2: 60 })).toThrow(/overlap|distance|tangent/i)
})

test('reverse curves cannot be solved from radii and PI separation without angles', () => {
  expect(() => reverseCurveApprox({ R1: 100, R2: 200, AB: 500 })).toThrow(/angle|deflection/i)
})

test('valid reverse geometry uses common-tangent PI distance and supplied deflections', () => {
  const result = reverseCurveApprox({ R1: 100, R2: 200, AB: 300, delta1: 60, delta2: 60 })
  expect(result.commonTangent).toBeCloseTo(126.794919243112, 9)
  expect(result.totalLength).toBeCloseTo(440.954184602091, 9)
  expect(result.isApprox).toBe(false)
})

test.each([{ R1: 0 }, { AB: -1 }, { AB: 1 }, { AB: 1e30 }, { delta1: 0 }, { delta2: 180 }, { delta1: Infinity }, { delta2: undefined }])('reverse rejects incomplete or impossible geometry %j', override => {
  expect(() => reverseCurveApprox({ R1: 100, R2: 200, AB: 300, delta1: 60, delta2: 60, ...override })).toThrow()
})

test('legacy simple set-out retains exact endpoint and rejects excessive allocation', () => {
  const result = curveStakeout(500, 0, 100, 60, 20)
  expect(result.points.at(-1)?.chainage).toBe(result.ptChainage)
  expect(result.points.at(-1)?.chordLength).toBeCloseTo(100, 10)
  expect(() => curveStakeout(500, 0, 100, 60, 0.00001)).toThrow(/interval|limit/i)
})
