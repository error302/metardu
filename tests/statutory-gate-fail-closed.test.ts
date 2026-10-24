import { runStatutoryGate, type StatutoryGateInput } from '@/lib/validation/statutoryGate'

const base: StatutoryGateInput = { surveyType: 'cadastral', surveyor: { name: 'Synthetic', licenseNumber: 'ISK/LS/2020/123' } }

test('a rule exception blocks admission and exposes no internal exception text', () => {
  const input = { ...base }
  Object.defineProperty(input, 'parcels', { get() { throw new Error('private database detail') } })
  const result = runStatutoryGate(input)
  expect(result.passed).toBe(false)
  expect(result.violations.some(v => v.severity === 'block' && v.assessment === 'UNASSESSED')).toBe(true)
  expect(JSON.stringify(result)).not.toContain('private database detail')
})

test.each(['linearErrorM', 'totalDistanceM', 'precisionRatio', 'stationCount'] as const)('nonfinite %s cannot silently pass numeric comparisons', field => {
  const result = runStatutoryGate({ ...base, traverse: { stationCount: 4, linearErrorM: 0, totalDistanceM: 400, precisionRatio: 100000, [field]: NaN } })
  expect(result.passed).toBe(false)
})
