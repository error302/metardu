import {
  pointInPolygon,
  distanceToPolygonBoundary,
  evaluateZoneStatus,
  GeofenceZone,
  HazardZone,
} from '../geofenceEngine'

describe('geofenceEngine', () => {
  const boundary = [
    { easting: 0, northing: 0 },
    { easting: 100, northing: 0 },
    { easting: 100, northing: 100 },
    { easting: 0, northing: 100 },
  ]

  it('determines inside and outside polygon points accurately', () => {
    expect(pointInPolygon({ easting: 50, northing: 50 }, boundary)).toBe(true)
    expect(pointInPolygon({ easting: 150, northing: 50 }, boundary)).toBe(false)
    expect(pointInPolygon({ easting: -10, northing: 50 }, boundary)).toBe(false)
  })

  it('calculates minimum distance to boundary perimeter', () => {
    // Point at (50, 10) is 10m from the segment (0,0)-(100,0)
    const dist = distanceToPolygonBoundary({ easting: 50, northing: 10 }, boundary)
    expect(dist).toBeCloseTo(10, 2)
  })

  it('evaluates inside safe, buffer warning, breach, and hazard proximity', () => {
    const zone: GeofenceZone = { boundary, bufferDistance: 15 }
    const hazards: HazardZone[] = [
      { center: { easting: 50, northing: 50 }, radius: 10, type: 'Restricted Pit' },
    ]

    // Point deep inside away from buffer and hazard
    expect(evaluateZoneStatus({ easting: 20, northing: 80 }, zone, hazards).status).toBe('INSIDE_SAFE')

    // Point near boundary edge (distance <= 15m)
    expect(evaluateZoneStatus({ easting: 5, northing: 80 }, zone, hazards).status).toBe('BOUNDARY_WARNING')

    // Point outside boundary
    expect(evaluateZoneStatus({ easting: 120, northing: 50 }, zone, hazards).status).toBe('OUTSIDE_BREACH')

    // Point inside hazard circle
    expect(evaluateZoneStatus({ easting: 52, northing: 51 }, zone, hazards).status).toBe('HAZARD_PROXIMITY')
  })
})
