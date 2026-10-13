import { createStreamedPoint } from '../streamedPoint'
import type { ParsedInstrumentData } from '../protocolParsers'

describe('createStreamedPoint coordinate evidence', () => {
  it('preserves valid zero latitude without manufacturing projected coordinates', () => {
    const packet: ParsedInstrumentData = {
      type: 'nmea',
      data: {
        fixQuality: 4,
        satellites: 18,
        hdop: 0.8,
        latitude: 0,
        longitude: 37,
        altitude: 0,
        geoidSep: 0,
        timestamp: new Date('2026-10-13T08:00:00.000Z'),
        raw: '$GNGGA',
      },
    }

    const point = createStreamedPoint(packet)

    expect(point).toMatchObject({
      source: 'nmea',
      latitude: 0,
      longitude: 37,
      elevation: 0,
    })
    expect(point?.easting).toBeUndefined()
    expect(point?.northing).toBeUndefined()
  })

  it('does not create a GNSS point without a valid fix', () => {
    const packet: ParsedInstrumentData = {
      type: 'nmea',
      data: {
        fixQuality: 0,
        satellites: 0,
        hdop: 99,
        latitude: 0,
        longitude: 0,
        altitude: 0,
        geoidSep: 0,
        timestamp: new Date('2026-10-13T08:00:00.000Z'),
        raw: '$GNGGA',
      },
    }

    expect(createStreamedPoint(packet)).toBeNull()
  })

  it('keeps total-station coordinates while leaving geographic coordinates unknown', () => {
    const packet: ParsedInstrumentData = {
      type: 'gsi',
      data: { pointNumber: 7, easting: 500000, northing: 9900000, height: 0, words: [] },
    }

    const point = createStreamedPoint(packet)

    expect(point).toMatchObject({
      source: 'gsi',
      easting: 500000,
      northing: 9900000,
      elevation: 0,
    })
    expect(point?.latitude).toBeUndefined()
    expect(point?.longitude).toBeUndefined()
  })
})
