import { transformCoordinates, getSupportedCRS } from '../transform'
import { convertDatum } from '@/lib/compute/pythonService'
import { transformPoint } from '@/lib/spatial/projectCrs'
import { SRID_32737 } from '@/lib/map/projectionConstants'

test('the documented EPSG request uses the project CRS authority without losing precision', () => {
  const source = { id: 'control', x: 36.821912345, y: -1.292123456, z: 1650.123456 }
  const projected = transformCoordinates({ fromCRS: 'EPSG:4326', toCRS: SRID_32737, points: [source] })
  const expected = transformPoint(source.x, source.y, 'EPSG:4326', SRID_32737)
  expect(projected.points[0]).toMatchObject({ x: expected[0], y: expected[1], z: source.z })
  const restored = transformCoordinates({ fromCRS: SRID_32737, toCRS: 'EPSG:4326', points: projected.points })
  expect(restored.points[0].x).toBeCloseTo(source.x, 9)
  expect(restored.points[0].y).toBeCloseTo(source.y, 9)
})

test('legacy geographic output is not rounded to a thousandth of a degree', () => {
  const projected = transformCoordinates({ fromCRS: 'WGS84', toCRS: 'WGS84-UTM37S', points: [{ id: 'p', x: 36.821912345, y: -1.292123456 }] })
  const restored = transformCoordinates({ fromCRS: 'WGS84-UTM37S', toCRS: 'WGS84', points: projected.points })
  expect(restored.points[0].x).toBeCloseTo(36.821912345, 9)
  expect(restored.points[0].y).toBeCloseTo(-1.292123456, 9)
})

test.each([undefined, null, 0, 123.123456789])('height %s is retained without a vertical conversion', z => {
  const result = transformCoordinates({ fromCRS: 'WGS84-UTM37S', toCRS: 'Arc1960-UTM37S', points: [{ id: 'p', x: 257700, y: 9857100, z }] })
  expect(result.points[0].z).toBe(z)
  expect(result).toMatchObject({ horizontalOnly: true, verticalTreatment: 'preserved-untransformed' })
})

test.each([
  { id: 'bad', x: Number.NaN, y: 0 }, { id: 'bad', x: 1, y: Infinity },
  { id: 'bad', x: 1, y: 2, z: Number.NaN }, { id: 'bad', x: 181, y: 0 },
  { id: 'bad', x: 0, y: 91 }, { id: '', x: 0, y: 0 },
])('invalid point rejects the complete batch and never becomes a zero-coordinate fallback: %j', invalid => {
  const points = [{ id: 'valid', x: 0, y: 0 }, invalid]
  const before = points.map(point => ({ ...point }))
  expect(() => transformCoordinates({ fromCRS: 'WGS84', toCRS: 'WGS84-UTM37S', points })).toThrow()
  expect(points).toEqual(before)
})

test.each(['ARC1960', 'EPSG:3857', 'EPSG:999999', ''])('ambiguous, display-only or unknown CRS %s is refused even for an identity transform', crs => {
  expect(() => transformCoordinates({ fromCRS: crs, toCRS: crs, points: [{ id: 'p', x: 0, y: 0 }] })).toThrow()
})

test('all explicit legacy CRS choices remain supported without identity rounding', () => {
  const choices = getSupportedCRS()
  expect(choices).toEqual(expect.arrayContaining(['Arc1960-UTM35S', 'Arc1960-UTM36N', 'Arc1960-UTM37N', 'Arc1960-UTM36S', 'Arc1960-UTM37S']))
  for (const crs of choices) {
    const source = crs === 'WGS84' ? { id: 'p', x: 36.123456789, y: -1.123456789 } : { id: 'p', x: 500000.123456789, y: 9800000.123456789 }
    expect(transformCoordinates({ fromCRS: crs, toCRS: crs, points: [source] }).points[0]).toMatchObject(source)
  }
})

test('the datum helper requires explicit CRS and does not invent an unknown height', async () => {
  const source = [{ id: 'p', easting: 36.8219, northing: -1.2921 }]
  await expect(convertDatum(source)).rejects.toThrow(/CRS|reference/)
  await expect(convertDatum(source, 'WGS84', 'ARC1960')).rejects.toThrow(/CRS|reference/)
  await expect(convertDatum(source, 'unknown', 'unknown')).rejects.toThrow(/CRS|reference/)
  const converted = await convertDatum(source, 'WGS84', 'WGS84-UTM37S')
  expect(converted[0].elevation).toBeUndefined()
  expect(converted[0]).toMatchObject({ datum: 'WGS 84', horizontalCrs: SRID_32737, horizontalUnits: 'metres', heightTransformed: false })
  expect(source).toEqual([{ id: 'p', easting: 36.8219, northing: -1.2921 }])
})

test('WGS 84 central meridian and equator project to the defined false origin', () => {
  const projected = transformCoordinates({ fromCRS: 'EPSG:4326', toCRS: SRID_32737, points: [{ id: 'origin', x: 39, y: 0 }] })
  expect(projected.points[0].x).toBeCloseTo(500000, 6)
  expect(projected.points[0].y).toBeCloseTo(10000000, 6)
})

test('temporary identities for unnamed helper inputs do not collide with real point IDs', async () => {
  const source = [{ id: 'pt-1', easting: 36, northing: -1 }, { easting: 36.1, northing: -1.1 }]
  const converted = await convertDatum(source, 'WGS84', 'WGS84-UTM37S')
  expect(converted).toHaveLength(2)
  expect(converted[0].id).toBe('pt-1')
  expect(converted[1].id).toBeUndefined()
})

test('duplicate point identities reject the batch instead of producing ambiguous records', () => {
  expect(() => transformCoordinates({ fromCRS: 'WGS84', toCRS: 'WGS84', points: [{ id: 'same', x: 0, y: 0 }, { id: 'same', x: 1, y: 1 }] })).toThrow(/unique/)
})

test('returned legacy CRS codes resolve in a fresh process registry', () => {
  jest.isolateModules(() => {
    const isolated = jest.requireActual<typeof import('../transform')>('../transform')
    expect(() => isolated.transformCoordinates({ fromCRS: 'METARDU:LEGACY:Arc1960-UTM35S', toCRS: 'EPSG:4326', points: [{ id: 'p', x: 500000, y: 9800000 }] })).not.toThrow()
  })
})
