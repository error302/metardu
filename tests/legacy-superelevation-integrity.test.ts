import { superelevationCalc as compute } from '@/lib/engineering/compute'
import { calculateSuperelevation as volume, superelevationCalc as volumeAlias } from '@/lib/engineering/volume'
import type { SuperelevationInput } from '@/lib/computations/roadSafetyCriteria'

const input: SuperelevationInput = {
  designSpeed: 80, radius: 200, numLanes: 2, laneWidth: 3.5,
  initialCrossfall: -0.025, providedSuperelevation: 0.09,
  criteria: { reference: 'Synthetic criteria revision 1', lateralFriction: 0.15,
    maximumSuperelevation: 0.07, maximumRelativeGradient: 0.005 },
}

describe.each([['compute', compute], ['volume', volume], ['volume alias', volumeAlias]] as const)('%s declared banking adapter', (_, calculate) => {
  // Malformed runtime requests must fail even when static typing is bypassed.
  const run = (value: unknown) => calculate(value as never)
  test('retains over-limit banking and reports failure without invented stations', () => {
    expect(run(input)).toMatchObject({ designE: 0.09, rotatedWidth: 7,
      status: 'FAIL', checks: { withinSuperelevationLimit: false, lateralDemandMet: false },
      criteriaReference: 'Synthetic criteria revision 1', standardCompliance: 'NOT_ASSESSED' })
    expect(run(input).transitionLength).toBeCloseTo(161, 12)
    for (const key of ['BVC', 'EVC', 'A', 'L1', 'L2', 'table', 'tangentialRunout', 'minTransitionLength']) {
      expect(run(input)).not.toHaveProperty(key)
    }
  })
  test('calculates a declared passing case without rounding the geometry', () => {
    const result = run({ ...input, radius: 400, providedSuperelevation: 0.06 })
    expect(result).toMatchObject({ designE: 0.06, status: 'PASS', standardCompliance: 'NOT_ASSESSED' })
    expect(result.transitionLength).toBeCloseTo(119, 12)
  })
  test('retains zero rotation length when crossfall is unchanged', () => {
    expect(run({ ...input, initialCrossfall: 0.09 }).transitionLength).toBe(0)
  })
  test.each([
    { R: 200, V: 80, eMax: 0.07 },
    { ...input, criteria: undefined },
    { ...input, criteria: { ...input.criteria, reference: ' ' } },
    { ...input, numLanes: 1.5 },
    { ...input, laneWidth: 0 },
    { ...input, radius: NaN },
    { ...input, providedSuperelevation: Infinity },
    { ...input, initialCrossfall: undefined },
    { ...input, criteria: { ...input.criteria, maximumRelativeGradient: 0 } },
    { ...input, transitionLength: 30 },
    { ...input, eMax: 0.12 },
    { ...input, criteria: { ...input.criteria, assumedLimit: 0.07 } },
  ])('rejects incomplete, invalid or ambiguous request %#', value => {
    expect(() => run(value)).toThrow()
  })
})
