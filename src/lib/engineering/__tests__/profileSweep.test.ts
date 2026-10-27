/** @jest-environment node */
import { integrateProfileAreas, integrateProfileSweep as sweep } from '../profileGeometry'
const flat = (a: number, b: number, level: number) => [{ offset: a, level }, { offset: b, level }]

it('integrates an asymmetric rectangle with its signed first moment and right-turn Jacobian', () => {
  expect(sweep(flat(0, 10, 2), flat(0, 10, 0), 0.01)).toMatchObject({ cutArea: 20, fillArea: 0, cutMomentM3: 100, fillMomentM3: 0, cutRateM2: 19, fillRateM2: 0, minimumJacobian: 0.9 })
})
it('weights left-side material correctly without taking the absolute first moment', () => {
  const result = sweep(flat(-10, 0, 2), flat(-10, 0, 0), 0.01)
  expect(result.cutMomentM3).toBe(-100)
  expect(result.cutRateM2).toBeCloseTo(21, 13)
})
it('separates mixed cut/fill moments at the actual zero crossing', () => {
  const result = sweep([{ offset: -2, level: -2 }, { offset: 2, level: 2 }], flat(-2, 2, 0), 0.1)
  expect(result.cutArea).toBeCloseTo(2, 13)
  expect(result.fillArea).toBeCloseTo(2, 13)
  expect(result.cutMomentM3).toBeCloseTo(8 / 3, 13)
  expect(result.fillMomentM3).toBeCloseTo(-8 / 3, 13)
  expect(result.cutRateM2).toBeCloseTo(2 - 0.8 / 3, 13)
  expect(result.fillRateM2).toBeCloseTo(2 + 0.8 / 3, 13)
})
it.each([-0.025, 0, 0.025])('preserves symmetric section rates at curvature %s', curvature => {
  const result = sweep(flat(-10, 10, 2), flat(-10, 10, 0), curvature)
  expect(result.cutMomentM3).toBe(0)
  expect(result.cutRateM2).toBeCloseTo(40, 13)
})
it('integrates a triangular depth and weights fill independently', () => {
  const result = sweep(flat(0, 4, 0), [{ offset: 0, level: 0 }, { offset: 4, level: 3 }], 0.1)
  expect(result.fillArea).toBe(6)
  expect(result.fillMomentM3).toBe(16)
  expect(result.fillRateM2).toBeCloseTo(4.4, 13)
})
it('uses only the formation extent and preserves its input profiles', () => {
  const ground = flat(-20, 20, 2), formation = flat(-3, 7, 0), before = JSON.stringify({ ground, formation })
  expect(sweep(ground, formation, 0)).toMatchObject({ cutArea: 20, cutMomentM3: 40, cutRateM2: 20 })
  expect(JSON.stringify({ ground, formation })).toBe(before)
})
it.each([NaN, Infinity, -Infinity, 0.1, 0.11, (1 - Number.EPSILON) / 10])('refuses nonfinite, folded or numerically singular offset maps: %s', curvature => {
  expect(() => sweep(flat(-10, 10, 2), flat(-10, 10, 0), curvature)).toThrow()
})
it('refuses missing ground and nonfinite profile output', () => {
  expect(() => sweep(flat(-2, 2, 0), flat(-3, 3, 1), 0)).toThrow(/cover|extend/i)
  expect(() => sweep(flat(-2, 2, NaN), flat(-2, 2, 1), 0)).toThrow(/finite/i)
})
it('retains separated tiny cut and fill instead of losing a crossing to product underflow', () => {
  const result = integrateProfileAreas([{ offset: -1, level: -1e-200 }, { offset: 1, level: 1e-200 }], flat(-1, 1, 0))
  expect(result.cutArea / 1e-200).toBeCloseTo(0.5, 12)
  expect(result.fillArea / 1e-200).toBeCloseTo(0.5, 12)
})
it('does not lose a crossing when the sum of its finite absolute depths overflows', () => {
  const result = integrateProfileAreas([{ offset: 0, level: 5e307 }, { offset: 1e-308, level: -5e307 }], [{ offset: 0, level: -5e307 }, { offset: 1e-308, level: 5e307 }])
  expect(result.cutArea).toBeCloseTo(0.25, 12)
  expect(result.fillArea).toBeCloseTo(0.25, 12)
})
