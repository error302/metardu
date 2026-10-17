import { parseGGA, parseGLL, parseRMC } from '../nmea-parser'

function sentence(body: string): string {
  let checksum = 0
  for (const character of body) checksum ^= character.charCodeAt(0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`
}

describe('NMEA coordinate and height parsing', () => {
  it('keeps a valid zero coordinate and zero ellipsoidal height', () => {
    const reading = parseGGA(sentence('GPGGA,123519,0000.000,N,00000.000,E,1,08,0.9,0.0,M,0.0,M,,M,,0000'))

    expect(reading).toMatchObject({ latitude: 0, longitude: 0, altitude: 0, quality: 1 })
  })

  it('derives ellipsoidal height only when both GGA height components are supplied', () => {
    const complete = parseGGA(sentence('GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,M,,0000'))
    const missingGeoid = parseGGA(sentence('GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,,M,,M,,0000'))

    expect(complete?.altitude).toBeCloseTo(592.3, 6)
    expect(missingGeoid?.altitude).toBeNull()
  })

  it('does not invent elevation for RMC or GLL positions', () => {
    const rmc = parseRMC(sentence('GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W'))
    const gll = parseGLL(sentence('GPGLL,4807.038,N,01131.000,E,123519,A,A'))

    expect(rmc?.altitude).toBeNull()
    expect(gll?.altitude).toBeNull()
  })

  it('drops empty or out-of-range coordinates instead of converting them to zero', () => {
    const empty = parseGGA(sentence('GPGGA,123519,,N,,E,0,00,99.9,,M,,M,,M,,0000'))
    const invalidLatitude = parseGGA(sentence('GPGGA,123519,9100.000,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,M,,0000'))
    const invalidRmc = parseRMC(sentence('GPRMC,123519,A,,,E,022.4,084.4,230394,003.1,W'))

    expect(empty).toBeNull()
    expect(invalidLatitude).toBeNull()
    expect(invalidRmc).toBeNull()
  })
})
