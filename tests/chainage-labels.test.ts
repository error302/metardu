import { formatRoadChainage } from '@/lib/engineering/roadFieldPlan'
import { formatChainage as crossSectionChainage } from '@/lib/engineering/crossSectionGeometry'
import { formatChainage as corridorChainage } from '@/lib/survey/corridorEngine'
import { formatChainage as planChainage } from '@/lib/reports/surveyPlan/geometry'
import { formatChainage as mapChainage } from '@/lib/engine/chainageCalculator'
import { formatChainageLabel } from '@/lib/formatChainage'

test.each([
  ['road capture', formatRoadChainage, 999.9996, '1+000.000'],
  ['cross section', crossSectionChainage, 999.9996, '1+000.000'],
  ['corridor', corridorChainage, 999.6, '1+000'],
  ['printed plan', planChainage, 999.6, '1+000'],
  ['map station', mapChainage, 999.6, 'KM 1+000'],
] as const)('%s carries rounded metres into the kilometre', (_name, format, value, expected) => {
  expect(format(value)).toBe(expected)
})

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE])('unrepresentable stationing has no invented numeric label (%s)', value => {
  expect(formatChainageLabel(value)).toBe('—')
})

test('formats requested precision and signed stationing consistently', () => {
  expect(formatChainageLabel(-999.9996)).toBe('-1+000.000')
  expect(formatChainageLabel(1234.5, 2, 'CH ')).toBe('CH 1+234.50')
})

test('road capture preserves signed stationing without a negative rounded zero', () => {
  expect(formatRoadChainage(-1234.5)).toBe('-1+234.500')
  expect(formatRoadChainage(-0.0001)).toBe('0+000.000')
})
