function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Expected a valid fixture result'); return value }
import { buildRoadHorizontalGeometry, roadHorizontalStation, buildRoadCentrelineSetout } from '../roadCoordinateSetout'
import type { IntersectionPoint, RoadDesignData } from '@/types/engineering'
const fixtureCrs = 'EPSG:32737'
const ips: IntersectionPoint[] = [{ id: 'a', name: 'A', easting: 0, northing: 0, radius: 0 }, { id: 'p', name: 'PI', easting: 100, northing: 0, radius: 20 }, { id: 'b', name: 'B', easting: 100, northing: 100, radius: 0 }]
it('coordinates a left circular curve and both tangents using route chainage rather than raw PI lengths', () => {
  const route = required(buildRoadHorizontalGeometry(ips, 1000, fixtureCrs).alignment)
  expect(roadHorizontalStation(route, 1080)).toMatchObject({ easting: 80, northing: 0 })
  const middle = required(roadHorizontalStation(route, 1080 + 5 * Math.PI))
  expect(middle.easting).toBeCloseTo(80 + 20 / Math.sqrt(2), 10)
  expect(middle.northing).toBeCloseTo(20 - 20 / Math.sqrt(2), 10)
  expect(middle.bearing).toBeCloseTo(45, 10)
  const end = required(roadHorizontalStation(route, route.end))
  expect(end.easting).toBeCloseTo(100, 10); expect(end.northing).toBeCloseTo(100, 10)
  expect(roadHorizontalStation(route, route.end + 1)).toBeNull()
})
it('handles right curves and straight routes without invented coordinates or origins', () => {
  const right = required(buildRoadHorizontalGeometry([ips[0], ips[1], { ...ips[2], northing: -100 }], 0, fixtureCrs).alignment)
  const middle = required(roadHorizontalStation(right, 80 + 5 * Math.PI))
  expect(middle.northing).toBeCloseTo(-20 + 20 / Math.sqrt(2), 10)
  expect(middle.bearing).toBeCloseTo(135, 10)
  expect(roadHorizontalStation(required(buildRoadHorizontalGeometry([ips[0], ips[1]], 0, fixtureCrs).alignment), 50)).toMatchObject({ easting: 50, northing: 0, bearing: 90 })
})
it('exports actual centreline E/N and explicitly selected surface levels, requiring a height reference', () => {
  const road: RoadDesignData = { roadName:'Synthetic', datum:'Declared', coordinateSystem:fixtureCrs, designSpeed:40, roadClass:'C', ips, startChainage: 0, vips: [], stations: [{ chainage: 50, groundLevel: 0, designLevel: 0 }], crossSectionTemplate: { carriagewayWidth:6, shoulderWidth:0, camber:0, cutSlope:'2:1', fillSlope:'1.5:1', subgradeDepth: 0.5 } }
  expect(buildRoadCentrelineSetout(road, fixtureCrs, 'Declared BM').rows[0]).toMatchObject({ easting: 50, northing: 0, designLevel: 0, formationLevel: -0.5, levelSource: 'manual' })
  expect(buildRoadCentrelineSetout(road, fixtureCrs, '').rows).toEqual([])
  expect(buildRoadCentrelineSetout({ ...road, stations: [{ chainage: 300, groundLevel: 0, designLevel: 1 }] }, fixtureCrs, 'BM').rows).toEqual([])
})
