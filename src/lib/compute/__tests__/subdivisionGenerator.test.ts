import { coordinateArea } from '@/lib/engine/area'
import { generateSubdivision } from '../subdivisionGenerator'

const oneHectareSquare: [number, number][] = [
  [760200, 9913200],
  [760300, 9913200],
  [760300, 9913300],
  [760200, 9913300],
  [760200, 9913200],
]

describe('projected-coordinate subdivision generator', () => {
  it('retains small parcel area precision at large grid coordinate magnitudes', () => {
    const area = coordinateArea([
      { easting: 760200, northing: 9913200 },
      { easting: 760210, northing: 9913200 },
      { easting: 760210, northing: 9913210 },
      { easting: 760200, northing: 9913210 },
    ])
    expect(area.areaSqm).toBeCloseTo(100, 10)
    expect(area.centroid.easting).toBeCloseTo(760205, 9)
    expect(area.centroid.northing).toBeCloseTo(9913205, 9)
  })

  it('uses planar metre area and returns the clipped road corridor geometry', () => {
    const result = generateSubdivision({
      parentBoundary: oneHectareSquare,
      plotWidth: 20,
      plotDepth: 40,
      roadWidth: 9,
    })

    expect(result.stats.parentAreaSqM).toBeCloseTo(10000, 6)
    expect(result.stats.totalRoadAreaSqM).toBeCloseTo(900, 4)
    expect(result.roadReserve.boundaryRings).toHaveLength(1)
    const reserveArea = coordinateArea(result.roadReserve.boundaryRings[0].map(([easting, northing]) => ({ easting, northing }))).areaSqm
    expect(reserveArea).toBeCloseTo(result.stats.totalRoadAreaSqM, 6)
    expect(result.plots.length).toBeGreaterThan(0)
  })

  it('rejects invalid or non-finite parent rings before Turf operations', () => {
    const bowTie: [number, number][] = [
      [0, 0], [100, 100], [0, 100], [100, 0],
    ]
    expect(() => generateSubdivision({
      parentBoundary: bowTie,
      plotWidth: 20,
      plotDepth: 40,
      roadWidth: 9,
    })).toThrow(/non-self-intersecting/)

    const nonFinite = [[0, 0], [100, 0], [100, Number.NaN], [0, 100]] as [number, number][]
    expect(() => generateSubdivision({
      parentBoundary: nonFinite,
      plotWidth: 20,
      plotDepth: 40,
      roadWidth: 9,
    })).toThrow(/non-self-intersecting/)
  })
})
