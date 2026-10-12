import { buildBreaklineTIN } from '../breaklineTIN'
import { buildTIN, interpolateZ, type TIN, type SurfacePoint } from '@/lib/survey/surfaceTIN'

const square: SurfacePoint[] = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }]
function area(tin: TIN) {
  return tin.triangles.reduce((total, triangle) => {
    const a = tin.points[triangle.a], b = tin.points[triangle.b], c = tin.points[triangle.c]
    return total + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
  }, 0)
}
function hasEdge(tin: TIN, left: number, right: number) {
  return tin.triangles.some(t => [t.a, t.b, t.c].includes(left) && [t.a, t.b, t.c].includes(right))
}

test('an opposing diagonal becomes a constrained edge without losing ground coverage', () => {
  const plain = buildTIN(square)
  const [a, b] = hasEdge(plain, 0, 2) ? [1, 3] : [0, 2]
  const result = buildBreaklineTIN(square, [{ type: 'hard', points: [square[a], square[b]] }])
  expect(area(result)).toBeCloseTo(100, 9)
  expect(hasEdge(result, a, b)).toBe(true)
  expect(result.triangles).toHaveLength(2)
})

test('new breakline vertices and their heights participate in the actual surface', () => {
  const result = buildBreaklineTIN(square, [{ type: 'ridge', points: [{ x: 5, y: 0, z: 2 }, { x: 5, y: 10, z: 2 }] }])
  expect(result.points).toHaveLength(6)
  expect(area(result)).toBeCloseTo(100, 9)
  expect(interpolateZ(result, 5, 5)).toBeCloseTo(2, 9)
})

test('consistent crossing breaklines gain an explicit intersection and complete coverage', () => {
  const points = square.map(p => ({ ...p, z: p.x + p.y }))
  const result = buildBreaklineTIN(points, [{ type: 'hard', points: [points[0], points[2]] }, { type: 'valley', points: [points[1], points[3]] }])
  expect(result.points).toContainEqual({ x: 5, y: 5, z: 10 })
  expect(area(result)).toBeCloseTo(100, 9)
  expect(interpolateZ(result, 3, 7)).toBeCloseTo(10, 9)
})

test('a measured point on a breakline splits its edge and retains its measured height', () => {
  const points = [...square, { x: 5, y: 5, z: 2 }]
  const result = buildBreaklineTIN(points, [{ type: 'hard', points: [square[0], square[2]] }])
  expect(hasEdge(result, 0, 4)).toBe(true)
  expect(hasEdge(result, 4, 2)).toBe(true)
  expect(interpolateZ(result, 5, 5)).toBeCloseTo(2, 9)
  expect(area(result)).toBeCloseTo(100, 9)
})

test('missing height cannot become a zero-height breakline', () => {
  expect(() => buildBreaklineTIN(square, [{ type: 'hard', points: [{ x: 5, y: 0, z: undefined }, { x: 5, y: 10, z: 2 }] as unknown as SurfacePoint[] }])).toThrow(/finite/i)
})

test('conflicting heights at one coordinate require review', () => {
  expect(() => buildBreaklineTIN([...square, { x: 0, y: 0, z: 1 }], [])).toThrow(/conflicting/i)
  expect(() => buildBreaklineTIN(square, [{ type: 'hard', points: [square[0], square[2]] }, {
    type: 'hard', points: [{ ...square[1], z: 1 }, { ...square[3], z: 1 }],
  }])).toThrow(/conflicting|height/i)
})

test('overlapping and T-junction lines become a planar constraint graph', () => {
  const points = square.map(p => ({ ...p, z: p.x + p.y }))
  const tin = buildBreaklineTIN(points, [
    { type: 'hard', points: [points[0], points[2]] },
    { type: 'soft', points: [{ x: 2, y: 2, z: 4 }, { x: 8, y: 8, z: 16 }] },
    { type: 'valley', points: [{ x: 5, y: 5, z: 10 }, points[1]] },
  ])
  expect(area(tin)).toBeCloseTo(100, 9)
  expect(tin.constraintEdges.length).toBeGreaterThanOrEqual(5)
  for (const [a, b] of tin.constraintEdges) expect(hasEdge(tin, a, b)).toBe(true)
})

test('engine APIs do not mutate observations or invent elevations, and reject extreme coordinates', () => {
  const frozen = square.map(p => Object.freeze({ ...p }))
  const before = JSON.stringify(frozen)
  buildBreaklineTIN(frozen, [{ type: 'hard', points: [frozen[0], frozen[2]] }])
  expect(JSON.stringify(frozen)).toBe(before)
  expect(() => buildBreaklineTIN([{ x: 1e308, y: 0, z: 0 }, ...square], [])).toThrow(/range/i)
  expect(() => buildBreaklineTIN([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 2, z: 0 }])).toThrow(/non-collinear/i)
})
