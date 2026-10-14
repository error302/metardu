import { fieldPointEntry, parseFieldPointCsv } from '@/lib/field/pointEntry'

test('quoted names, negative local-grid coordinates and blank heights retain raw values', () => {
  expect(parseFieldPointCsv('\uFEFF"CP, west",0,-123.456789,\r\nCP2,-10.5,0,-2.5')).toEqual([
    { name: 'CP, west', easting: 0, northing: -123.456789, elevation: null, is_control: false },
    { name: 'CP2', easting: -10.5, northing: 0, elevation: -2.5, is_control: false },
  ])
})
test.each(['10m', 'NaN', 'Infinity', '0x10', '1e999', ''])('required coordinate %s is rejected', value => {
  expect(() => fieldPointEntry('CP', value, '0', '')).toThrow('finite decimal')
})
test.each(['P,1,2,bad', ',1,2', 'P,1,2\nP,3,4', 'P,1,2,3,extra', '"P,1,2'])('malformed batches cannot yield a partial save: %s', csv => {
  expect(() => parseFieldPointCsv(csv)).toThrow()
})
test('row limit is explicit and never truncates the imported survey', () => {
  expect(() => parseFieldPointCsv(Array.from({ length: 1001 }, (_, index) => `P${index},0,0`).join('\n'))).toThrow('1000')
})
