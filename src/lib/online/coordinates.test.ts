/** @jest-environment node */
/* eslint-disable no-restricted-syntax -- Explicit international CRS literals exercise selected references, not inferred map defaults. */
import { transformCoordinates, transformOnlineCoordinates, getSupportedSystems } from './coordinates'
import { registerCrs } from '@/lib/spatial/projectCrs'
import { transformCoordinates as sharedTransform } from '@/lib/geo/transform'

describe('online legacy admission regressions', () => {
  test('empty projected identity is refused', async () => {
    expect(await transformCoordinates({}, 'UTM', 'UTM')).toMatchObject({ success: false })
  })
  test('unknown identities are refused', async () => {
    expect(await transformCoordinates({}, 'UNKNOWN' as 'UTM', 'UNKNOWN' as 'UTM')).toMatchObject({ success: false })
  })
  test('geographic identity validates latitude bounds', async () => {
    expect(await transformCoordinates({ longitude: 0, latitude: 91 }, 'WGS84', 'WGS84')).toMatchObject({ success: false })
  })
  test('an explicit zero northing is a measurement', async () => {
    const result = await transformCoordinates({ easting: 500000, northing: 0, zone: 37, hemisphere: 'N' }, 'UTM', 'WGS84')
    expect(result).toMatchObject({ success: true, result: { latitude: 0, longitude: 39 } })
  })
  test('a target UTM grid cannot be guessed', async () => {
    expect(await transformCoordinates({ longitude: 36.8219, latitude: -1.2921 }, 'WGS84', 'UTM')).toMatchObject({ success: false })
  })
  test('a bare regional datum identity does not establish a CRS', async () => {
    expect(await transformCoordinates({ easting: 500000, northing: 9850000, zone: 37, hemisphere: 'S' }, 'ARC1960', 'ARC1960')).toMatchObject({ success: false })
  })
  test('valid WGS84 identity remains usable', async () => {
    expect(await transformCoordinates({ longitude: 0, latitude: 0 }, 'WGS84', 'WGS84')).toMatchObject({ success: true, result: { longitude: 0, latitude: 0 } })
  })
})

