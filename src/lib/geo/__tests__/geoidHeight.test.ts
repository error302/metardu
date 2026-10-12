import {
  batchConvertHeights,
  convertEllipsoidalToOrthometric,
  interpolateGeoidUndulation,
} from '@/lib/geo/geoidHeight'

describe('regional geoid screening conversion', () => {
  test('bilinear interpolation and H = h - N are mechanically consistent', () => {
    const interpolated = interpolateGeoidUndulation(12.5, 27.5)
    expect(interpolated?.undulation).toBeCloseTo(-3.75, 10)

    const result = convertEllipsoidalToOrthometric({
      latitude: 12.5,
      longitude: 27.5,
      ellipsoidalHeight: 1000,
    })
    expect(result.status).toBe('indicative')
    if (result.status === 'indicative') {
      expect(result.orthometricHeight).toBeCloseTo(1003.75, 10)
      expect(result.orthometricHeight).toBeCloseTo(result.ellipsoidalHeight - result.geoidUndulation, 10)
      expect(result.accuracy).toBeNull()
      expect(result.reason).toMatch(/accuracy and local vertical-datum compatibility are unverified/i)
    }
  })

  test('accepts exact regional grid boundaries and rejects points beyond them', () => {
    expect(interpolateGeoidUndulation(15, 25)).not.toBeNull()
    expect(interpolateGeoidUndulation(-15, 55)).not.toBeNull()
    expect(interpolateGeoidUndulation(15.000001, 25)).toBeNull()
    expect(interpolateGeoidUndulation(-15, 55.000001)).toBeNull()

    const outside = convertEllipsoidalToOrthometric({
      latitude: -1.3,
      longitude: 24.9,
      ellipsoidalHeight: 123.456,
    })
    expect(outside.status).toBe('unavailable')
    expect(outside.geoidUndulation).toBeNull()
    expect(outside.orthometricHeight).toBeNull()
    expect(outside.reason).toMatch(/no extrapolation/i)
  })

  test.each([
    { latitude: Number.NaN, longitude: 36, ellipsoidalHeight: 100 },
    { latitude: -1, longitude: Number.POSITIVE_INFINITY, ellipsoidalHeight: 100 },
    { latitude: -1, longitude: 36, ellipsoidalHeight: Number.NaN },
    { latitude: 90.1, longitude: 36, ellipsoidalHeight: 100 },
    { latitude: -1, longitude: 181, ellipsoidalHeight: 100 },
  ])('fails closed for invalid input $latitude, $longitude, $ellipsoidalHeight', input => {
    const result = convertEllipsoidalToOrthometric(input)
    expect(result.status).toBe('unavailable')
    expect(result.orthometricHeight).toBeNull()
    expect(result.geoidUndulation).toBeNull()
  })

  test('batch results retain invalid rows as unavailable instead of inventing values', () => {
    const results = batchConvertHeights([
      { id: 'inside', latitude: -1.3, longitude: 36.8, ellipsoidalHeight: 1800 },
      { id: 'partial', latitude: Number.NaN, longitude: 36.8, ellipsoidalHeight: 1800 },
      { id: 'outside', latitude: -1.3, longitude: 56, ellipsoidalHeight: 1800 },
    ])

    expect(results.map(row => row.result.status)).toEqual(['indicative', 'unavailable', 'unavailable'])
    expect(results[1].result.orthometricHeight).toBeNull()
    expect(results[2].result.orthometricHeight).toBeNull()
  })
})
