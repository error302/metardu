import { leastSquaresAdjustment } from '../least-squares'

describe('leastSquaresAdjustment uncertainty prerequisites', () => {
  it('rejects a just-determined network that cannot estimate an a-posteriori variance', () => {
    expect(() => leastSquaresAdjustment(
      [
        { name: 'A', easting: 500000, northing: 9900000, isFixed: true },
        { name: 'B', easting: 500100, northing: 9900000, isFixed: false },
      ],
      [
        { type: 'distance', fromStation: 'A', toStation: 'B', value: 100, stdDev: 0.01 },
        { type: 'azimuth', fromStation: 'A', toStation: 'B', value: 90, stdDev: 5 / 3600 },
      ]
    )).toThrow(/at least one degree of freedom is required to estimate uncertainty/)
  })
})
