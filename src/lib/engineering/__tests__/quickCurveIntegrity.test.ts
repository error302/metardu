import { horizontalCurve } from '../compute'

test('legacy curve API adapter includes exact endpoints and successive peg chords', () => {
  const result = horizontalCurve({ R: 100, deltaDeg: 60, chainageStart: 500 })
  expect(result.chainage_TC).toBeCloseTo(442.264973081, 9)
  expect(result.chainage_CT).toBeCloseTo(546.984728201, 9)
  expect(result.settingOutTable[0].chainage).toBe(result.chainage_TC)
  expect(result.settingOutTable[0].chordIncrement).toBe(0)
  const peg = result.settingOutTable.find(row => row.chainage === 480)
  expect(peg?.chordIncrement).toBeCloseTo(19.966683329, 9)
  expect(result.settingOutTable.at(-1)?.deflectionFromTC).toBeCloseTo(30, 10)
})

test('decimal degrees retain sub-degree geometry and signed PI stationing', () => {
  const result = horizontalCurve({ R: 100, deltaDeg: 30.5, chainageStart: -100 })
  expect(result.L).toBeCloseTo(53.2325421858, 9)
  expect(result.settingOutTable.at(-1)?.deflectionFromTC).toBeCloseTo(15.25, 10)
})

// Run these only after the legacy unbounded loop has been replaced by the
// shared validator. The original 180-degree/Infinity red attempt was interrupted.
test.each([
  { R: 100, deltaDeg: 180, chainageStart: 0 },
  { R: 100, deltaDeg: 60, chainageStart: Infinity },
  { R: Infinity, deltaDeg: 60, chainageStart: 500 },
  { R: 1e12, deltaDeg: 60, chainageStart: 500 },
])('legacy curve refuses singular/nonfinite or unbounded tables %j', input => {
  expect(() => horizontalCurve(input)).toThrow()
})
