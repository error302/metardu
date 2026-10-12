import { generateLandXML, type LandXMLPoint } from '@/lib/export/generateLandXML'
import { generateGeoJSON } from '@/lib/export/generateGeoJSON'
import { generateProjectMetadata } from '@/lib/geo/isoMetadata'
import { generateCadastralPlanDXF } from '@/lib/export/cadastralPlanDXF'
import { utmToWgs84 } from '@/lib/spatial/projectReferenceSystem'
import { utmToGeographic } from '@/lib/geodesy/coordinates'
import { transformToWGS84, DATUM_REGISTRY } from '@/lib/geodesy/datums'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'
import type { SurveyPoint } from '@/types/surveyPoint'

interface ParsedPointGeoJSON {
  metadata: string
  features: Array<{
    geometry: { coordinates: number[] }
    properties: { utm_zone: string }
  }>
}

const WGS_UTM_37S = 'EPSG:32737'
const WGS_UTM_36S = 'EPSG:32736'
const ARC_UTM_37S = 'EPSG:21037'

const POINT: LandXMLPoint = { name: 'A1', easting: 500000, northing: 9860000, elevation: 1671, is_control: true }

const GEOJSON_POINT: SurveyPoint = {
  name: 'A1',
  easting: 500000,
  northing: 9860000,
  elevation: 1671,
  is_control: true,
}

function baseProject(overrides: Partial<Parameters<typeof generateProjectMetadata>[0]> = {}) {
  return {
    id: 'proj-1',
    name: 'Test Survey',
    survey_type: 'cadastral',
    user_name: 'J. Otieno',
    user_email: 'surveyor@example.com',
    ...overrides,
  }
}

const PLAN_DATA: SurveyPlanData = {
  project: {
    name: 'Test Survey',
    location: 'Nairobi',
    utm_zone: 37,
    hemisphere: 'S',
    datum: 'ARC1960',
  },
  parcel: {
    boundaryPoints: [
      { name: 'B1', easting: 500000, northing: 9860000 },
      { name: 'B2', easting: 500050, northing: 9860000 },
      { name: 'B3', easting: 500050, northing: 9860050 },
      { name: 'B4', easting: 500000, northing: 9860050 },
    ],
    area_sqm: 2500,
    perimeter_m: 200,
  },
  controlPoints: [],
}

