import { generateProjectMetadata } from '../isoMetadata'
import { reportCrs } from '@/lib/generators/reportCrs'

const EM = '\u2014'

const baseProject = {
  id: 'p-1',
  name: 'Test Parcel',
  survey_type: 'cadastral',
  utm_zone: 37,
  hemisphere: 'S',
  datum: 'ARC1960',
  survey_date: '2026-06-15',
  user_name: 'J. Kamau',
  user_email: 'jk@survey.co.ke',
}

describe('generateProjectMetadata — vertical datum extension', () => {
  it('emits the declared vertical datum statement', () => {
    const xml = generateProjectMetadata({
      ...baseProject,
      vertical_datum: 'Kenya Vertical Datum 2005',
      vertical_reference: 'orthometric',
      geoid_model: 'EGM2008',
    })
    expect(xml).toContain('<gco:CharacterString>verticalDatum</gco:CharacterString>')
    expect(xml).toContain(
      `Orthometric heights ${EM} Kenya Vertical Datum 2005 (geoid: EGM2008)`,
    )
  })

  it('states the undeclared case explicitly instead of implying a height reference', () => {
    const xml = generateProjectMetadata(baseProject)
    expect(xml).toContain('<gco:CharacterString>verticalDatum</gco:CharacterString>')
    expect(xml).toContain(`UNVERIFIED ${EM} no vertical datum declared`)
  })

  it('still describes only the declared horizontal CRS', () => {
    const xml = generateProjectMetadata(baseProject)
    // EPSG codes come from the authority itself — no literals in this file.
    const declared = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'ARC1960' })
    const other = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'WGS84' })
    expect(declared.verified && other.verified).toBe(true)
    if (declared.verified && other.verified) {
      expect(xml).toContain(declared.epsgCode)
      expect(xml).not.toContain(other.epsgCode)
    }
  })
})
