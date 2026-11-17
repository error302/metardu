import { assessFieldFix, verdictToken } from '../fixVerdict'

describe('field fix verdict', () => {
  it('marks RTK Fixed with sound geometry as cadastral grade', () => {
    const assessment = assessFieldFix({ source: 'nmea', quality: 4, hdop: 0.8, satellites: 14 })
    expect(assessment).toMatchObject({ verdict: 'rtk-fixed', cadastralGrade: true, usable: true })
    expect(assessment.detail).toBe('RTK Fixed · HDOP 0.8 · 14 sats')
    expect(assessment.reasons).toEqual([])
  })

  it('keeps RTK Float as usable but never survey grade', () => {
    const assessment = assessFieldFix({ source: 'nmea', quality: 5, hdop: 1.1, satellites: 8 })
    expect(assessment).toMatchObject({ verdict: 'rtk-float', cadastralGrade: false, usable: true })
    expect(assessment.reasons).toContain('RTK Float has not resolved the ambiguities yet; wait for Fixed before boundary work.')
  })

  it('flags autonomous GPS as not usable', () => {
    const assessment = assessFieldFix({ source: 'nmea', quality: 1, hdop: 3.4, satellites: 5 })
    expect(assessment).toMatchObject({ verdict: 'single', cadastralGrade: false, usable: false })
    expect(assessment.reasons).toEqual(expect.arrayContaining([
      'Autonomous GPS positions are metres out — not survey grade.',
      'HDOP 3.4 is above the 2.0 working limit.',
      'Only 5 satellites — at least 6 are needed.',
    ]))
  })

  it('does not treat missing readings or missing quality facts as good data', () => {
    expect(assessFieldFix(null)).toMatchObject({ verdict: 'no-fix', cadastralGrade: false, usable: false })
    const unknown = assessFieldFix({ source: 'nmea' })
    expect(unknown).toMatchObject({ verdict: 'single', cadastralGrade: false, usable: false })
    expect(unknown.reasons).toContain('The receiver did not report a fix type.')
  })

  it('keeps optical observations out of GNSS quality semantics', () => {
    expect(assessFieldFix({ source: 'gsi' })).toMatchObject({ verdict: 'total-station', cadastralGrade: true, usable: true })
    expect(verdictToken('rtk-fixed')).toBe('RTK_FIXED')
  })
})
