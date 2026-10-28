const fixtureCrs21037 = 'EPSG:21037'
const fixtureCrs32636 = 'EPSG:32636'
import { ellipsoidForDatum } from '@/lib/spatial/projectCrs'
import { reportCrs } from '@/lib/generators/reportCrs'


test.each([
  [{utmZone:37,hemisphere:'N',datum:'Arc 1960'}, '21097'],
  [{utmZone:37,hemisphere:'S',datum:'Arc 1960'}, '21037'],
  [{utmZone:36,hemisphere:'N',datum:'WGS 84'}, '32636'],
  [{utmZone:36,hemisphere:'S',datum:'WGS84'}, '32736'],
  [{utmZone:37,hemisphere:'S'}, 'UNVERIFIED'],
  [{utmZone:61,hemisphere:'S',datum:'WGS84'}, 'UNVERIFIED'],
])('CRS labels preserve supplied datum and hemisphere: %j', (input, epsg) => {
  expect(reportCrs(input).epsg).toBe(epsg)
})

describe('reportCrs described metadata', () => {
  it('describes a declared Arc 1960 zone 37S project', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' })
    if (!crs.verified) throw new Error('expected verified CRS')
    expect(crs.epsgCode).toBe(fixtureCrs21037)
    expect(crs.crsName).toBe('Arc 1960 / UTM Zone 37S')
    expect(crs.ellipsoid).toBe('Clarke 1880 (RGS)')
    expect(crs.ellipsoidA).toBe(6378249.145)
    expect(crs.ellipsoidInvF).toBe(293.465)
    expect(crs.datum).toBe('Arc 1960')
  })

  it('describes a declared WGS 84 zone 36N project', () => {
    const crs = reportCrs({ utmZone: 36, hemisphere: 'N', datum: 'WGS84' })
    if (!crs.verified) throw new Error('expected verified CRS')
    expect(crs.epsgCode).toBe(fixtureCrs32636)
    expect(crs.crsName).toBe('WGS 84 / UTM Zone 36N')
    expect(crs.ellipsoid).toBe('WGS 84')
    expect(crs.ellipsoidA).toBe(6378137)
    expect(crs.ellipsoidInvF).toBe(298.257223563)
  })

  it('marks missing zone as unverified instead of defaulting', () => {
    const crs = reportCrs({ hemisphere: 'S', datum: 'Arc 1960' })
    expect(crs.verified).toBe(false)
    expect(crs.zone).toBe('UNVERIFIED')
    expect(crs.crsName).toBe('UNVERIFIED')
    expect(crs.ellipsoidA).toBeNull()
  })

  it('marks missing datum as unverified instead of assuming Arc 1960', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S' })
    expect(crs.verified).toBe(false)
    expect(crs.epsg).toBe('UNVERIFIED')
  })

  it('marks unknown datums as unverified', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'ITRF2014' })
    expect(crs.verified).toBe(false)
  })

  it('marks non-projected datum selections as unverified for zone reports', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'WGS84Geographic' })
    expect(crs.verified).toBe(false)
  })
})

describe('ellipsoidForDatum (authority ellipsoid table)', () => {
  it('resolves Arc 1960 to Clarke 1880 (RGS)', () => {
    expect(ellipsoidForDatum('Arc 1960')).toEqual({
      name: 'Clarke 1880 (RGS)',
      a: 6378249.145,
      rf: 293.465,
    })
    expect(ellipsoidForDatum('ARC1960')).not.toBeNull()
  })

  it('resolves WGS 84 variants', () => {
    expect(ellipsoidForDatum('WGS 84')).toEqual({
      name: 'WGS 84',
      a: 6378137.0,
      rf: 298.257223563,
    })
    expect(ellipsoidForDatum('wgs1984')).not.toBeNull()
  })

  it('returns null for datums METARDU does not know', () => {
    expect(ellipsoidForDatum('NAD27')).toBeNull()
    expect(ellipsoidForDatum('')).toBeNull()
  })
})
