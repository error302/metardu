import { describe, expect, it } from '@jest/globals'
import { deriveBoundaryMeasurements } from '@/lib/cadGeometry'

describe('deriveBoundaryMeasurements', () => {
  it('calculates whole-circle bearing and distance from coordinates', () => {
    const [boundary] = deriveBoundaryMeasurements(
      [
        { id: 'A', easting: 250100, northing: 9800100 },
        { id: 'B', easting: 250280, northing: 9800130 },
      ],
      [{ id: 'AB', fromId: 'A', toId: 'B', type: 'standard' }],
    )

    expect(boundary.distanceM).toBeCloseTo(Math.hypot(180, 30), 8)
    expect(boundary.distance).toBe('182.48')
    expect(boundary.bearingDeg).toBeCloseTo(80.5376778, 6)
    expect(boundary.bearing).toBe('80°32\'16"')
  })

  it('uses north-clockwise survey bearings for cardinal directions', () => {
    const points = [
      { id: 'A', easting: 0, northing: 0 },
      { id: 'N', easting: 0, northing: 10 },
      { id: 'W', easting: -10, northing: 0 },
    ]
    const [north, west] = deriveBoundaryMeasurements(points, [
      { id: 'AN', fromId: 'A', toId: 'N', type: 'standard' },
      { id: 'AW', fromId: 'A', toId: 'W', type: 'standard' },
    ])
    expect(north.bearing).toBe('0°00\'00"')
    expect(west.bearing).toBe('270°00\'00"')
  })

  it('fails clearly when a boundary endpoint has no coordinates', () => {
    expect(() => deriveBoundaryMeasurements(
      [{ id: 'A', easting: 0 }],
      [{ id: 'AB', fromId: 'A', toId: 'B', type: 'standard' }],
    )).toThrow('Boundary AB is missing endpoint coordinates')
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite endpoint coordinates: %p', easting => {
    expect(() => deriveBoundaryMeasurements([{ id: 'a', easting, northing: 0 }, { id: 'b', easting: 10, northing: 0 }],
      [{ id: 'ab', fromId: 'a', toId: 'b', type: 'standard' }])).toThrow()
  })

  it('rejects coincident endpoints instead of inventing a bearing', () => {
    expect(() => deriveBoundaryMeasurements([{ id: 'a', easting: 10, northing: 0 }, { id: 'b', easting: 10, northing: 0 }],
      [{ id: 'ab', fromId: 'a', toId: 'b', type: 'standard' }])).toThrow(/coincident/i)
  })

  it('rejects ambiguous duplicate point identities', () => {
    expect(() => deriveBoundaryMeasurements([{ id: 'a', easting: 0, northing: 0 }, { id: 'a', easting: 50, northing: 0 }, { id: 'b', easting: 100, northing: 0 }],
      [{ id: 'ab', fromId: 'a', toId: 'b', type: 'standard' }])).toThrow(/duplicate/i)
  })
})
