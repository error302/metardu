import { buildBreaklineTIN } from '../breaklineTIN'
import { generateTINContours } from '../tinContours'
import { interpolateZ } from '@/lib/survey/surfaceTIN'

const plane = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 10, y: 10, z: 10 }, { x: 0, y: 10, z: 0 }]

test('plane contours follow the TIN and stop at the surveyed hull without a bounding rectangle', () => {
  const tin = buildBreaklineTIN(plane)
  const contours = generateTINContours(tin, { interval: 2, maxVertexSpacing: 3 })
  const line = contours.find(c => c.elevation === 4)
  if (!line) throw new Error('Plane contour at level 4 is missing.')
  expect(line.coordinates).toHaveLength(1)
  expect(line.coordinates[0].every(([x]) => Math.abs(x - 4) < 1e-9)).toBe(true)
  expect(line.coordinates[0].map(p => p[1]).sort((a, b) => a - b)[0]).toBe(0)
  expect(line.coordinates[0].map(p => p[1]).sort((a, b) => b - a)[0]).toBe(10)
  for (const c of contours) for (const path of c.coordinates) for (const [x, y] of path) {
    expect(interpolateZ(tin, x, y)).toBeCloseTo(c.elevation, 8)
  }
})

test('ridge breaklines change contours, which keep both sides of the ridge', () => {
  const base = plane.map(p => ({ ...p, z: 0 }))
  const tin = buildBreaklineTIN(base, [{ type: 'ridge', points: [{ x: 5, y: 0, z: 2 }, { x: 5, y: 10, z: 2 }] }])
  const contours = generateTINContours(tin, { interval: 1 })
  const one = contours.find(c => c.elevation === 1)
  if (!one) throw new Error('Ridge contour at level 1 is missing.')
  expect(one.coordinates).toHaveLength(2)
  expect(one.coordinates.flat().map(p => p[0])).toEqual(expect.arrayContaining([2.5, 7.5]))
  for (const path of one.coordinates) for (const [x, y] of path) expect(interpolateZ(tin, x, y)).toBeCloseTo(1, 9)
})

test('flat plateaus do not become artificial contour polygons', () => {
  expect(generateTINContours(buildBreaklineTIN(plane.map(p => ({ ...p, z: 2 }))), { interval: 1 })).toEqual([])
})

test('closed hill isolines retain a closed chain; measured vertices are joined once', () => {
  const tin = buildBreaklineTIN([...plane.map(p => ({ ...p, z: 0 })), { x: 5, y: 5, z: 2 }])
  const contour = generateTINContours(tin, { interval: 1 }).find(c => c.elevation === 1)
  if (!contour) throw new Error('Hill contour at level 1 is missing.')
  const path = contour.coordinates[0]
  expect(path).toHaveLength(5)
  expect(path[0]).toEqual(path[path.length - 1])
  expect(new Set(path.slice(0, -1).map(p => p.join(':'))).size).toBe(4)
})

test('large projected coordinates and negative decimal elevations remain numerically correct', () => {
  const tin = buildBreaklineTIN(plane.map(p => ({ x: p.x + 500000, y: p.y + 9800000, z: p.z / 10 - 0.5 })))
  const contours = generateTINContours(tin, { interval: 0.1 })
  expect(contours.some(c => c.elevation === -0.3)).toBe(true)
  for (const c of contours) for (const path of c.coordinates) for (const [x, y] of path) {
    expect(interpolateZ(tin, x, y)).toBeCloseTo(c.elevation, 7)
  }
})

test('pathological contour interval and output density fail promptly', () => {
  const tin = buildBreaklineTIN(plane)
  expect(() => generateTINContours(tin, { interval: 0 })).toThrow(/interval/i)
  expect(() => generateTINContours(tin, { interval: 0.00000001 })).toThrow(/limit|levels/i)
  expect(() => generateTINContours(tin, { interval: 2, maxVertexSpacing: 1e-10 })).toThrow(/limit|vertices/i)
})
