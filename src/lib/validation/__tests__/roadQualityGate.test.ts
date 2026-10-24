import { runStatutoryGate, formatGateResult, type StatutoryGateInput } from '../statutoryGate'

const base: StatutoryGateInput = { surveyType: 'engineering', surveyor: { name: 'Synthetic checker', licenseNumber: 'ISK/LS/2020/123' } }
const declared = { reference: 'Synthetic project criteria rev 1', minimumRadiusM: 250,
  maximumSuperelevation: 0.08, longitudinalFriction: 0.35, reactionTimeSeconds: 2.5 }
const run = (engineering: Record<string, unknown>) => runStatutoryGate({ ...base, engineering } as StatutoryGateInput)
const roadFindings = (engineering: Record<string, unknown>) => run(engineering).violations.filter(item => item.field?.startsWith('engineering'))

describe('road export checks use declared evidence', () => {
  it.each([{ horizontalCurveRadiusM: 300 }, { availableSightDistanceM: 500 }, { superelevation: 0.07 }])('blocks requested check without criteria %j', supplied => {
    const result = run({ designSpeedKph: 80, ...supplied })
    expect(result.passed).toBe(false)
    expect(result.violations.some(item => item.severity === 'block' && /unassessed|criteria/i.test(item.message))).toBe(true)
  })

  it('uses only an explicit radius criterion and reports the declared comparison', () => {
    const failed = roadFindings({ designSpeedKph: 80, horizontalCurveRadiusM: 240, criteria: declared })
    expect(failed).toContainEqual(expect.objectContaining({ source: 'metardu_qc', severity: 'block', actual: 240, allowable: 250 }))
    const passed = roadFindings({ designSpeedKph: 80, horizontalCurveRadiusM: 300, criteria: declared })
    expect(passed).toContainEqual(expect.objectContaining({ source: 'metardu_qc', severity: 'info', actual: 300, allowable: 250 }))
    expect(passed[0].message).toContain(declared.reference)
    expect(passed[0].message).not.toMatch(/Per RDM|official approval|safely negotiate/)
  })

  it('refuses to guess level grade even with declared braking criteria', () => {
    expect(run({ designSpeedKph: 80, availableSightDistanceM: 500, criteria: declared }).passed).toBe(false)
  })

  it('retains zero availability and the exact unrounded braking requirement', () => {
    const rows = roadFindings({ designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 0, criteria: declared })
    expect(rows).toContainEqual(expect.objectContaining({ severity: 'block', actual: 0 }))
    expect(rows.find(item => item.unit === 'm')?.allowable).toBeCloseTo(80 * 2.5 / 3.6 + 6400 / (254 * 0.35), 12)
  })

  it('uses the declared banking limit without national hardcoded caps', () => {
    expect(roadFindings({ designSpeedKph: 80, superelevation: 0.12, criteria: { ...declared, maximumSuperelevation: 0.15 } }))
      .toContainEqual(expect.objectContaining({ severity: 'info', actual: 12, allowable: 15 }))
    const failed = roadFindings({ designSpeedKph: 80, superelevation: 0.07, criteria: { ...declared, maximumSuperelevation: 0.06 } })
    expect(failed).toContainEqual(expect.objectContaining({ severity: 'block', allowable: 6 }))
    expect(failed[0].actual).toBeCloseTo(7, 12)
  })

  it.each([
    { horizontalCurveRadiusM: NaN }, { horizontalCurveRadiusM: -1 }, { availableSightDistanceM: -1, gradePercent: 0 },
    { availableSightDistanceM: Infinity, gradePercent: 0 }, { availableSightDistanceM: 500, gradePercent: -35 },
    { availableSightDistanceM: 500, gradePercent: 0, designSpeedKph: 0 }, { superelevation: NaN }, { superelevation: -0.01 },
  ])('invalid road evidence cannot silently pass %j', supplied => {
    const result = run({ designSpeedKph: 80, criteria: declared, ...supplied })
    expect(result.passed).toBe(false)
    for (const item of result.violations) for (const value of [item.actual, item.allowable]) {
      if (value !== undefined) expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('makes absent road context visible without blocking a non-road engineering submission', () => {
    const result = runStatutoryGate(base)
    const unassessed = result.violations.find(item => item.field === 'engineering')
    expect(unassessed?.severity).toBe('info')
    expect(unassessed?.message).toMatch(/road.*unassessed/i)
    expect(result.violations.some(item => item.field?.startsWith('engineering') && item.severity === 'block')).toBe(false)
  })

  it.each([null, false, 0, 'invalid', []])('blocks malformed explicit road request %j', engineering => {
    expect(runStatutoryGate({ ...base, engineering } as StatutoryGateInput).passed).toBe(false)
  })

  it('blocks a requested but empty road assessment', () => {
    expect(run({ designSpeedKph: 80 }).passed).toBe(false)
  })

  it.each([
    { reference: '' }, { reference: 'x'.repeat(513) }, { longitudinalFriction: 0 },
    { reactionTimeSeconds: 0 }, { reactionTimeSeconds: undefined }, { minimumStoppingDistanceM: Infinity },
  ])('blocks invalid/missing declared braking evidence %j', change => {
    const rows = roadFindings({ designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 500, criteria: { ...declared, ...change } })
    expect(rows).toContainEqual(expect.objectContaining({ severity: 'block', assessment: 'UNASSESSED', standardCompliance: 'NOT_ASSESSED' }))
  })

  it('reports three successful comparisons with retained criteria, without standards approval', () => {
    const result = run({ designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 500,
      horizontalCurveRadiusM: 300, superelevation: 0.07, criteria: declared })
    expect(result.passed).toBe(true)
    const rows = result.violations.filter(item => item.field?.startsWith('engineering'))
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row).toMatchObject({ source: 'metardu_qc', severity: 'info', assessment: 'PASS',
      criteriaReference: declared.reference, standardCompliance: 'NOT_ASSESSED' })
  })

  it('formatted output keeps absent road assessment explicit', () => {
    const text = formatGateResult(runStatutoryGate(base))
    expect(text).toContain('Road checks unassessed')
    expect(text).not.toContain('No configured check flagged an issue')
  })

  it('retains consumed braking evidence in the result and formatted report', () => {
    const result = run({ designSpeedKph: 80, gradePercent: -5, availableSightDistanceM: 100, criteria: declared })
    expect(result.violations.find(item => item.field === 'engineering.availableSightDistanceM')).toMatchObject({
      roadEvidence: { designSpeedKph: 80, gradePercent: -5, availableSightDistanceM: 100,
        longitudinalFriction: 0.35, reactionTimeSeconds: 2.5, minimumStoppingDistanceM: null } })
    expect(formatGateResult(result)).toContain('Road evidence:')
  })
})
