import { runTraverseWorkflow } from '../workflowEngine'

describe('runTraverseWorkflow evidence and precision', () => {
  it('uses the computed 1:X precision ratio and leaves angular closure incomplete', () => {
    const result = runTraverseWorkflow({
      openingPoint: { name: 'A', easting: 500_000, northing: 9_900_000 },
      legs: [
        { fromStation: 'A', toStation: 'B', bearing: 0, distance: 100 },
        { fromStation: 'B', toStation: 'C', bearing: 90, distance: 100 },
        { fromStation: 'C', toStation: 'D', bearing: 180, distance: 100 },
        { fromStation: 'D', toStation: 'A', bearing: 270, distance: 100.0001 },
      ],
    })

    const linearPrecision = result.validation.checks.find(check => check.name === 'Linear Precision')
    const angularClosure = result.validation.checks.find(check => check.name === 'Angular Closure')

    expect(result.success).toBe(true)
    expect(linearPrecision?.value).toBeGreaterThan(1_000)
    expect(linearPrecision?.passed).toBe(true)
    expect(angularClosure).toMatchObject({ passed: false, assessed: false })
    expect(angularClosure?.message).toMatch(/Not assessed/)
    expect(result.validation.passed).toBe(false)
    expect(result.warnings).toContain(
      'Angular closure remains unassessed because this workflow received bearings and distances only.'
    )
  })
})
