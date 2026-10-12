import { reportCrs, describeVerticalDatum, describeVertical } from '../reportCrs'

const EM = '\u2014' // em-dash used by the vertical statements

describe('reportCrs — horizontal authority', () => {
  it('derives WGS 84 EPSG codes per hemisphere', () => {
    const south = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'WGS84' })
    expect(south.verified).toBe(true)
    if (south.verified) expect(south.epsg).toBe('32737')
    const north = reportCrs({ utmZone: 36, hemisphere: 'N', datum: 'WGS84' })
    expect(north.verified).toBe(true)
    if (north.verified) expect(north.epsg).toBe('32636')
  })

  it('derives Arc 1960 EPSG codes for Kenyan zones', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' })
    expect(crs.verified).toBe(true)
    if (crs.verified) {
      expect(crs.epsg).toBe('21037')
      expect(crs.ellipsoid).toBe('Clarke 1880 (RGS)')
    }
  })

  it('never guesses a missing zone, hemisphere or datum', () => {
    expect(reportCrs({ utmZone: 37, hemisphere: 'S' }).verified).toBe(false)
    expect(reportCrs({ utmZone: 37, datum: 'ARC1960' }).verified).toBe(false)
    expect(reportCrs({ hemisphere: 'S', datum: 'ARC1960' }).verified).toBe(false)
    expect(reportCrs().verified).toBe(false)
  })
})

describe('reportCrs — vertical datum (blueprint §31 P0)', () => {
  it('carries the declared vertical datum with reference and geoid', () => {
    const crs = reportCrs({
      utmZone: 37,
      hemisphere: 'S',
      datum: 'ARC1960',
      verticalDatum: 'Kenya Vertical Datum 2005',
      verticalReference: 'orthometric',
      geoidModel: 'EGM2008',
      benchmarkBasis: 'BM Kenya',
    })
    expect(crs.vertical).toEqual({
      datum: 'Kenya Vertical Datum 2005',
      reference: 'orthometric',
      geoidModel: 'EGM2008',
      benchmarkBasis: 'BM Kenya',
    })
  })

  it('is absent when nothing was declared', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'ARC1960' })
    expect(crs.vertical).toBeUndefined()
  })

  it('is absent when only whitespace was supplied', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'ARC1960', verticalDatum: '   ' })
    expect(crs.vertical).toBeUndefined()
  })

  it('drops an unregistered height reference but keeps the datum', () => {
    const crs = reportCrs({
      utmZone: 37,
      hemisphere: 'S',
      datum: 'ARC1960',
      verticalDatum: 'Kenya Vertical Datum 2005',
      verticalReference: 'whatever-the-user-typed',
    })
    expect(crs.vertical).toEqual({ datum: 'Kenya Vertical Datum 2005' })
  })

  it('carries the vertical block even when the horizontal CRS is unverified', () => {
    const crs = reportCrs({ verticalDatum: 'Kenya Vertical Datum 2005' })
    expect(crs.verified).toBe(false)
    expect(crs.vertical).toEqual({ datum: 'Kenya Vertical Datum 2005' })
  })
})

describe('describeVerticalDatum / describeVertical', () => {
  it('renders a declared statement with reference and geoid', () => {
    const crs = reportCrs({
      utmZone: 37,
      hemisphere: 'S',
      datum: 'ARC1960',
      verticalDatum: 'Kenya Vertical Datum 2005',
      verticalReference: 'orthometric',
      geoidModel: 'EGM2008',
    })
    expect(describeVerticalDatum(crs)).toBe(
      `Orthometric heights ${EM} Kenya Vertical Datum 2005 (geoid: EGM2008)`,
    )
  })

  it('renders a declared datum without a registered reference', () => {
    const crs = reportCrs({ verticalDatum: 'Local site datum' })
    expect(describeVerticalDatum(crs)).toBe(`Vertical datum ${EM} Local site datum`)
  })

  it('never invents a height reference for the undeclared case', () => {
    const crs = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'ARC1960' })
    expect(describeVerticalDatum(crs)).toBe(`UNVERIFIED ${EM} no vertical datum declared`)
    expect(describeVertical(undefined)).toBe(`UNVERIFIED ${EM} no vertical datum declared`)
  })

  it('describes a bare vertical block directly', () => {
    expect(
      describeVertical({ datum: 'EGM96 Kenya', reference: 'ellipsoidal' }),
    ).toBe(`Ellipsoidal heights ${EM} EGM96 Kenya`)
  })
})
