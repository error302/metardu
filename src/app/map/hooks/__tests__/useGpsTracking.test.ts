import { asProjectedGpsPosition } from '../useGpsTracking'

describe('asProjectedGpsPosition', () => {
  it('preserves finite grid coordinates and reported accuracy', () => {
    expect(asProjectedGpsPosition([432100, 9854200], 2.4)).toEqual({
      easting: 432100,
      northing: 9854200,
      accuracy: 2.4,
    })
  })

  it('accepts a legitimate zero coordinate without treating it as a failure sentinel', () => {
    expect(asProjectedGpsPosition([0, 0], 1)).toEqual({
      easting: 0,
      northing: 0,
      accuracy: 1,
    })
  })

  it.each([
    [null, 1],
    [[1], 1],
    [[Number.NaN, 2], 1],
    [[1, Number.POSITIVE_INFINITY], 1],
    [[1, 2], null],
    [[1, 2], Number.NaN],
    [[1, 2], -1],
  ] as const)('rejects invalid position %p and accuracy %p', (coordinates, accuracy) => {
    expect(asProjectedGpsPosition(coordinates, accuracy)).toBeNull()
  })
})
