import { evaluateVerticality, formatTiltRatio } from '../verticality'

const criteria = { name: 'Synthetic issued criteria', reference: 'Synthetic drawing C1', version: 'R1', maxOffsetM: 0.025, minTiltRatio: 600 }
const reading = { baseE: 500000, baseN: 9800000, topE: 500000.004, topN: 9800000, heightM: 3, horizontalUncertaintyM: 0.001, heightUncertaintyM: 0.001 }

test('absent criteria retain measured geometry without inferred PASS', () => {
  const result = evaluateVerticality(reading)
  expect(result.result).toBe('INFO')
  expect(result.offsetM).toBeCloseTo(0.004, 7)
  expect(result.message).toMatch(/criteria/i)
})
test.each([null, undefined])('absent height remains unknown rather than infinite: %s', heightM => {
  const result = evaluateVerticality({ ...reading, heightM }, criteria)
  expect(result.heightM).toBeNull()
  expect(result.tiltRatio).toBeNull()
  expect(result.result).toBe('INFO')
})
test('explicit geometry and criteria produce a numerical comparison', () => {
  const result = evaluateVerticality(reading, criteria)
  expect(result.result).toBe('PASS')
  expect(result.message).toMatch(/numerical/i)
  const failed = evaluateVerticality({ ...reading, topE: reading.baseE + 0.02 }, criteria)
  expect(failed.result).toBe('FAIL')
  expect(failed.message).toMatch(/ratio/i)
  expect(failed.message).not.toMatch(/offset exceeds/i)
})
test('zero displacement has no bearing, with a defined infinite ratio only for known height', () => {
  const result = evaluateVerticality({ ...reading, topE: reading.baseE }, criteria)
  expect(result.bearingDeg).toBeNull()
  expect(result.tiltRatio).toBe(Infinity)
  expect(result.result).toBe('PASS')
  expect(formatTiltRatio(null)).toBe('Not assessed')
})
test.each([{ horizontalUncertaintyM: null }, { heightUncertaintyM: null }, { horizontalUncertaintyM: 0 }, { heightUncertaintyM: 0 }, { horizontalUncertaintyM: 0.006 }])('incomplete or coarse uncertainty is INFO: %j', patch => {
  expect(evaluateVerticality({ ...reading, ...patch }, criteria).result).toBe('INFO')
})
test.each([{ heightM: 0 }, { heightM: -3 }, { heightM: Infinity }, { topE: NaN }, { horizontalUncertaintyM: -1 }, { heightUncertaintyM: Infinity }])('invalid measurement cannot produce a verdict: %j', patch => {
  expect(() => evaluateVerticality({ ...reading, ...patch }, criteria)).toThrow(RangeError)
})
test('criteria require positive finite limits and source identity', () => {
  for (const patch of [{ maxOffsetM: 0 }, { minTiltRatio: Infinity }, { reference: '' }, { version: '' }]) {
    expect(() => evaluateVerticality(reading, { ...criteria, ...patch })).toThrow(RangeError)
  }
})
