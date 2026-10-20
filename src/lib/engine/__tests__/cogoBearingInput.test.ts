import { parseCogoBearing } from '../cogoBearingInput'
import { radiation } from '../cogo'

it('distinguishes packed field-book notation from decimal degrees explicitly', () => {
  expect(parseCogoBearing('47.2314', 'decimal')).toBe(47.2314)
  expect(parseCogoBearing('47.2314', 'packed-dms')).toBeCloseTo(47 + 23 / 60 + 14 / 3600, 12)
  expect(parseCogoBearing('47.3', 'packed-dms')).toBe(47.5)
})

it('rejects incomplete, non-finite, out-of-range and invalid minute/second values', () => {
  for (const value of ['', '47oops', 'Infinity', '-10', '361', '47.6060', '47.2360', '47.23145']) {
    expect(parseCogoBearing(value, 'packed-dms')).toBeNull()
  }
  expect(parseCogoBearing('360.0000', 'packed-dms')).toBe(360)
})

it('reproduces an independently calculated planar radiation benchmark', () => {
  const bearing = parseCogoBearing('108.36587680018746', 'decimal')
  if (bearing === null) throw new Error('Valid benchmark bearing rejected')
  const result = radiation({ easting: 1000, northing: 2000 }, bearing, 21.460014974436422)
  expect(result.point.easting).toBeCloseTo(1020.366924046, 8)
  expect(result.point.northing).toBeCloseTo(1993.238295511, 8)
})
