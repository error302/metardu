import { analyzePinCushion, PinCushionInput } from '../pinCushionAnalysis'

describe('pinCushionAnalysis', () => {
  it('correctly calculates arithmetic and weighted mean coordinates', () => {
    const input: PinCushionInput = {
      monumentId: 'MB-01',
      monumentType: 'concrete',
      useWeightedMean: true,
      recoveries: [
        { id: 'R1', easting: 250000.000, northing: 9800000.000, date: '2026-01-01', weight: 1 },
        { id: 'R2', easting: 250000.020, northing: 9800000.020, date: '2026-01-02', weight: 1 },
        { id: 'R3', easting: 250000.010, northing: 9800000.010, date: '2026-01-03', weight: 2 },
      ],
    }

    const result = analyzePinCushion(input)
    expect(result.monumentId).toBe('MB-01')
    expect(result.meanPosition.easting).toBeCloseTo(250000.010, 3)
    expect(result.meanPosition.northing).toBeCloseTo(9800000.010, 3)
    expect(result.weightedMeanPosition.easting).toBeCloseTo(250000.010, 3)
    expect(result.recoveryCount).toBe(3)
  })

  it('computes 95% confidence error ellipse and detects spread', () => {
    const input: PinCushionInput = {
      monumentId: 'MB-02',
      monumentType: 'concrete',
      recoveries: [
        { id: 'R1', easting: 100.00, northing: 200.00, date: '2026-01-01' },
        { id: 'R2', easting: 100.02, northing: 200.01, date: '2026-01-02' },
        { id: 'R3', easting: 100.01, northing: 200.03, date: '2026-01-03' },
      ],
    }

    const result = analyzePinCushion(input)
    expect(result.maxSpread).toBeGreaterThan(0)
    expect(result.confidenceEllipse.semiMajor).toBeGreaterThan(0)
    expect(result.confidenceEllipse.semiMinor).toBeGreaterThan(0)
  })
})
