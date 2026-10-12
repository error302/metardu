import { parseCadGridCoordinate } from '@/lib/cad/cadDocumentValidation'

test.each([
  ['0', 0], ['-0', -0], ['+1.2345e2', 123.45], [' -.125 ', -0.125], ['1e9', 1_000_000_000], ['-1e9', -1_000_000_000],
])('accepts a complete finite decimal coordinate %s', (input, expected) => {
  expect(parseCadGridCoordinate(input as string)).toBe(expected)
})

test.each(['', ' ', '12..3', '12 metres', '0x10', 'Infinity', '1e309', '1e9.1', '1000000001', '-1000000001', '1,000', '2e', '--3'])('rejects incomplete or unsupported coordinate text %s', input => {
  expect(parseCadGridCoordinate(input)).toBeUndefined()
})
