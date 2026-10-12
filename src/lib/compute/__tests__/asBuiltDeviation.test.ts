import {
  checkDeviations,
  getStatusLabel,
  interpolateDesignElevation,
  type AsBuiltPoint,
  type DesignStation,
} from '../asBuiltDeviation'

const tolerance = { label: 'Project screening', passLimit: 10, marginalLimit: 15 }
const design: DesignStation[] = [
  { chainage: 20, elevation: 100.02 },
  { chainage: 0, elevation: 100 },
]

describe('as-built deviation screening', () => {
  it('interpolates sorted and unsorted profiles only inside design coverage', () => {
    expect(interpolateDesignElevation(design, 10)).toBeCloseTo(100.01, 12)
    expect(interpolateDesignElevation(design, 0)).toBe(100)
    expect(interpolateDesignElevation(design, 20)).toBe(100.02)
    expect(interpolateDesignElevation(design, -0.01)).toBeNull()
    expect(interpolateDesignElevation(design, 20.01)).toBeNull()
  })

  it('rejects duplicate chainages instead of dividing by zero', () => {
    expect(interpolateDesignElevation([
      { chainage: 0, elevation: 100 },
      { chainage: 0, elevation: 101 },
    ], 0)).toBeNull()
  })

  it('keeps uncovered and invalid observations visible without fabricated deviations', () => {
    const points: AsBuiltPoint[] = [
      { id: 'inside', chainage: 0, elevation: 100.005 },
      { id: 'outside', chainage: 21, elevation: 100.01 },
      { id: 'invalid', chainage: 5, elevation: Number.NaN },
    ]
    const report = checkDeviations(design, points, tolerance)

    expect(report.results.map(result => result.status)).toEqual(['pass', 'unassessed', 'unassessed'])
    expect(report.results[1]).toMatchObject({ designElevation: null, deltaZ: null, deviationMm: null })
    expect(report.results[2]).toMatchObject({ designElevation: null, deltaZ: null, deviationMm: null })
    expect(report.stats).toMatchObject({ total: 3, pass: 1, unassessed: 2 })
    expect(report.stats.passRate).toBeCloseTo(100 / 3, 12)
    expect(report.issues).toEqual(expect.arrayContaining([expect.stringMatching(/outside the supplied design/i), expect.stringMatching(/invalid chainage/i)]))
    expect(getStatusLabel('unassessed')).toBe('NOT ASSESSED')
  })

  it('does not assess observations against an ambiguous or non-finite design profile', () => {
    const duplicateProfile = checkDeviations([
      { chainage: 0, elevation: 100 },
      { chainage: 0, elevation: 101 },
    ], [{ id: 'P1', chainage: 0, elevation: 100 }], tolerance)
    const invalidProfile = checkDeviations([
      { chainage: 0, elevation: 100 },
      { chainage: 1, elevation: Number.POSITIVE_INFINITY },
    ], [{ id: 'P1', chainage: 0, elevation: 100 }], tolerance)

    expect(duplicateProfile.results[0]).toMatchObject({ status: 'unassessed', designElevation: null, deviationMm: null })
    expect(invalidProfile.results[0]).toMatchObject({ status: 'unassessed', designElevation: null, deviationMm: null })
  })

  it('requires finite non-negative ordered tolerance limits', () => {
    expect(() => checkDeviations(design, [], { label: 'bad', passLimit: Number.NaN, marginalLimit: 15 })).toThrow(/finite non-negative/i)
    expect(() => checkDeviations(design, [], { label: 'bad', passLimit: -1, marginalLimit: 15 })).toThrow(/finite non-negative/i)
    expect(() => checkDeviations(design, [], { label: 'bad', passLimit: 20, marginalLimit: 15 })).toThrow(/finite non-negative/i)
  })

  it('summarizes a large observation set without argument-spread limits', () => {
    const count = 150_000
    const longDesign: DesignStation[] = [
      { chainage: 0, elevation: 100 },
      { chainage: count - 1, elevation: 100 },
    ]
    const observations: AsBuiltPoint[] = Array.from({ length: count }, (_, index) => ({
      id: `P${index}`,
      chainage: index,
      elevation: 100.005,
    }))

    const report = checkDeviations(longDesign, observations, tolerance)
    expect(report.stats).toMatchObject({ total: count, pass: count, fail: 0, unassessed: 0, passRate: 100 })
    expect(report.stats.maxDeviationMm).toBeCloseTo(5, 8)
  })
})
