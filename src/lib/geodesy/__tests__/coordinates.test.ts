import { geographicToUTM, utmToGeographic } from '../coordinates'

describe('geographicToUTM', () => {
  it('Nairobi is in UTM Zone 37S', () => {
    const r = geographicToUTM(-1.2921, 36.8219)
    expect(r.zone).toBe(37)
    expect(r.hemisphere).toBe('S')
    expect(r.easting).toBeGreaterThan(200000)
    expect(r.easting).toBeLessThan(350000)
    expect(r.northing).toBeGreaterThan(9800000)
  })

  it('London is in UTM Zone 30N', () => {
    const r = geographicToUTM(51.5074, -0.1278)
    expect(r.zone).toBe(30)
    expect(r.hemisphere).toBe('N')
    expect(r.northing).toBeGreaterThan(5000000)
  })

  it('Lagos Nigeria is in Zone 31N', () => {
    const r = geographicToUTM(6.5244, 3.3792)
    expect(r.zone).toBe(31)
    expect(r.hemisphere).toBe('N')
  })

  it('Cape Town South Africa is in Zone 34S', () => {
    const r = geographicToUTM(-33.9249, 18.4241)
    expect(r.zone).toBe(34)
    expect(r.hemisphere).toBe('S')
  })

  it('returns finite easting and northing', () => {
    const r = geographicToUTM(0, 30)
    expect(Number.isFinite(r.easting)).toBe(true)
    expect(Number.isFinite(r.northing)).toBe(true)
  })
})

describe('utmToGeographic round-trip', () => {
  const CITIES = [
    { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
    { name: 'Kampala', lat: 0.3163, lon: 32.5822 },
    { name: 'Dar es Salaam', lat: -6.7924, lon: 39.2083 },
    { name: 'Accra', lat: 5.6037, lon: -0.1870 },
  ]

  CITIES.forEach(({ name, lat, lon }) => {
    it(`round-trips ${name}`, () => {
      const utm = geographicToUTM(lat, lon)
      const back = utmToGeographic(utm.easting, utm.northing, utm.zone, utm.hemisphere)
      expect(back.lat).toBeCloseTo(lat, 4)
      expect(back.lon).toBeCloseTo(lon, 4)
    })
  })
})

describe('MGRS conversions', () => {
  const { latLonToMGRS, mgrsToLatLon } = require('../coordinates')

  it('converts Nairobi coordinates to MGRS and round-trips back', () => {
    const lat = -1.2921
    const lon = 36.8219
    const mgrs = latLonToMGRS(lat, lon, 5)
    expect(typeof mgrs).toBe('string')
    expect(mgrs.startsWith('37M')).toBe(true)

    const pt = mgrsToLatLon(mgrs)
    expect(pt).not.toBeNull()
    expect(pt!.lat).toBeCloseTo(lat, 3)
    expect(pt!.lon).toBeCloseTo(lon, 3)
  })

  it('handles spaces in MGRS inputs gracefully', () => {
    const originalMgrs = latLonToMGRS(-1.2921, 36.8219, 5)
    // insert spaces into format: e.g. "37M CV 12345 67890"
    const withSpaces = `${originalMgrs.slice(0, 3)} ${originalMgrs.slice(3, 5)} ${originalMgrs.slice(5, 10)} ${originalMgrs.slice(10)}`
    const pt = mgrsToLatLon(withSpaces)
    expect(pt).not.toBeNull()
    expect(pt!.lat).toBeCloseTo(-1.2921, 3)
    expect(pt!.lon).toBeCloseTo(36.8219, 3)
  })

  it('returns null on invalid MGRS string', () => {
    expect(mgrsToLatLon('NOT_A_VALID_MGRS')).toBeNull()
  })
})

