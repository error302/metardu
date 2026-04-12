import { computeBoundaryLegs, degreesToDMS, computeArea, computeClosureCheck } from '@/lib/compute/deedPlan'
import type { BoundaryPoint, BeaconType } from '@/types/deedPlan'

function createPoint(id: string, easting: number, northing: number): BoundaryPoint {
  return {
    id,
    easting,
    northing,
    markType: 'PSC' as BeaconType,
    markStatus: 'FOUND'
  }
}

describe('DeedPlan Computation Engine', () => {
  describe('degreesToDMS', () => {
    it('converts 0 degrees to 000°00\'00.000"', () => {
      expect(degreesToDMS(0)).toBe('000°00\'00.000"')
    })

    it('converts 90 degrees to 090°00\'00.000"', () => {
      expect(degreesToDMS(90)).toBe('090°00\'00.000"')
    })

    it('converts 82.2 degrees to 082°12\'00.000"', () => {
      expect(degreesToDMS(82.2)).toBe('082°12\'00.000"')
    })

    it('converts 359.999999 degrees correctly', () => {
      const result = degreesToDMS(359.999999)
      expect(result).toMatch(/359°59'/)
    })
  })

  describe('computeBoundaryLegs', () => {
    it('computes bearings for a square', () => {
      const square = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0),
        createPoint('BP3', 100, 100),
        createPoint('BP4', 0, 100)
      ]

      const legs = computeBoundaryLegs(square)

      expect(legs).toHaveLength(4)
      expect(legs[0].fromPoint).toBe('BP1')
      expect(legs[0].toPoint).toBe('BP2')
      expect(legs[1].fromPoint).toBe('BP2')
      expect(legs[1].toPoint).toBe('BP3')
    })

    it('computes correct distances', () => {
      const square = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0),
        createPoint('BP3', 100, 100),
        createPoint('BP4', 0, 100)
      ]

      const legs = computeBoundaryLegs(square)

      legs.forEach(leg => {
        expect(leg.distance).toBe(100)
      })
    })

    it('throws error for less than 3 points', () => {
      const points = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0)
      ]

      expect(() => computeBoundaryLegs(points)).toThrow('at least 3 boundary points')
    })
  })

  describe('computeArea', () => {
    it('computes area of 100m x 50m rectangle = 5000 m²', () => {
      const rectangle = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0),
        createPoint('BP3', 100, 50),
        createPoint('BP4', 0, 50)
      ]

      const area = computeArea(rectangle)
      expect(area).toBe(5000)
    })

    it('returns 0 for less than 3 points', () => {
      const points = [createPoint('BP1', 0, 0)]

      expect(computeArea(points)).toBe(0)
    })
  })

  describe('computeClosureCheck', () => {
    it('closed traverse should have high precision ratio', () => {
      const square = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0),
        createPoint('BP3', 100, 100),
        createPoint('BP4', 0, 100)
      ]

      const closure = computeClosureCheck(square)

      expect(closure.closingErrorE).toBe(0)
      expect(closure.closingErrorN).toBe(0)
      expect(closure.perimeter).toBe(400)
      expect(closure.passes).toBe(true)
      expect(closure.precisionRatio).toBe('1 : ∞')
    })

    it('computes closure for closed square', () => {
      const square = [
        createPoint('BP1', 0, 0),
        createPoint('BP2', 100, 0),
        createPoint('BP3', 100, 100),
        createPoint('BP4', 0, 100)
      ]

      const closure = computeClosureCheck(square)

      expect(closure.closingErrorE).toBe(0)
      expect(closure.closingErrorN).toBe(0)
      expect(closure.perimeter).toBe(400)
      expect(closure.passes).toBe(true)
    })
  })
})
