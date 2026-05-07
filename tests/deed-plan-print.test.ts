import { generateDeedPlanPrint } from '../src/lib/print/deedPlanPrint'
import type { DeedPlanInput } from '../src/types/deedPlan'

const FR583 = [
  { id: 'AB1', easting: 4332.6, northing: 114190.94, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const, description: 'I.P.C NEW from sample final coordinate list' },
  { id: 'AB2', easting: 4259.0, northing: 114198.58, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const, description: 'I.P.C NEW from sample final coordinate list' },
  { id: 'AB3', easting: 4279.99, northing: 114400.63, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const, description: 'I.P.C NEW from sample final coordinate list' },
  { id: 'AB4', easting: 4356.24, northing: 114424.48, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const, description: 'I.P.C.U NEW from sample final coordinate list' },
]

const INPUT: DeedPlanInput = {
  surveyNumber: 'RS087_2026_014_R00',
  drawingNumber: 'FR-583-83-SUBDIV-A',
  parcelNumber: 'A / L.R. Kajiado-Kaputiei North-18462',
  locality: 'Kitengela, Kaputiei North',
  area: 0, registrationSection: 'Kaputiei North', county: 'Kajiado',
  utmZone: 37, hemisphere: 'S', scale: 1000, datum: 'ARC1960', projectionType: 'UTM',
  boundaryPoints: FR583,
  abuttalNorth: 'Remainder parcel B', abuttalSouth: 'Access road reserve',
  abuttalEast: 'Neighbouring agricultural holding', abuttalWest: 'Remainder parcel B',
  surveyorName: 'Samuel K. Muriithi', iskNumber: 'ISK-1402',
  firmName: 'METARDU Survey Consultants Ltd', firmAddress: 'Nairobi, Kenya',
  surveyDate: '2026-05-08', signatureDate: '2026-05-08',
  clientName: 'Kaputiei Holdings Ltd', titleDeedNumber: 'FR No. 583/83',
  drawnBy: 'SKM', checkedBy: 'METARDU QA',
}

describe('Deed Plan Print Generation', () => {
  const html = generateDeedPlanPrint({ input: INPUT })

  test('generates non-empty HTML string', () => {
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(2000)
  })

  test('has A3 landscape page setup', () => {
    expect(html).toContain('A3 landscape')
    expect(html).toContain('@page')
  })

  test('has SVG parcel drawing', () => {
    expect(html).toContain('<svg')
    expect(html).toContain('viewBox')
    expect(html).toContain('polygon')
  })

  test('has north arrow', () => {
    expect(html).toContain('>N<')
  })

  test('has scale bar', () => {
    expect(html).toContain('Scale 1:1,000')
  })

  test('has DEED PLAN title', () => {
    expect(html).toContain('DEED PLAN')
    expect(html).toContain('BOUNDARY IDENTIFICATION PLAN')
  })

  test('has drawing number and parcel', () => {
    expect(html).toContain('FR-583-83-SUBDIV-A')
    expect(html).toContain('Kajiado-Kaputiei North-18462')
  })

  test('has beacon labels', () => {
    expect(html).toContain('AB1')
    expect(html).toContain('AB2')
    expect(html).toContain('AB3')
    expect(html).toContain('AB4')
  })

  test('has bearing schedule', () => {
    expect(html).toContain('Bearing')
    expect(html).toContain('Distance')
  })

  test('has coordinate schedule', () => {
    expect(html).toContain('Easting')
    expect(html).toContain('Northing')
    expect(html).toContain('4332.600')
  })

  test('has abuttals', () => {
    expect(html).toContain('Remainder parcel B')
    expect(html).toContain('Access road reserve')
    expect(html).toContain('Neighbouring agricultural holding')
  })

  test('has area in m2, hectares, acres', () => {
    expect(html).toContain('m\u00b2')
    expect(html).toContain('Hectares')
    expect(html).toContain('Acres')
  })

  test('has surveyor certificate', () => {
    expect(html).toContain('Samuel K. Muriithi')
    expect(html).toContain('ISK-1402')
    expect(html).toContain("Surveyor's Certificate")
  })

  test('has client and title deed', () => {
    expect(html).toContain('Kaputiei Holdings Ltd')
    expect(html).toContain('FR No. 583/83')
  })

  test('has datum/projection', () => {
    expect(html).toContain('Arc 1960')
    expect(html).toContain('UTM')
    expect(html).toContain('Zone 37S')
  })

  test('has closure check', () => {
    expect(html).toContain('Precision ratio')
    expect(html).toContain('Perimeter')
  })

  test('has drawn by / checked by', () => {
    expect(html).toContain('SKM')
    expect(html).toContain('METARDU QA')
  })

  test('throws with < 3 points', () => {
    const bad = {
      ...INPUT,
      boundaryPoints: [
        { id: 'A', easting: 0, northing: 0, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const },
        { id: 'B', easting: 100, northing: 0, markType: 'CONCRETE_BEACON' as const, markStatus: 'SET' as const },
      ],
    }
    expect(() => generateDeedPlanPrint({ input: bad })).toThrow('At least 3 boundary points')
  })

  test('works with minimal input', () => {
    const minimal: DeedPlanInput = {
      surveyNumber: '', drawingNumber: '', parcelNumber: '', locality: '',
      area: 0, registrationSection: '', county: '', utmZone: 37, hemisphere: 'S',
      scale: 1000, datum: 'ARC1960', projectionType: 'UTM',
      boundaryPoints: [
        { id: 'A', easting: 100, northing: 100, markType: 'CONCRETE_BEACON', markStatus: 'SET' },
        { id: 'B', easting: 200, northing: 100, markType: 'CONCRETE_BEACON', markStatus: 'SET' },
        { id: 'C', easting: 200, northing: 200, markType: 'CONCRETE_BEACON', markStatus: 'SET' },
      ],
      abuttalNorth: '', abuttalSouth: '', abuttalEast: '', abuttalWest: '',
      surveyorName: '', iskNumber: '', firmName: '', firmAddress: '',
      surveyDate: '2026-01-01', signatureDate: '2026-01-01',
    }
    const h = generateDeedPlanPrint({ input: minimal })
    expect(h).toContain('DEED PLAN')
    expect(h).toContain('m\u00b2')
  })

  test('HTML has proper document tags', () => {
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
  })

  test('has print media query', () => {
    expect(html).toContain('@media print')
  })
})
