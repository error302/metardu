import { resolveDocumentEvidence } from '@/lib/reports/documentEvidence'
import { generateComputationSheet, generateAreaCertificate, type ProjectData } from '@/lib/reports/documentPackage'

const project: ProjectData = { name: 'FICTIONAL QA', location: 'Not a real property', utm_zone: 37, hemisphere: 'S', datum: 'ARC1960', created_at: '2026-09-21', survey_type: 'cadastral' }
const saved = { ...project, area_sqm: '8000', boundary_data: {
  computation: { source: 'field-observations', computedAt: '2026-09-21T01:00:00Z', passes: true },
  startControl: { name: 'A1' }, perimeter_m: 360, linear_misclosure: 0, closing_error_e: 0, closing_error_n: 0,
  adjustedStations: [
    { pointName: 'A1', adjustedEasting: 500000, adjustedNorthing: 9900000 },
    { pointName: 'A2', adjustedEasting: 500000, adjustedNorthing: 9900080 },
    { pointName: 'A10', adjustedEasting: 500100, adjustedNorthing: 9900080 },
    { pointName: 'A3', adjustedEasting: 500100, adjustedNorthing: 9900000 },
  ],
} }

test('saved computed boundary supplies ordered document coordinates, area and closure', () => {
  const evidence = resolveDocumentEvidence(saved, [])
  expect(evidence.points.map(p => p.name)).toEqual(['A1','A2','A10','A3'])
  expect(evidence.points[0].elevation).toBeUndefined()
  expect(evidence.area).toMatchObject({ squareMeters: 8000, hectares: 0.8, perimeter: 360 })
  expect(evidence.traverse?.linearError).toBe(0)
  const html = generateComputationSheet(project, {}, evidence.points, evidence.traverse, evidence.area)
  expect(html).toContain('500100.0000')
  expect(html).toContain('8000.00')
  expect(html).toContain('ARC1960')
  expect(html).toContain('DRAFT')
  expect(html).toContain('Angular closure: unverified')
  expect(html).not.toContain('I certify that the above computations')
})

test('missing or invalidated computation never supplies an invented plan boundary', () => {
  expect(resolveDocumentEvidence(project, []).boundaryPoints).toEqual([])
  const invalidated = resolveDocumentEvidence({ ...saved, boundary_data: { startControl: { name: 'A1' } }, area_sqm: null }, [])
  expect(invalidated.points).toEqual([])
  expect(invalidated.area).toBeUndefined()
  expect(invalidated.traverse).toBeUndefined()
})

test('zero elevations survive and malformed computed coordinates fail closed', () => {
  expect(resolveDocumentEvidence(project, [{ name: 'P', easting: 0, northing: 0, elevation: 0, is_control: false }]).points[0].elevation).toBe(0)
  expect(() => resolveDocumentEvidence({ ...saved, boundary_data: { ...saved.boundary_data, adjustedStations: [{ pointName: 'bad', adjustedEasting: '', adjustedNorthing: 1 }] } }, [])).toThrow()
})

test('empty coordinate sheets and absent area cannot be exported as completed documents', () => {
  expect(() => generateComputationSheet(project, {}, [])).toThrow(/coordinates/i)
  expect(() => generateAreaCertificate(project, {})).toThrow(/area/i)
})

test('precision denominator is not inverted', () => {
  const html = generateComputationSheet(project, {}, [{ name:'P',easting:0,northing:0,is_control:false }], { totalDistance:360, linearError:0.036,closingErrorE:0.036,closingErrorN:0,precisionRatio:10000,precisionGrade:'Numerical check',legs:[] })
  expect(html).toContain('1 : 10,000')
  expect(html).not.toContain('1 : 0')
})
