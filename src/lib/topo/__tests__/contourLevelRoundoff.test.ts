import { generateTINContours } from '../tinContours'
import type { TIN } from '@/lib/survey/surfaceTIN'
const surface = (low: number, high: number): TIN => ({
  points: [{ x: 0, y: 0, z: low }, { x: 10, y: 0, z: high }, { x: 0, y: 10, z: high }],
  triangles: [{ a: 0, b: 1, c: 2 }], minX: 0, maxX: 10, minY: 0, maxY: 10,
})
test('decimal range division must not omit a valid maximum contour edge', () => {
  const lines = generateTINContours(surface(0.1, 0.3), { interval: 0.1 })
  expect(lines.find(line => line.elevation === 0.3)?.coordinates).toEqual([[[10, 0], [0, 10]]])
})
test('negative decimal minimum edges survive floating division rounding', () => {
  const tin = surface(-0.3, -0.1)
  tin.points[1].z = -0.3
  expect(generateTINContours(tin, { interval: 0.1 }).find(line => line.elevation === -0.3)?.coordinates).toEqual([[[0, 0], [10, 0]]])
})
test('roundoff in equivalent computed heights does not split or displace an exact-level edge', () => {
  const lines = generateTINContours(surface(0.1, 0.1 + 0.2), { interval: 0.1 })
  expect(lines.find(line => line.elevation === 0.3)?.coordinates).toEqual([[[10, 0], [0, 10]]])
})
test('measured differences beyond arithmetic roundoff are not snapped to a requested level', () => {
  expect(generateTINContours(surface(0.1, 0.3 - 1e-10), { interval: 0.1 }).some(line => line.elevation === 0.3)).toBe(false)
})
test('small nonzero heights near zero do not become an artificial flat surface', () => {
  const lines = generateTINContours(surface(1e-18, 3e-18), { interval: 1e-18 })
  expect(lines.some(line => line.elevation === 2e-18)).toBe(true)
})
test('distinct representable fine levels at a large datum are retained without decimal precision truncation', () => {
  const levels = generateTINContours(surface(1000, 1000.000000000005), { interval: 1e-12 }).map(line => line.elevation)
  expect(levels).toContain(1000.000000000001)
  expect(new Set(levels).size).toBe(levels.length)
})