const explicit = (values: Record<string, unknown> = {}) => ({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 0, latitude: 0, ...values })
describe('explicit online authority', () => {
  test.each([undefined, null, 0, 1510.12345])('identity preserves elevation %p without unsupported precision', async elevation => {
    const result = await transformOnlineCoordinates(explicit(elevation === undefined ? {} : { elevation }))
    expect(result).toMatchObject({ success: true, result: { longitude: 0, latitude: 0 }, fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', operation: { kind: 'identity', accuracyMetres: null, accuracyStatus: 'not-established', applicabilityStatus: 'not-verified', horizontalOnly: true, verticalTreatment: 'preserved-untransformed' } })
    expect(result).not.toHaveProperty('precision')
    if (result.success) {
      if (elevation === undefined) expect(result.result).not.toHaveProperty('elevation')
      else expect(result.result.elevation).toBe(elevation)
    }
  })
  test.each([
    { latitude: 91 }, { longitude: -181 }, { longitude: null }, { latitude: '' }, { latitude: Infinity },
    { longitude: '0' }, { easting: 0 }, { elevation: NaN }, { zone: 37 }, { hemisphere: 'S' },
  ])('rejects inadmissible identity input %p', async values => {
    expect(await transformOnlineCoordinates(explicit(values))).toMatchObject({ success: false, code: 'INVALID_COORDINATE' })
  })
  test.each(['EPSG:3857', 'EPSG:999999'])('rejects an inadmissible CRS even in an identity: %s', async crs => {
    expect(await transformOnlineCoordinates({ fromCRS: crs, toCRS: crs, easting: 0, northing: 0 })).toMatchObject({ success: false, code: 'CRS_REJECTED' })
  })
  test('missing and mixed selector families are distinguished', async () => {
    expect(await transformOnlineCoordinates({ longitude: 0, latitude: 0 })).toMatchObject({ success: false, code: 'CRS_REQUIRED' })
    expect(await transformOnlineCoordinates(explicit({ fromSystem: 'WGS84' }))).toMatchObject({ success: false, code: 'CRS_AMBIGUOUS' })
  })
  test.each(['EPSG:32601', 'EPSG:32737', 'EPSG:32660'])('uses explicit international grid %s and preserves all digits', async toCRS => {
    const input = { longitude: toCRS === 'EPSG:32601' ? -177.123456 : toCRS === 'EPSG:32660' ? 177.123456 : 36.821912345, latitude: toCRS === 'EPSG:32737' ? -1.292123456 : 1.23456789 }
    const reference = sharedTransform({ fromCRS: 'EPSG:4326', toCRS, points: [{ id: 'reference', x: input.longitude, y: input.latitude }] }).points[0]
    const result = await transformOnlineCoordinates({ fromCRS: 'epsg:4326', toCRS, ...input })
    expect(result).toMatchObject({ success: true, fromCRS: 'EPSG:4326', toCRS, result: { easting: reference.x, northing: reference.y }, operation: { kind: 'projection' } })
    if (result.success) expect(result.result).not.toHaveProperty('latitude')
  })
  test('distinct projected grids share the real adapter path', async () => {
    const expected = sharedTransform({ fromCRS: 'EPSG:32737', toCRS: 'EPSG:32736', points: [{ id: 'ref', x: 257700.123456, y: 9857100.987654 }] }).points[0]
    expect(await transformOnlineCoordinates({ fromCRS: 'EPSG:32737', toCRS: 'EPSG:32736', easting: 257700.123456, northing: 9857100.987654 })).toMatchObject({ success: true, result: { easting: expected.x, northing: expected.y } })
  })
  test('Arc configured translation agrees with the independent native PROJ fixture', async () => {
    const result = await transformOnlineCoordinates({ fromCRS: 'EPSG:21037', toCRS: 'EPSG:4326', easting: 257538.86000969677, northing: 9857382.339634635 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.result.longitude).toBeCloseTo(36.821900001651805, 7)
    expect(result.result.latitude).toBeCloseTo(-1.2921000053142353, 7)
    expect(result.operation).toMatchObject({ kind: 'configured-datum-transform', accuracyMetres: null })
    expect(result.operation.sourceDefinition).toContain('+towgs84=-160,-6,-302,0,0,0,0')
    expect(result.operation.notes.join(' ')).toMatch(/regional applicability/i)
    expect(result.operation).not.toHaveProperty('operationId')
  })
  test('source grid hints cannot override the declared source CRS', async () => {
    expect(await transformOnlineCoordinates({ fromCRS: 'EPSG:32637', toCRS: 'EPSG:4326', easting: 500000, northing: 0, zone: 36 })).toMatchObject({ success: false, code: 'INVALID_COORDINATE' })
  })
  test('custom labels alone cannot establish a datum path, but a valid identity is permitted', async () => {
    registerCrs({ code: 'METARDU:ONLINE:NO-PATH', name: 'Synthetic unreviewed datum', datum: 'WGS 84', units: 'metres', projected: true }, '+proj=utm +zone=37 +ellps=GRS80 +units=m +no_defs')
    expect(await transformOnlineCoordinates({ fromCRS: 'METARDU:ONLINE:NO-PATH', toCRS: 'EPSG:4326', easting: 500000, northing: 0 })).toMatchObject({ success: false, code: 'OPERATION_UNAVAILABLE' })
    expect(await transformOnlineCoordinates({ fromCRS: 'METARDU:ONLINE:NO-PATH', toCRS: 'METARDU:ONLINE:NO-PATH', easting: 0, northing: 0 })).toMatchObject({ success: true, result: { easting: 0, northing: 0 } })
  })
  test('unsupported grid dependencies fail before transformation', async () => {
    registerCrs({ code: 'METARDU:ONLINE:GRID', name: 'Synthetic unavailable grid', datum: 'WGS 84', units: 'metres', projected: true }, '+proj=utm +zone=37 +datum=WGS84 +nadgrids=not-installed.gsb +units=m +no_defs')
    expect(await transformOnlineCoordinates({ fromCRS: 'METARDU:ONLINE:GRID', toCRS: 'EPSG:4326', easting: 500000, northing: 0 })).toMatchObject({ success: false, code: 'OPERATION_UNAVAILABLE' })
  })
  test.each([
    '+ellps=not-a-real-ellipsoid',
    '+a=0 +b=0',
    '+datum=WGS84 +ellps=clrk80',
    '+a=6378137 +rf=',
    '+ellps=GRS80 +R=6371000',
  ].map((ellipsoid, index) => ({ ellipsoid, index })))('refuses a configured shift whose ellipsoid could be defaulted or overridden: $ellipsoid', async ({ ellipsoid, index }) => {
    const code = `METARDU:ONLINE:BAD-ELLIPSOID-${index}`
    registerCrs({ code, name: 'Synthetic ambiguous ellipsoid', datum: 'Synthetic', units: 'metres', projected: true }, `+proj=utm +zone=37 ${ellipsoid} +towgs84=1,2,3 +units=m +no_defs`)
    expect(await transformOnlineCoordinates({ fromCRS: code, toCRS: 'EPSG:4326', easting: 500000, northing: 100000 })).toMatchObject({ success: false, code: 'OPERATION_UNAVAILABLE' })
  })
  test.each(['+ellps=GRS80', '+a=6378137 +rf=298.257222101'])('admits an explicit configured ellipsoid without silent fallback: %s', async ellipsoid => {
    const code = ellipsoid.includes('GRS80') ? 'METARDU:ONLINE:SHIFT-NAMED' : 'METARDU:ONLINE:SHIFT-AXES'
    registerCrs({ code, name: 'Synthetic explicit ellipsoid', datum: 'Synthetic configured shift', units: 'metres', projected: true }, `+proj=utm +zone=37 ${ellipsoid} +towgs84=1,2,3 +units=m +no_defs`)
    const expected = sharedTransform({ fromCRS: code, toCRS: 'EPSG:4326', points: [{ id: 'expected', x: 500000, y: 100000 }] }).points[0]
    expect(await transformOnlineCoordinates({ fromCRS: code, toCRS: 'EPSG:4326', easting: 500000, northing: 100000 })).toMatchObject({ success: true, result: { longitude: expected.x, latitude: expected.y }, operation: { kind: 'configured-datum-transform' } })
  })
  test('discovery contains all WGS84 UTM zones and no display-only or broad datum choices', () => {
    const systems = getSupportedSystems()
    for (const code of ['EPSG:4326', 'EPSG:32601', 'EPSG:32701', 'EPSG:32660', 'EPSG:32760', 'EPSG:21036', 'EPSG:21037']) expect(systems).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
    expect(systems).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EPSG:3857' })]))
    expect(systems).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPE' })]))
  })
})
