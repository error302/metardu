import { defined } from '@/test-utils/defined'
import { computeSpiralAlignment } from '../spiralAlignment'
import { spiralAlignmentGeoJSON, spiralAlignmentSurveyCSV, spiralAlignmentRecord } from '../spiralAlignmentExport'

const declaredCrs = 'EPSG:32737' // Explicit synthetic fixture frame, never a product default.
const input = { radius: 300, spiralLength: 60, intersectionAngleDeg: 70, piChainage: 1000 }
const local = computeSpiralAlignment(input)
const world = computeSpiralAlignment({ ...input, piEasting: 500000, piNorthing: 10000000 })

it('requires declared projected survey coordinates before creating geographic GeoJSON', () => {
  expect(() => spiralAlignmentGeoJSON(local, declaredCrs)).toThrow(/PI coordinates/)
  expect(() => spiralAlignmentGeoJSON(world, '')).toThrow()
  expect(() => spiralAlignmentGeoJSON(world, 'EPSG:3857')).toThrow()
  expect(() => spiralAlignmentGeoJSON(world, 'EPSG:4326')).toThrow()
})
it('exports longitude/latitude while retaining the source survey frame and exact boundary stations', () => {
  const result = spiralAlignmentGeoJSON(world, declaredCrs)
  const line = result.features[0].geometry.coordinates as number[][]
  expect(line[0][0]).toBeCloseTo(39, 8)
  expect(line[0][1]).toBeLessThan(0)
  expect(line.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90)).toBe(true)
  expect(result.features.slice(1).map(feature => feature.properties.label)).toEqual(['TS', 'SC', 'CS', 'ST', 'PI'])
  expect(result.features[0].properties.source_crs).toBe(declaredCrs)
  expect(result.features[0].properties.purpose).toBe('map_preview_not_setout')
})
it('retains source inputs, precision, method, signed offsets and coordinate identity in numerical exports', () => {
  const csv = spiralAlignmentSurveyCSV(world, declaredCrs).split('\n')
  const header = csv[0].split(','), first = csv[1].split(',')
  expect(first[header.indexOf('Horizontal_CRS')]).toBe(declaredCrs)
  expect(first[header.indexOf('PI_easting_m')]).toBe('500000')
  expect(Number(first[header.indexOf('Northing_m')])).toBe(defined(world.tsCoord).northing)
  expect(header).toContain('Tangent_bearing_deg')
  const record = spiralAlignmentRecord(local)
  expect(record.coordinateFrame).toBe('local_tangent_x_forward_y_right')
  expect(record.horizontalCrs).toBeNull()
  expect(record.input).toEqual(input)
  expect(record.algorithmVersion).toBe('2.0.0')
})
