import { filterProfileNoise } from '../spectralEngine'

describe('derived profile filtering report', () => {
  it('reports variance change without claiming the removed signal is measurement noise', () => {
    const signal = Array.from({ length: 128 }, (_, i) => 100 + Math.sin(2 * Math.PI * i / 32) + Math.sin(2 * Math.PI * i / 4))
    const report = filterProfileNoise(signal, 1, 10)
    const variance = (values: number[]) => {
      const mean = values.reduce((s, v) => s + v, 0) / values.length
      return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    }
    expect(report.varianceReductionPercent).toBeCloseTo(100 * (1 - variance(report.filtered) / variance(signal)), 1)
    expect(report).not.toHaveProperty('noiseVarianceReductionPercent')
    expect(report.original).toEqual(signal)
    expect(report.original).not.toBe(signal)
    expect(() => filterProfileNoise(signal, 1, 0)).toThrow()
  })
})
