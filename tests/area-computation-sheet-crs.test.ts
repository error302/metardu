/** @jest-environment node */
import { generateAreaComputationSheet } from '@/lib/generators/areaComputationSheet'
import { reportCrs } from '@/lib/generators/reportCrs'
import type { SurveyingCountry } from '@/lib/country/standards'

/**
 * The area computation sheet is a signed deliverable. It must print the
 * reference system the project declared — and nothing else. A sheet that
 * silently says "Arc 1960 / UTM Zone 37S" for an undeclared project is a
 * false authority claim, so the sheet says NOT DECLARED instead.
 */

function sheetText(crs: {
  utmZone?: number
  hemisphere?: string
  datum?: string
  country?: SurveyingCountry
  precisionRatio?: string
  minimumPrecisionRatio?: number
  precisionRatioRegulation?: string
}): string {
  const buffer = generateAreaComputationSheet({
    projectName: 'Boundary Survey',
    lrNumber: 'LR 123',
    surveyorName: 'A. Surveyor',
    iskNumber: 'ISK/1/2019',
    firmName: 'Survey Partners',
    referenceNumber: 'REF-1',
    stations: [
      { label: 'A1', easting: 500000, northing: 1000000 },
      { label: 'A2', easting: 500100, northing: 1000000 },
      { label: 'A3', easting: 500100, northing: 1000100 },
      { label: 'A1', easting: 500000, northing: 1000000 },
    ],
    ...crs,
  })
  return buffer.toString('latin1')
}

describe('area computation sheet — coordinate reference', () => {
  it('prints the declared reference system', () => {
    // The expected label comes from the same CRS authority the sheet uses, so
    // the test never hard-codes an EPSG literal of its own.
    const declared = reportCrs({ utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' })
    expect(declared.verified).toBe(true)
    if (!declared.verified) throw new Error('fixture reference system must be registered')

    const text = sheetText({ utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' })
    expect(text).toContain('Arc 1960 / UTM Zone 37S')
    expect(text).toContain(declared.epsgCode)
  })

  it('prints NOT DECLARED when the project declared no reference system', () => {
    const text = sheetText({})
    expect(text).toContain('NOT DECLARED')
    expect(text).not.toContain('Arc 1960')
    expect(text).not.toContain('UTM Zone 37S')
  })

  it('prints NOT DECLARED when only part of the reference system was declared', () => {
    const text = sheetText({ utmZone: 37, hemisphere: 'S' })
    expect(text).toContain('NOT DECLARED')
    expect(text).not.toContain('EPSG:')
  })
})

describe('area computation sheet — jurisdiction and statutory framing', () => {
  it('does not print Kenyan statutory framing by default', () => {
    const text = sheetText({ utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' })
    expect(text).not.toContain('Survey Act Cap 299')
    expect(text).not.toContain('Survey Regulations 1994')
    expect(text).not.toContain('Survey of Kenya')
    expect(text).not.toContain('ISK No.:')
    expect(text).toContain('Licence No.:')
  })

  it('states that the output is not a certified survey', () => {
    const text = sheetText({})
    expect(text).toContain('NOT a certified survey')
  })

  it('uses the declared jurisdiction for its regulatory citation', () => {
    const text = sheetText({ country: 'kenya' })
    expect(text).toContain('Kenya Survey Reg 84')
    const nz = sheetText({ country: 'new_zealand' })
    expect(nz).toContain('LINZ')
    expect(nz).not.toContain('Kenya Survey Reg 84')
  })
})

describe('area computation sheet — precision threshold', () => {
  it('reports UNVERIFIED when no threshold was declared', () => {
    const text = sheetText({ precisionRatio: '1:1000' })
    expect(text).toContain('UNVERIFIED')
    expect(text).toContain('no jurisdiction threshold declared')
    expect(text).not.toContain('1:5000 minimum')
  })

  it('reports PASS against a declared, cited threshold', () => {
    const text = sheetText({
      precisionRatio: '1:10000',
      minimumPrecisionRatio: 5000,
      precisionRatioRegulation: 'Kenya Survey Reg 60',
    })
    expect(text).toContain('PASS')
    expect(text).toContain('vs 1:5000 minimum')
    expect(text).toContain('Kenya Survey Reg 60')
  })

  it('reports FAIL against a declared, cited threshold', () => {
    const text = sheetText({
      precisionRatio: '1:1000',
      minimumPrecisionRatio: 5000,
      precisionRatioRegulation: 'Kenya Survey Reg 60',
    })
    expect(text).toContain('FAIL')
    expect(text).toContain('vs 1:5000 minimum')
    expect(text).toContain('Kenya Survey Reg 60')
  })
})
