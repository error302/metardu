import Polygon from 'ol/geom/Polygon'
import LineString from 'ol/geom/LineString'
import { calculateGeodesicArea, calculateGeodesicLength, compareAreaMethods } from '../geodesicArea'
const geographicCrs = 'EPSG:4326'
const metricCrs = 'EPSG:32737'
const meanRadiusM = 6371008.8
test('identifies the spherical model and preserves unknown measurement uncertainty', () => {
  const rectangle = new Polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])
  const result = calculateGeodesicArea(rectangle, geographicCrs)
  const expected = meanRadiusM ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180)
  expect(result.areaSqM / expected).toBeCloseTo(1, 10)
  expect(result.model).toBe('mean-earth-sphere')
  expect(result.estimatedErrorSqM).toBeNull()
  expect(calculateGeodesicLength(new LineString([[0, 0], [1, 0]]), geographicCrs).lengthM).toBeCloseTo(meanRadiusM * Math.PI / 180, 6)
})
test('requires a declared geometry CRS at runtime', () => {
  expect(() => { Reflect.apply(calculateGeodesicArea, undefined, [new Polygon([])]) }).toThrow(/CRS/)
  expect(() => { Reflect.apply(calculateGeodesicLength, undefined, [new LineString([])]) }).toThrow(/CRS/)
})
test('numerical agreement cannot grant registry approval', () => {
  const empty = new Polygon([[[500000, 9900000], [500010, 9900000], [500020, 9900000], [500000, 9900000]]])
  expect(compareAreaMethods(empty, metricCrs).registryCompliant).toBe(false)
  expect(() => compareAreaMethods(empty, 'EPSG:3857')).toThrow(/display/i)
})
