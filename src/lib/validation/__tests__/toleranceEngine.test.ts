import { checkTolerance, formatToleranceCheck } from '../toleranceEngine'

describe('toleranceEngine', () => {
  it('marks a traverse incomplete when linear precision passes but angular closure is unavailable', () => {
    const result = checkTolerance({
      traverse: {
        precisionRatio: 25_000,
        angularMisclosure: null,
        linearError: 0.01,
        totalDistance: 250,
        numStations: 4,
      },
    }, 'cadastral')

    expect(result.assessmentComplete).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.checks.find(check => check.name === 'Linear Precision')?.passed).toBe(true)
    expect(result.recommendations).toContain(
      'Angular closure was not assessed; provide observed angles or a known closing azimuth before treating the traverse as accepted.'
    )
    expect(formatToleranceCheck(result)).toContain('Tolerance Check: INCOMPLETE')
  })

  it('reports pass only when the supplied linear and angular checks both pass', () => {
    const result = checkTolerance({
      traverse: {
        precisionRatio: 25_000,
        angularMisclosure: 10,
        linearError: 0.01,
        totalDistance: 250,
        numStations: 4,
      },
    }, 'cadastral')

    expect(result.assessmentComplete).toBe(true)
    expect(result.passed).toBe(true)
  })
})
