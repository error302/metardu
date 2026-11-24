import { generateBeaconCertificate } from '../beaconCertificate'
import type { BeaconCertificateInput } from '../beaconCertificate'

const base: BeaconCertificateInput = {
  meta: {
    projectName: 'Test parcel',
    clientName: '',
    surveyorName: 'A. Surveyor',
    regNo: '',
    iskNo: '',
    date: '2026-11-24',
    instrument: '',
    weather: '',
    observer: '',
    submissionNo: '',
  },
  location: {
    parcelRef: '',
    county: '',
    subCounty: '',
    location: '',
    subLocation: '',
    surveyJobNo: '',
  },
  horizontalCrs: 'EPSG:21037',
  beacons: [
    {
      id: '1',
      name: 'P1',
      monumentType: 'Iron Pin',
      condition: 'SET',
      easting: '250000',
      northing: '9945000',
      elevation: '',
      description: '',
      adjacentFeatures: '',
    },
  ],
}

/**
 * The beacon certificate is a signed deliverable. It must state the
 * coordinate reference the surveyor selected from the registry, must not
 * assume a vertical datum or a tolerance, and must not name a jurisdiction
 * that was never configured.
 */
describe('beacon certificate coordinate reference', () => {
  it('prints the registry-derived coordinate reference', () => {
    const html = generateBeaconCertificate(base)
    expect(html).toContain('Coordinate reference:')
    expect(html).toContain('Arc 1960 / UTM Zone 37S (EPSG:21037)')
  })

  it('refuses to issue a certificate without a coordinate reference', () => {
    expect(() => generateBeaconCertificate({ ...base, horizontalCrs: '' })).toThrow(/coordinate reference/i)
  })

  it('refuses an unregistered coordinate reference', () => {
    expect(() => generateBeaconCertificate({ ...base, horizontalCrs: 'EPSG:999999' })).toThrow(/registry/i)
  })

  it('never assumes a vertical datum', () => {
    const html = generateBeaconCertificate(base)
    expect(html).not.toMatch(/Mean Sea Level/i)
    expect(html).toContain('Vertical datum')
    expect(html).toContain('NOT DECLARED')
  })

  it('prints the declared vertical datum', () => {
    const html = generateBeaconCertificate({ ...base, verticalDatum: 'Orthometric (local benchmark)' })
    expect(html).toContain('Orthometric (local benchmark)')
  })

  it('states the jurisdictional beacon rule from configuration, not a hard-coded ministry', () => {
    const html = generateBeaconCertificate({
      ...base,
      jurisdictionRegulation: 'Bahrain CSD 2nd Ed 2024 §3.11',
    })
    expect(html).toContain('Bahrain CSD 2nd Ed 2024 §3.11')
    expect(html).not.toMatch(/Director of Surveys, Ministry of Lands/i)
  })

  it('does not invent an adjacent-feature tolerance', () => {
    const html = generateBeaconCertificate(base)
    expect(html).not.toMatch(/50mm/i)
  })

  it('is issued as a draft, not as a certified survey', () => {
    const html = generateBeaconCertificate(base)
    expect(html).toContain('DRAFT')
    expect(html).toContain('NOT CERTIFIED')
    expect(html).not.toMatch(/I certify that this survey computation/i)
  })
})
