import { curveSetOut, horizontalCurveElements } from '@/lib/computations/roadDesignEngine'

const setup = { radius: 100, deflectionAngleDeg: 60, deflectionAngleMin: 0, deflectionAngleSec: 0, ipChainage: 500 }
const table = { ...setup, tcChainage: 0, ctChainage: 100 * Math.PI / 3, interval: 100 * Math.PI / 9 }

test('60 degree fixture preserves arc stationing and passes its numerical identity', () => {
  const result = horizontalCurveElements(setup)
  expect(result.tangentLength).toBeCloseTo(57.73502691896258, 10)
  expect(result.curveLength).toBeCloseTo(104.71975511965977, 10)
  expect(result.longChord).toBeCloseTo(100, 10)
  expect(result.tcChainage).toBeCloseTo(442.2649730810374, 10)
  expect(result.ctChainage).toBeCloseTo(546.9847282006972, 10)
  expect(result.arithmeticCheck.passed).toBe(true)
})

test('equal 20 degree arcs have equal successive chords and incremental deflections', () => {
  const result = curveSetOut(table)
  expect(result.rows).toHaveLength(4)
  for (const row of result.rows.slice(1)) {
    expect(row.chord).toBeCloseTo(34.72963553338607, 10)
    expect(row.deflectionAngle).toBe('10°00\'00.0"')
  }
  expect(result.rows.at(-1)?.totalDeflection).toBe('30°00\'00.0"')
  expect(result.totalChord).toBeCloseTo(104.1889066001582, 10)
})

test('off-grid stationing uses PI-derived TC and includes each endpoint once', () => {
  const curve = horizontalCurveElements(setup)
  const result = curveSetOut({ ...table, tcChainage: curve.tcChainage, ctChainage: curve.ctChainage, interval: 20 })
  expect(result.rows.map(row => row.chainage)).toEqual([curve.tcChainage, 460, 480, 500, 520, 540, curve.ctChainage])
})

test('DMS display carries rounded seconds through minutes and degrees', () => {
  const result = curveSetOut({ ...table, ctChainage: 100 * (59 + 59 / 60 + 59.98 / 3600) * Math.PI / 180, deflectionAngleDeg: 59, deflectionAngleMin: 59, deflectionAngleSec: 59.98, interval: 200 })
  expect(result.rows.at(-1)?.totalDeflection).toBe('30°00\'00.0"')
})

test.each([
  { radius: 0 }, { radius: Infinity }, { deflectionAngleDeg: -1 }, { deflectionAngleDeg: 180 },
  { deflectionAngleDeg: 1.2 }, { deflectionAngleMin: 60 }, { deflectionAngleMin: 0.5 },
  { deflectionAngleSec: 60 }, { ipChainage: NaN },
])('rejects invalid element inputs %j', change => {
  expect(() => horizontalCurveElements({ ...setup, ...change })).toThrow()
})

test('conflicting chainages and angle are rejected before table generation', () => {
  expect(() => curveSetOut({ ...table, ctChainage: 120 })).toThrow(/consistent|match/i)
})

test.each([0, -20, NaN, Infinity, 1e-300, 0.00001])('rejects unsafe peg interval %s before allocating rows', interval => {
  expect(() => curveSetOut({ ...table, interval })).toThrow(/interval|precision/i)
})

test('negative chainages and fractional intervals remain valid', () => {
  const result = curveSetOut({ ...table, tcChainage: -100, ctChainage: table.ctChainage - 100, interval: 25.5 })
  expect(result.rows.map(row => row.chainage)).toEqual([-100, -76.5, -51, -25.5, 0, table.ctChainage - 100])
  expect(result.rows.every((row, index) => index === 0 || row.chainage > result.rows[index - 1].chainage)).toBe(true)
})

test('small arc at an unrepresentable large chainage is refused', () => {
  expect(() => horizontalCurveElements({ ...setup, ipChainage: 1e25 })).toThrow(/precision/i)
})

test('floating point endpoint roundoff does not create a near-duplicate CT peg', () => {
  const interval = table.ctChainage / 7
  const result = curveSetOut({ ...table, interval })
  expect(result.rows).toHaveLength(8)
  expect(result.rows.at(-1)?.peg).toBe('CT')
})
