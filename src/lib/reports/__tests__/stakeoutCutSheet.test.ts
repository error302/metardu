import { computeStakeoutReport, generateStakeoutCutSheetHTML, type StakeoutReportInput } from '../stakeoutCutSheet'

const fixture = (): StakeoutReportInput => ({
  projectName: 'Synthetic drainage check', surveyorName: '', reportDate: '2026-10-08',
  crs: 'EPSG:21037', tolerance: { horizontalM: 0.01, verticalM: 0.005, reference: 'TEST-SPEC-REV-1' },
  verticalDatum: 'Synthetic local benchmark BM-01',
  points: [{ pointId: 'MH-01', timestamp: '',
    design: { easting: 500000, northing: 9860000, elevation: 100 },
    staked: { easting: 500000.003, northing: 9860000.004, elevation: 100.002 } }],
})

describe('stakeout cut-sheet evidence', () => {
  it('computes independently checkable offsets from the shared set-out engine', () => {
    const result = computeStakeoutReport(fixture())
    expect(result.points[0].horizontalOffset).toBeCloseTo(0.005, 8)
    expect(result.points[0].deltaH).toBeCloseTo(0.002, 8)
    expect(result.points[0].status).toBe('PASS')
  })

  it('does not pass a 3D target when the observed level is missing', () => {
    const input = fixture()
    input.points[0].staked.elevation = undefined
    const report = computeStakeoutReport(input)
    expect(report.points[0]).toMatchObject({ status: 'INFO', pass: false, verticalPass: null })
    expect(report.summary).toMatchObject({ overallPass: false, unassessedPoints: 1, passRate: 0 })
    expect(generateStakeoutCutSheetHTML(report)).not.toContain('ALL POINTS WITHIN TOLERANCE')
  })

  it('requires a design level when a vertical criterion is supplied', () => {
    const input = fixture()
    input.points[0].design.elevation = undefined
    expect(computeStakeoutReport(input).points[0].status).toBe('INFO')
  })

  it('keeps a horizontal-only comparison explicitly scoped to horizontal checks', () => {
    const input = fixture()
    input.tolerance.verticalM = undefined
    input.points[0].design.elevation = undefined
    input.points[0].staked.elevation = undefined
    const report = computeStakeoutReport(input)
    expect(report.points[0]).toMatchObject({ status: 'PASS', verticalPass: null })
    expect(generateStakeoutCutSheetHTML(report)).toContain('Horizontal only')
  })

  it('cannot claim a level assessment without an entered vertical criterion', () => {
    const input = fixture()
    input.tolerance.verticalM = undefined
    expect(computeStakeoutReport(input).points[0].status).toBe('INFO')
  })

  it('does not turn an empty dataset into a successful survey', () => {
    const input = fixture()
    input.points = []
    expect(computeStakeoutReport(input).summary).toMatchObject({ overallPass: false, passRate: 0, status: 'INFO' })
  })

  it.each([0, -0.01, NaN, Infinity])('rejects invalid horizontal tolerance %s', (value) => {
    const input = fixture()
    input.tolerance.horizontalM = value
    expect(() => computeStakeoutReport(input)).toThrow(/tolerance/i)
  })

  it.each(['', 'EPSG:3857'])('rejects missing or display-only project CRS %s', (crs) => {
    const input = fixture()
    input.crs = crs
    expect(() => computeStakeoutReport(input)).toThrow(/CRS|coordinate|projected/i)
  })

  it('rejects an invalid measured coordinate instead of replacing it with zero', () => {
    const input = fixture()
    input.points[0].staked.easting = NaN
    expect(() => computeStakeoutReport(input)).toThrow(/finite/i)
  })

  it('requires an explicit tolerance specification reference', () => {
    const input = fixture()
    input.tolerance.reference = ''
    expect(() => computeStakeoutReport(input)).toThrow(/reference/i)
  })

  it('does not pass a level comparison with no recorded vertical reference', () => {
    const input = fixture()
    input.verticalDatum = ''
    expect(computeStakeoutReport(input).points[0].status).toBe('INFO')
  })

  it.each([0, 0.1])('does not pass a measurement with insufficient reported precision %s', (accuracyM) => {
    const input = fixture()
    input.points[0].accuracyM = accuracyM
    expect(computeStakeoutReport(input).points[0].status).toBe('INFO')
  })

  it('exports draft status, entered references, level datum and escaped notes', () => {
    const input = fixture()
    input.verticalDatum = 'Site benchmark BM-01'
    input.designRevision = 'DRAWING-REV-C'
    input.points[0].notes = '<script>alert(1)</script>'
    const html = generateStakeoutCutSheetHTML(computeStakeoutReport(input))
    expect(html).toContain('DRAFT')
    expect(html).toContain('Site benchmark BM-01')
    expect(html).toContain('DRAWING-REV-C')
    expect(html).toContain('TEST-SPEC-REV-1')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('does not round a small vertical exceedance down to the printed tolerance', () => {
    const input = fixture()
    input.points[0].staked.elevation = 100.0054
    const report = computeStakeoutReport(input)
    expect(report.points[0].status).toBe('WARN')
    expect(generateStakeoutCutSheetHTML(report)).toContain('+0.0054')
  })
})
