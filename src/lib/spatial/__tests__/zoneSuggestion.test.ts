/**
 * Slice 1 checks (CRS / UTM zone bug) — the Mombasa wrong-zone case.
 *
 * Bug under test: a project at Lat -4.133318, Lon 39.620466 (Kenyan coast)
 * declared Arc 1960 / UTM zone 36S and produced Easting ≈ 1,236,340 m. That
 * longitude lies in zone 37 (36°E–42°E); the coordinate must resolve to
 * EPSG:21037 with an easting in the 500,000s, and a coordinate forced into
 * 21036 must be flagged with a one-click suggestion of 21037.
 */
import {
  suggestUtmCrs,
  suggestDatumUtmCrs,
  transformPoint,
  validateCoordinateRange,
  zoneLongitudeBounds,
} from '../projectCrs'

const MOMBASA = { lat: -4.133318, lon: 39.620466 }

describe('Slice 1: UTM zone correctness', () => {
  it('resolves the Mombasa point to zone 37S in pure zone mathematics', () => {
    expect(suggestUtmCrs(MOMBASA.lat, MOMBASA.lon)).toMatchObject({ zone: 37, hemisphere: 'S', code: 'EPSG:32737' })
  })

  it('suggests the same-datum CRS for the Mombasa point: Arc 1960 → EPSG:21037', () => {
    expect(suggestDatumUtmCrs(MOMBASA.lat, MOMBASA.lon, 'Arc 1960')).toMatchObject({
      code: 'EPSG:21037',
      name: 'Arc 1960 / UTM zone 37S',
      zone: 37,
      hemisphere: 'S',
    })
  })

  it('projects the Mombasa point into EPSG:21037 with an easting in the 500,000s', () => {
    const [easting, northing] = transformPoint(MOMBASA.lon, MOMBASA.lat, 'EPSG:4326', 'EPSG:21037')
    expect(easting).toBeGreaterThan(500_000)
    expect(easting).toBeLessThan(600_000)
    expect(northing).toBeGreaterThan(9_000_000)
    expect(northing).toBeLessThan(10_000_000)
  })

  it('flags the coast coordinate forced into zone 36S and offers a one-click switch to 21037', () => {
    const [wrongE, wrongN] = transformPoint(MOMBASA.lon, MOMBASA.lat, 'EPSG:4326', 'EPSG:21036')
    // The reported blunder: an easting around 1.2 million metres.
    expect(wrongE).toBeGreaterThan(1_200_000)

    const result = validateCoordinateRange(wrongE, wrongN, 'EPSG:21036')
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/outside the UTM easting domain/)
    expect(result.warnings.join(' ')).toMatch(/outside zone 36/)
    expect(result.suggestedCrs).toBe('EPSG:21037')
    expect(result.suggestedCrsName).toBe('Arc 1960 / UTM zone 37S')
  })

  it('warns — but stays valid — for an in-domain easting whose longitude has crossed the zone edge', () => {
    // 0.15° east of the 36°E boundary projects into zone 36 near the strip
    // edge (easting > 840,000): the classic straddle case.
    const [e, n] = transformPoint(36.15, -4.1, 'EPSG:4326', 'EPSG:21036')
    const result = validateCoordinateRange(e, n, 'EPSG:21036')
    expect(result.errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.suggestedCrs).toBe('EPSG:21037')
  })

  it('keeps a correctly-zoned coordinate silent about zone switches', () => {
    const [easting, northing] = transformPoint(MOMBASA.lon, MOMBASA.lat, 'EPSG:4326', 'EPSG:21037')
    const result = validateCoordinateRange(easting, northing, 'EPSG:21037')
    expect(result.valid).toBe(true)
    expect(result.suggestedCrs).toBeUndefined()
    expect(result.warnings).toEqual([])
  })

  it('keeps zone bounds consistent with the standard 6-degree layout', () => {
    expect(zoneLongitudeBounds(36)).toEqual({ west: 30, east: 36 })
    expect(zoneLongitudeBounds(37)).toEqual({ west: 36, east: 42 })
  })

  it('round-trips geographic → projected → geographic within survey tolerance in three zones', () => {
    // 1e-8 degrees ≈ 1 mm — loose enough for double-precision noise at
    // 10-million-metre northings, far tighter than any survey tolerance.
    const toleranceDegrees = 1e-8
    const cases: Array<{ crs: string; lon: number; lat: number }> = [
      { crs: 'EPSG:21037', lon: 39.620466, lat: -4.133318 }, // Mombasa, Arc 1960
      { crs: 'EPSG:21036', lon: 34.2, lat: -0.5 }, // western Kenya, Arc 1960
      { crs: 'EPSG:32736', lon: 32.6, lat: -1.3 }, // WGS 84 zone 36S
    ]
    for (const { crs, lon, lat } of cases) {
      const [e, n] = transformPoint(lon, lat, 'EPSG:4326', crs)
      const [backLon, backLat] = transformPoint(e, n, crs, 'EPSG:4326')
      expect(Math.abs(backLon - lon)).toBeLessThan(toleranceDegrees)
      expect(Math.abs(backLat - lat)).toBeLessThan(toleranceDegrees)
    }
  })
})
