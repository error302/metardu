import { generateCertificate, type RoadCompletionData } from '../roadCompletionCertificate'

const completeDraftInput = (overrides: Partial<RoadCompletionData> = {}): RoadCompletionData => ({
  projectName: 'Drainage and road rehabilitation',
  roadName: 'Test Road',
  roadClass: 'C',
  chainageStart: 0,
  chainageEnd: 999.8,
  totalLength: 999.8,
  county: 'Test County',
  designSpeed: 50,
  carriagewayWidth: 6.5,
  shoulderWidth: 1.5,
  designStandard: 'Project specification, revision 2',
  contractorName: 'Test Contractor',
  clientName: 'Test Client',
  completionDate: '2026-10-05',
  surveyorName: 'Test Surveyor',
  surveyorRegistration: 'REG-0001',
  surveyorFirm: 'Test Firm',
  asBuiltPassRate: 90,
  asBuiltTotalPoints: 10,
  asBuiltPassPoints: 9,
  maxDeviation: 25,
  rmsError: 12,
  pavementLayers: [],
  earthworksReviewed: false,
  pavementReviewed: false,
  drainageReviewed: false,
  signageReviewed: false,
  roadFurnitureReviewed: false,
  defectsNoted: [],
  reservations: [],
  ...overrides,
})

describe('road completion draft record', () => {
  it('never turns user-reported figures or review ticks into statutory compliance claims', () => {
    const record = generateCertificate(completeDraftInput({
      earthworksReviewed: true,
      pavementReviewed: true,
      drainageReviewed: true,
      signageReviewed: true,
      roadFurnitureReviewed: true,
    }))

    expect(record.title).toMatch(/DRAFT/)
    expect(record.certificateNumber).toMatch(/^DRAFT-RCR-/)
    expect(record.checklistComplete).toBe(true)
    expect(record.sections.flatMap(section => section.rows).find(row => row.label.includes('pass rate'))?.value).toBe('90.0%')
    expect(record.sections.flatMap(section => section.rows).some(row => row.value === 'PASS' || row.value === 'FAIL')).toBe(false)
    expect(record.declaration).toMatch(/have not been independently verified/i)
    expect(record.declaration).not.toMatch(/hereby certify/i)
    expect(record.recordNotes.join(' ')).toMatch(/has not verified survey evidence/i)
    expect(record.sections[0].rows.find(row => row.label === 'Chainage')?.value).toBe('0+000 to 1+000')
  })

  it('rejects incomplete or invalid source figures instead of formatting fabricated output', () => {
    expect(() => generateCertificate(completeDraftInput({ asBuiltTotalPoints: Number.NaN }))).toThrow(/valid finite/i)
    expect(() => generateCertificate(completeDraftInput({ chainageEnd: 0 }))).toThrow(/valid finite/i)
    expect(() => generateCertificate(completeDraftInput({ surveyorRegistration: '' }))).toThrow(/required project/i)
  })
})
