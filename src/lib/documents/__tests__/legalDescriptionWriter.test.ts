import { generateLegalDescription, LegalDescriptionInput } from '../legalDescriptionWriter'

describe('legalDescriptionWriter', () => {
  it('generates statutory legal prose with bearings, distances, and Shoelace area', () => {
    const input: LegalDescriptionInput = {
      landReference: 'Kajiado/Kaputiei-North/1209',
      registrationSection: 'Kaputiei North',
      locality: 'Kitengela',
      datum: 'Arc 1960 / UTM Zone 37S',
      surveyorName: 'Surv. David M. Kariuki',
      surveyorLicense: 'SRB/LS/2026/0142',
      surveyDate: '2026-09-10',
      closingBearing: true,
      beacons: [
        { id: 'MB-01', easting: 250000.0, northing: 9800000.0, monumentType: 'concrete' },
        { id: 'MB-02', easting: 250100.0, northing: 9800000.0, monumentType: 'concrete' },
        { id: 'MB-03', easting: 250100.0, northing: 9800100.0, monumentType: 'iron_pin' },
        { id: 'MB-04', easting: 250000.0, northing: 9800100.0, monumentType: 'concrete' },
      ],
    }

    const text = generateLegalDescription(input)
    expect(text).toContain('All that piece or parcel of land')
    expect(text).toContain('Kajiado/Kaputiei-North/1209')
    expect(text).toContain('MB-01')
    expect(text).toContain('MB-02')
    expect(text).toContain('MB-03')
    expect(text).toContain('MB-04')
    expect(text).toContain('Surv. David M. Kariuki')
    // 100m x 100m = 10,000 m2 = 1.0000 Ha
    expect(text).toContain('1.0000')
  })
})
