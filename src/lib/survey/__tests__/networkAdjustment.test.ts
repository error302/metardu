import { adjustNetwork, Station, Observation } from '../networkAdjustment'

describe('adjustNetwork', () => {
  const fixedStation: Station = {
    id: 'stn-1',
    name: 'A',
    easting: 500000,
    northing: 9900000,
    elevation: 1500,
    isFixed: true,
  }

  const freeStation: Station = {
    id: 'stn-2',
    name: 'B',
    easting: 500100,
    northing: 9900100,
    elevation: 1510,
    isFixed: false,
  }

  const observation: Observation = {
    from: 'stn-1',
    to: 'stn-2',
    deltaE: 100,
    deltaN: 100,
    deltaH: 10,
    stdDev: 0.005,
  }

  test('adjusts network with one fixed and one free station', () => {
    const result = adjustNetwork([fixedStation, freeStation], [observation])

    expect(result.adjustedStations).toHaveLength(2)
    expect(result.passedTolerance).toBe(true)
    expect(result.sigmaZero).toBeGreaterThan(0)
    expect(result.degreesOfFreedom).toBe(0) // 2 observations - 2 unknowns = 0
  })

  test('throws when no fixed stations', () => {
    expect(() => adjustNetwork([freeStation], [observation])).toThrow(
      'At least one fixed control station is required'
    )
  })

  test('throws when no observations', () => {
    expect(() => adjustNetwork([fixedStation, freeStation], [])).toThrow(
      'At least one baseline observation is required'
    )
  })

  test('throws when insufficient observations', () => {
    expect(() => adjustNetwork([fixedStation, freeStation], [observation])).toThrow(
      'Insufficient observations'
    )
  })

  test('computes error ellipses for free stations', () => {
    const result = adjustNetwork([fixedStation, freeStation], [observation])

    const freeResult = result.adjustedStations.find(s => s.id === 'stn-2')!
    expect(freeResult.semiMajor).toBeGreaterThan(0)
    expect(freeResult.semiMinor).toBeGreaterThanOrEqual(0)
    expect(freeResult.orientation).toBeGreaterThanOrEqual(0)
  })

  test('fixed stations have zero residuals', () => {
    const result = adjustNetwork([fixedStation, freeStation], [observation])

    const fixedResult = result.adjustedStations.find(s => s.isFixed)!
    expect(fixedResult.residualE).toBe(0)
    expect(fixedResult.residualN).toBe(0)
    expect(fixedResult.semiMajor).toBe(0)
    expect(fixedResult.semiMinor).toBe(0)
  })

  test('validates with Zod schemas - rejects invalid station', () => {
    const invalidStations = [{ id: '', name: '', easting: 0, northing: 0, elevation: 0, isFixed: true }]

    expect(() => adjustNetwork(invalidStations as Station[], [observation])).toThrow('Invalid stations')
  })

  test('validates with Zod schemas - rejects invalid observation', () => {
    const invalidObs = [{ from: '', to: '', deltaE: 0, deltaN: 0, deltaH: 0, stdDev: -1 }]

    expect(() => adjustNetwork([fixedStation, freeStation], invalidObs as Observation[])).toThrow('Invalid observations')
  })
})