describe('LandXML project metadata (P0: fix LandXML project metadata)', () => {
  it('declares the project datum instead of a fixed WGS84 datum', () => {
    const xml = generateLandXML(
      { name: 'P', utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960' },
      [POINT],
    )
    expect(xml).toContain('<Datum name="Arc 1960">')
    expect(xml).toContain('name="Clarke 1880 (RGS)" a="6378249.145" invF="293.465"')
    expect(xml).not.toContain('<Datum name="WGS84">')
    // UTM zone 37: central meridian 39°E, southern false northing 10,000,000
    expect(xml).toContain('originLong="39"')
    expect(xml).toContain('falseNorthing="10000000"')
    expect(xml).toContain('zone="37"')
    expect(xml).toContain('epsgCode="21037"')
  })

  it('declares WGS84 only when the project actually says WGS84', () => {
    const xml = generateLandXML(
      { name: 'P', utm_zone: 36, hemisphere: 'S', datum: 'WGS84' },
      [POINT],
    )
    expect(xml).toContain('<Datum name="WGS84">')
    expect(xml).toContain('a="6378137"')
    expect(xml).toContain('zone="36"')
    expect(xml).toContain('originLong="33"')
    expect(xml).toContain('epsgCode="32736"')
  })

  it('refuses export when the project has not declared a CRS', () => {
    expect(() => generateLandXML({ name: 'P' }, [POINT])).toThrow(/declared, supported project CRS/)
  })

  it('refuses export when zone is declared but datum is not', () => {
    expect(() => generateLandXML({ name: 'P', utm_zone: 37, hemisphere: 'S' }, [POINT]))
      .toThrow(/declared, supported project CRS/)
  })

  it('refuses a declared but unsupported datum and invalid zone', () => {
    expect(() => generateLandXML({ name: 'P', utm_zone: 37, hemisphere: 'S', datum: 'Unknown Datum' }, [POINT]))
      .toThrow(/declared, supported project CRS/)
    expect(() => generateLandXML({ name: 'P', utm_zone: 0, hemisphere: 'S', datum: 'WGS84' }, [POINT]))
      .toThrow(/declared, supported project CRS/)
  })
})

describe('GeoJSON export CRS (no silent zone default)', () => {
  it('preserves unknown height as null and emits only measured horizontal coordinates', () => {
    const parsed = JSON.parse(generateGeoJSON([{ ...GEOJSON_POINT, elevation: null }], 'P', 37, 'S', 'WGS84')) as ParsedPointGeoJSON
    expect(parsed.features[0].geometry.coordinates).toHaveLength(2)
    expect(parsed.features[0].properties).toMatchObject({ elevation_m: null })
  })

  it('throws instead of assuming a UTM zone', () => {
    expect(() =>
      generateGeoJSON([GEOJSON_POINT], 'P', undefined as unknown as number, 'S', 'Arc 1960'),
    ).toThrow(/declared project UTM zone/)
  })

  it('throws on an invalid hemisphere', () => {
    expect(() =>
      generateGeoJSON([GEOJSON_POINT], 'P', 37, 'X' as unknown as 'S', 'Arc 1960'),
    ).toThrow(/hemisphere/)
  })

  it('throws instead of converting with an undeclared datum', () => {
    expect(() =>
      generateGeoJSON([GEOJSON_POINT], 'P', 37, 'S', undefined as unknown as string),
    ).toThrow(/declared project datum/)
    expect(() =>
      generateGeoJSON([GEOJSON_POINT], 'P', 37, 'S', '   '),
    ).toThrow(/declared project datum/)
  })

  it('labels declared WGS 84 metadata with the right EPSG code', () => {
    const parsed = JSON.parse(generateGeoJSON([GEOJSON_POINT], 'P', 37, 'S', 'WGS84')) as ParsedPointGeoJSON
    expect(parsed.metadata).toContain(WGS_UTM_37S)
    expect(parsed.metadata).not.toContain('EPSG:EPSG:')
    expect(parsed.features[0].properties.utm_zone).toBe('37S')
  })
})

describe('GeoJSON WGS84 conversion applies the datum shift (P0)', () => {
  const E = 500000
  const N = 9860000

  function approxMetres(
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
  ): number {
    const dLat = (a.lat - b.lat) * 111320
    const dLon = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
    return Math.hypot(dLat, dLon)
  }

  it('shifts Arc 1960 coordinates off the raw ellipsoid inverse (~319 m in Kenya)', () => {
    const shifted = utmToWgs84(E, N, 37, 'S', 'Arc 1960')
    const naive = utmToGeographic(E, N, 37, 'S')
    const delta = approxMetres(shifted, naive)
    expect(delta).toBeGreaterThan(100)
    expect(delta).toBeLessThan(500)
    // Emitted GeoJSON geometry must be the shifted value
    const parsed = JSON.parse(generateGeoJSON([GEOJSON_POINT], 'P', 37, 'S', 'Arc 1960')) as ParsedPointGeoJSON
    expect(parsed.features[0].geometry.coordinates[0]).toBeCloseTo(shifted.lon, 7)
    expect(parsed.features[0].geometry.coordinates[1]).toBeCloseTo(shifted.lat, 7)
  })

  it('agrees with the audited hand-rolled Helmert (datums.ts) to millimetres', () => {
    const authority = utmToWgs84(E, N, 37, 'S', 'Arc 1960')
    const wgs = transformToWGS84(E, N, 37, 'S', DATUM_REGISTRY['ARC1960'])
    const helmert = utmToGeographic(wgs.easting, wgs.northing, 37, 'S')
    expect(approxMetres(authority, helmert)).toBeLessThan(0.01)
  })

  it('leaves WGS 84 coordinates unchanged (no false shift)', () => {
    const shifted = utmToWgs84(E, N, 37, 'S', 'WGS84')
    const naive = utmToGeographic(E, N, 37, 'S')
    expect(approxMetres(shifted, naive)).toBeLessThan(0.01)
  })
})

describe('ISO project metadata CRS', () => {
  it('uses the declared zone and datum, not a Zone 37 / Arc 1960 default', () => {
    const xml = generateProjectMetadata(
      baseProject({ utm_zone: 36, hemisphere: 'S', datum: 'WGS84' }),
    )
    expect(xml).toContain(WGS_UTM_36S)
    expect(xml).toContain('WGS 84')
    expect(xml).not.toContain(ARC_UTM_37S)
    expect(xml).not.toContain('Clarke 1880')
  })

  it('never emits a doubled EPSG prefix', () => {
    const xml = generateProjectMetadata(
      baseProject({ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960' }),
    )
    expect(xml).toContain(ARC_UTM_37S)
    expect(xml).not.toContain('EPSG:EPSG:')
    expect(xml).toContain('Clarke 1880 (RGS)')
  })

  it('reports UNVERIFIED when the CRS is not declared at all', () => {
    const xml = generateProjectMetadata(baseProject())
    expect(xml).toContain('UNVERIFIED')
    expect(xml).not.toContain(ARC_UTM_37S)
    expect(xml).not.toContain('EPSG:327')
  })

  it('only claims the EPSG:1122 Arc 1960 transformation for Arc 1960 projects', () => {
    const arc = generateProjectMetadata(
      baseProject({ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960' }),
    )
    expect(arc).toContain('EPSG:1122')
    const wgs = generateProjectMetadata(
      baseProject({ utm_zone: 37, hemisphere: 'S', datum: 'WGS84' }),
    )
    expect(wgs).not.toContain('EPSG:1122')
  })
})

describe('Cadastral plan DXF title block CRS', () => {
  it('states the declared coordinate system and datum', () => {
    const dxf = generateCadastralPlanDXF(PLAN_DATA)
    expect(dxf).toContain('Coord. System: Arc 1960 / UTM Zone 37S')
    expect(dxf).toContain('Datum: ARC1960 · Clarke 1880 (RGS)')
  })

  it('does not fabricate a datum when none is declared', () => {
    const dxf = generateCadastralPlanDXF({
      ...PLAN_DATA,
      project: { ...PLAN_DATA.project, datum: undefined },
    })
    expect(dxf).toContain('Coord. System: UNVERIFIED')
    expect(dxf).toContain('Datum: UNVERIFIED')
    expect(dxf).not.toContain('Clarke 1880')
  })

  it('labels a WGS 84 project as WGS 84, not Arc 1960', () => {
    const dxf = generateCadastralPlanDXF({
      ...PLAN_DATA,
      project: { ...PLAN_DATA.project, datum: 'WGS84' },
    })
    expect(dxf).toContain('Coord. System: WGS 84 / UTM Zone 37S')
    expect(dxf).not.toContain('Arc 1960 / UTM Zone')
  })
})
