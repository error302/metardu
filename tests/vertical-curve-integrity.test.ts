import { verticalCurve } from '@/lib/computations/roadDesignEngine'

const sag = { g1: -2, g2: 4, vpiChainage: 1003, vpiRL: 100, curveLength: 200, interval: 20 }

test('off-grid sag fixture includes both exact ends and its exact low point', () => {
  const result = verticalCurve(sag)
  expect(result.bvcChainage).toBe(903)
  expect(result.evcChainage).toBe(1103)
  expect(result.bvcRL).toBe(102)
  expect(result.evcRL).toBe(104)
  expect(result.chainagePeak).toBeCloseTo(969.6666666666666, 10)
  expect(result.rlPeak).toBeCloseTo(101.33333333333333, 10)
  expect(result.rows[0].chainage).toBe(903)
  expect(result.rows.at(-1)?.chainage).toBe(1103)
  expect(result.rows.every(row => row.chainage >= 903 && row.chainage <= 1103)).toBe(true)
  const lows = result.rows.filter(row => row.isSag)
  expect(lows).toHaveLength(1)
  expect(lows[0].chainage).toBeCloseTo(969.6666666666666, 10)
  expect(result.rows.some(row => row.isPeak)).toBe(false)
})

test('crest fixture has one exact high point, not a nearby grid row', () => {
  const result = verticalCurve({ ...sag, g1: 4, g2: -2 })
  expect(result.chainagePeak).toBeCloseTo(1036.3333333333333, 10)
  expect(result.rlPeak).toBeCloseTo(98.66666666666667, 10)
  expect(result.rows.filter(row => row.isPeak)).toHaveLength(1)
  expect(result.rows.some(row => row.isSag)).toBe(false)
})

test('same-sign grades have no high or low point inside the curve', () => {
  const result = verticalCurve({ ...sag, g1: 2, g2: 4 })
  expect(result.chainagePeak).toBeNull()
  expect(result.rlPeak).toBeNull()
  expect(result.xPeak).toBeNull()
  expect(result.rows.some(row => row.isPeak || row.isSag)).toBe(false)
})

test('equal grades with declared length form a straight profile with no finite K or unique extremum', () => {
  const result = verticalCurve({ ...sag, g1: 2, g2: 2 })
  expect(result.K).toBeNull()
  expect(result.chainagePeak).toBeNull()
  expect(result.rows.every(row => Number.isFinite(row.rl))).toBe(true)
})

test('table offset y is relative to incoming tangent, not a duplicate RL', () => {
  const result = verticalCurve({ ...sag, vpiChainage: 1000 })
  const row = result.rows.find(point => point.chainage === 1000)
  expect(row?.rl).toBeCloseTo(101.5, 10)
  expect(row?.y).toBeCloseTo(1.5, 10)
})

test('K mode independently reproduces length-mode elevations', () => {
  const result = verticalCurve({ ...sag, curveLength: undefined, kValue: 100 / 3 })
  expect(result.L).toBe(200)
  expect(result.evcRL).toBe(104)
})

test.each([{ g1: NaN }, { g2: Infinity }, { vpiChainage: NaN }, { vpiRL: Infinity }])('refuses nonfinite setup %j', change => {
  expect(() => verticalCurve({ ...sag, ...change })).toThrow()
})

test('explicit invalid length cannot silently fall back to K mode', () => {
  expect(() => verticalCurve({ ...sag, curveLength: 0, kValue: 40 })).toThrow()
})

test.each([0, -1, Infinity, NaN, 1e-300, 0.000001])('unsafe interval %s is refused before allocation', interval => {
  expect(() => verticalCurve({ ...sag, interval })).toThrow(/interval|precision/i)
})

test.each([0, -1, Infinity, NaN])('invalid length %s is refused before station generation', curveLength => {
  expect(() => verticalCurve({ ...sag, curveLength })).toThrow(/length/i)
})

test('finite extreme grades cannot overflow the result', () => {
  expect(() => verticalCurve({ ...sag, g1: -Number.MAX_VALUE, g2: Number.MAX_VALUE })).toThrow(/range/i)
})

test('equal grades cannot derive a length from K', () => {
  expect(() => verticalCurve({ ...sag, g1: 0, g2: 0, curveLength: undefined, kValue: 40 })).toThrow(/equal grades/i)
})

test('length and K cannot both act as authorities', () => {
  expect(() => verticalCurve({ ...sag, kValue: 40 })).toThrow(/exactly one/i)
})

test('flat zero RL and negative chainages are preserved with fractional interval', () => {
  const result = verticalCurve({ ...sag, g1: 0, g2: 0, vpiChainage: -25, vpiRL: 0, curveLength: 50, interval: 12.5 })
  expect(result.curveType).toBe('straight')
  expect(result.rows.map(row => row.chainage)).toEqual([-50, -37.5, -25, -12.5, 0])
  expect(result.rows.every(row => row.rl === 0 && row.grade === 0 && !row.isPeak && !row.isSag)).toBe(true)
})

test('coarse interval does not flatten the profile or omit endpoints', () => {
  const result = verticalCurve({ ...sag, interval: 10000 })
  expect(result.rows).toHaveLength(3)
  expect(result.profileRows.length).toBeGreaterThanOrEqual(65)
  expect(result.profileRows[0].chainage).toBe(result.bvcChainage)
  expect(result.profileRows.at(-1)?.chainage).toBe(result.evcChainage)
  expect(result.profileRows.find(row => row.isSag)?.rl).toBeCloseTo(101.33333333333333, 10)
})

test('an extremum at an endpoint is not duplicated', () => {
  const result = verticalCurve({ ...sag, g1: -2, g2: 0 })
  expect(result.rows.filter(row => row.chainage === result.evcChainage)).toHaveLength(1)
  expect(result.rows.at(-1)?.isSag).toBe(true)
})

test('sub-resolution stationary point near EVC cannot remove exact EVC', () => {
  const result = verticalCurve({ ...sag, g1: -2, g2: 1e-14 })
  expect(result.rows.at(-1)?.chainage).toBe(result.evcChainage)
  expect(result.rows.at(-1)?.isEVC).toBe(true)
})

test('large chainage cannot silently collapse curve endpoints', () => {
  expect(() => verticalCurve({ ...sag, vpiChainage: 1e25 })).toThrow(/precision/i)
})
