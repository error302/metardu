import { normalizeSchemeCrsCode, requireMatchingSchemeCrs } from '../schemeCrs'

const PROJECT_CRS = 'EPSG:21037'
const OTHER_PROJECT_CRS = 'EPSG:21036'
const PROJECT_CRS_URN = 'urn:ogc:def:crs:EPSG::21037'

describe('scheme CRS provenance', () => {
  it('accepts the canonical project EPSG code and the legacy GeoJSON EPSG URN', () => {
    expect(normalizeSchemeCrsCode(PROJECT_CRS)).toBe(PROJECT_CRS)
    expect(normalizeSchemeCrsCode(PROJECT_CRS_URN)).toBe(PROJECT_CRS)
    expect(requireMatchingSchemeCrs(PROJECT_CRS, PROJECT_CRS)).toBe(PROJECT_CRS)
  })

  it('preserves explicit non-EPSG local CRS identifiers for comparison', () => {
    expect(requireMatchingSchemeCrs('LOCAL:SITE-1', 'local:site-1')).toBe('LOCAL:SITE-1')
  })

  it('rejects missing or mismatched coordinate provenance', () => {
    expect(() => requireMatchingSchemeCrs('', PROJECT_CRS)).toThrow(/does not match/i)
    expect(() => requireMatchingSchemeCrs(OTHER_PROJECT_CRS, PROJECT_CRS)).toThrow(/EPSG:21037/)
  })
})
