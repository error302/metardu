import { parseNMEAPosition, solutionTypeForFixQuality } from '../gnssBleConnection'

describe('GNSS NMEA position provenance', () => {
  it('keeps GGA dilution separate from measured horizontal accuracy', () => {
    const position = parseNMEAPosition(
      '$GPGGA,123519,4807.038,N,01131.000,E,4,08,0.9,545.4,M,46.9,M,,',
    )

    expect(position).not.toBeNull()
    expect(position?.latitude).toBeCloseTo(48.1173, 6)
    expect(position?.longitude).toBeCloseTo(11.5166667, 6)
    expect(position?.fixQuality).toBe(4)
    expect(position?.fixLabel).toBe('RTK Fixed')
    expect(position?.satellites).toBe(8)
    expect(position?.hdop).toBeCloseTo(0.9)
    expect(position?.accuracy).toBeNull()
  })

  it.each([
    [1, 'single'],
    [2, 'dgps'],
    [4, 'fixed'],
    [5, 'float'],
  ] as const)('maps unambiguous GGA fix code %s to %s', (fixQuality, expected) => {
    expect(solutionTypeForFixQuality(fixQuality)).toBe(expected)
  })

  it.each([0, 3, 6, 7, 8, 9, Number.NaN])(
    'does not infer a survey solution class for GGA code %s',
    (fixQuality) => {
      expect(solutionTypeForFixQuality(fixQuality)).toBeUndefined()
    },
  )

  it('rejects a GGA sentence with a missing coordinate', () => {
    expect(parseNMEAPosition('$GNGGA,123519,,N,01131.000,E,4,08,0.9,545.4,M')).toBeNull()
  })

  it('preserves southern and western hemisphere signs', () => {
    const position = parseNMEAPosition(
      '$GNGGA,123519,3450.000,S,12345.000,W,1,05,1.2,10.0,M,46.9,M,,',
    )

    expect(position?.latitude).toBeCloseTo(-34.8333333, 6)
    expect(position?.longitude).toBeCloseTo(-123.75, 6)
  })

  it.each([
    ['$GPGGA,123519,4860.000,N,01131.000,E,4,08,0.9,545.4,M', 'minutes at 60'],
    ['$GPGGA,123519,9000.001,N,01131.000,E,4,08,0.9,545.4,M', 'latitude beyond 90 degrees'],
    ['$GPGGA,123519,4807.038,N,18100.000,E,4,08,0.9,545.4,M', 'longitude beyond 180 degrees'],
  ])('rejects invalid NMEA coordinates (%s)', (sentence) => {
    expect(parseNMEAPosition(sentence)).toBeNull()
  })
})
