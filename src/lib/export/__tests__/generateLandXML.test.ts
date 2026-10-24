import { generateLandXML } from '../generateLandXML'
import { exportLandXMLSurface } from '../civilHandoff'

const EM = '\u2014'

const baseProject = { name: 'Test Parcel', utm_zone: 37, hemisphere: 'S', datum: 'ARC1960' }
const points = [{ name: 'P1', easting: 250000, northing: 9945000, is_control: true }]

describe('generateLandXML — coordinate system statements', () => {
  it('emits the declared datum and projection', () => {
    const xml = generateLandXML(baseProject, points)
    expect(xml).toContain('horizontalDatum="ARC1960"')
    expect(xml).toContain('UTM Zone 37S')
  })

  it('refuses a file when the project has no declared horizontal CRS', () => {
    expect(() => generateLandXML({ name: 'X' }, points)).toThrow(/declared, supported project CRS/)
  })

  it('carries the declared vertical datum using schema-defined attributes and metadata', () => {
    const xml = generateLandXML(
      {
        ...baseProject,
        vertical_datum: 'Kenya Vertical Datum 2005',
        vertical_reference: 'orthometric',
        geoid_model: 'EGM2008',
      },
      points,
    )
    expect(xml).toContain(
      `value="Orthometric heights ${EM} Kenya Vertical Datum 2005 (geoid: EGM2008)"`,
    )
    const cs = xml.slice(xml.indexOf('<CoordinateSystem '), xml.indexOf('</CoordinateSystem>'))
    expect(cs).toContain('verticalDatum="Kenya Vertical Datum 2005"')
    // The official schema defines Units at the LandXML root, not inside CoordinateSystem.
    expect(cs).not.toContain('<Units>')
    expect(xml).toContain('linearUnit="meter"')
  })

  it('states the undeclared vertical case explicitly', () => {
    const xml = generateLandXML(baseProject, points)
    expect(xml).toContain(
      `value="UNVERIFIED ${EM} no vertical datum declared"`,
    )
  })
})


describe('LandXML surface CRS gate', () => {
  const surfacePoints = [{ ...points[0], elevation: 12 }]

  it('uses the declared Arc 1960 EPSG code without inventing a vertical datum', () => {
    const xml = exportLandXMLSurface(surfacePoints, 'Test Parcel', 37, 'S', 'ARC1960')
    expect(xml).toContain('epsgCode="21037"')
    expect(xml).toContain('horizontalDatum="ARC1960"')
    expect(xml).not.toContain('verticalDatum="MSL"')
  })

  it('refuses an unsupported datum instead of exporting an UNVERIFIED code', () => {
    expect(() => exportLandXMLSurface(surfacePoints, 'Test Parcel', 37, 'S', 'Unknown Datum'))
      .toThrow(/declared, supported project CRS/)
  })

  it('escapes project and point names in the XML', () => {
    const xml = exportLandXMLSurface([{ ...surfacePoints[0], name: 'P&1' }], 'A&B', 37, 'S', 'WGS84')
    expect(xml).toContain('name="A&amp;B"')
    expect(xml).toContain('name="P&amp;1"')
  })
})
