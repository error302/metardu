import { generateLegalDescription, LegalDescriptionInput } from '../legalDescriptionWriter'

describe('legalDescriptionWriter', () => {
  it('generates a review draft with grid bearings, distances, and planar area', () => {
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
    expect(text).toContain('DRAFT BOUNDARY DESCRIPTION — UNVERIFIED')
    expect(text).toContain('quadrant bearings relative to coordinate grid north')
    expect(text).not.toContain('horizontal ground distances')
    expect(text).not.toContain('compliant')
  })

  const draft = (): LegalDescriptionInput => ({
    landReference: 'SYNTHETIC', registrationSection: '', locality: '',
    datum: 'Synthetic local metre grid', surveyorName: '', surveyorLicense: '', surveyDate: '', closingBearing: true,
    beacons: [
      { id: 'A', easting: 0, northing: 0, monumentType: 'unknown' },
      { id: 'B', easting: 10, northing: 0, monumentType: 'unknown' },
      { id: 'C', easting: 0, northing: 10, monumentType: 'unknown' },
    ],
  })

  it('preserves zero and unknown marker evidence without inventing credentials', () => {
    const text = generateLegalDescription(draft())
    expect(text).toContain('Easting 0.000 metres')
    expect(text).toContain('marker evidence not provided')
    expect(text).toContain('Entered licence reference: Not provided')
    expect(text).not.toContain('a concrete beacon')
  })

  it('rejects missing reference, invalid coordinates, duplicates and collapsed boundaries', () => {
    const input = draft()
    expect(() => generateLegalDescription({ ...input, datum: '' })).toThrow(/reference/)
    expect(() => generateLegalDescription({ ...input, beacons: input.beacons.map((b, i) => i === 0 ? { ...b, easting: NaN } : b) })).toThrow(/finite/)
    expect(() => generateLegalDescription({ ...input, beacons: input.beacons.map(b => ({ ...b, id: 'A' })) })).toThrow(/unique/)
    expect(() => generateLegalDescription({ ...input, beacons: input.beacons.map(b => ({ ...b, northing: 0 })) })).toThrow()
  })
})
