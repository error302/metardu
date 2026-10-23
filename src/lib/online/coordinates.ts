import { assertSurveyCrs, listSupportedCrs } from '@/lib/spatial/projectCrs'
import { transformCoordinates as sharedTransform } from '@/lib/geo/transform'
import { OnlineTransformError, onlineFailure, type OnlineRequest, type OnlineReferences, type NamedCoordinates, type TransformResult } from './coordinateContract'
import { onlineOperation, onlineReference } from './coordinateOperation'
export type { TransformResult } from './coordinateContract'
export type CoordinateSystem = 'WGS84' | 'UTM' | 'ARC1960' | 'HARTEBEESTHOEK94' | 'ADINDAN' | 'CAPE' | 'ED50' | 'PSAD56'
export type CoordinateInput = Record<string, unknown>
const own = (value: OnlineRequest, key: string) => Object.hasOwn(value, key)
const deprecated = 'Legacy selectors are deprecated. Use explicit fromCRS and toCRS registered codes; no output grid is inferred.'
function resolveCodes(request: OnlineRequest, batch: boolean): { from: string; to: string; legacy: boolean } {
  const explicit = own(request, 'fromCRS') || own(request, 'toCRS')
  const legacy = own(request, 'fromSystem') || own(request, 'toSystem')
  if (explicit && legacy) throw new OnlineTransformError('CRS_AMBIGUOUS', 'Do not mix explicit CRS and legacy system selectors.')
  if (explicit) {
    if (typeof request.fromCRS !== 'string' || !request.fromCRS.trim() || typeof request.toCRS !== 'string' || !request.toCRS.trim()) throw new OnlineTransformError('CRS_REQUIRED', 'Provide both registered fromCRS and toCRS codes.')
    return { from: request.fromCRS, to: request.toCRS, legacy: false }
  }
  if (!legacy) throw new OnlineTransformError('CRS_REQUIRED', 'Provide explicit fromCRS and toCRS codes. Discover references at /api/coordinates/transform.')
  if (request.fromSystem === 'WGS84' && request.toSystem === 'WGS84') return { from: 'EPSG:4326', to: 'EPSG:4326', legacy: true }
  if (!batch && request.fromSystem === 'UTM' && request.toSystem === 'WGS84') {
    if (typeof request.zone !== 'number' || !Number.isInteger(request.zone) || request.zone < 1 || request.zone > 60 || !['N', 'S'].includes(String(request.hemisphere))) throw new OnlineTransformError('CRS_REQUIRED', 'Legacy UTM inverse requires zone 1..60 and an explicit N/S hemisphere; prefer registered CRS codes.')
    return { from: `EPSG:32${request.hemisphere === 'S' ? '7' : '6'}${String(request.zone).padStart(2, '0')}`, to: 'EPSG:4326', legacy: true }
  }
  throw new OnlineTransformError('CRS_AMBIGUOUS', 'Legacy datum/grid selectors cannot establish independent source and target CRS. Use explicit registered codes; no grid or datum operation is guessed.')
}
export function resolveOnlineReferences(request: OnlineRequest, batch = false): OnlineReferences {
  const codes = resolveCodes(request, batch)
  let source, target
  try { source = assertSurveyCrs(codes.from); target = assertSurveyCrs(codes.to) }
  catch { throw new OnlineTransformError('CRS_REJECTED', 'A reference is unregistered or display-only. Choose explicit survey-eligible registered CRS codes.') }
  if (request.zone !== undefined && (source.zone === undefined || request.zone !== source.zone)
    || request.hemisphere !== undefined && (source.hemisphere === undefined || request.hemisphere !== source.hemisphere)) {
    throw new OnlineTransformError('INVALID_COORDINATE', 'Redundant grid hints must agree with the resolved source CRS; they cannot select a target grid.')
  }
  const operation = onlineOperation(source, target)
  return { fromCRS: source.code, toCRS: target.code, source: onlineReference(source), target: onlineReference(target), operation,
    notes: [...operation.notes, ...(codes.legacy ? [deprecated] : [])] }
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
export async function transformOnlineCoordinates(request: OnlineRequest): Promise<TransformResult> {
  try {
    const references = resolveOnlineReferences(request)
    const { source, target } = references
    const pair = source.projected ? ['easting', 'northing'] as const : ['longitude', 'latitude'] as const
    const other = source.projected ? ['longitude', 'latitude'] : ['easting', 'northing']
    const x = request[pair[0]], y = request[pair[1]]
    if (!finite(x) || !finite(y) || other.some(key => request[key] !== undefined)
      || !source.projected && (Math.abs(x) > 180 || Math.abs(y) > 90)
      || request.elevation !== undefined && request.elevation !== null && !finite(request.elevation)) {
      throw new OnlineTransformError('INVALID_COORDINATE', 'Provide the finite named source coordinate pair, valid geographic bounds and source-consistent grid hints. Height may be finite, null or omitted.')
    }
    const height = request.elevation as number | null | undefined
    let transformed
    try { transformed = sharedTransform({ fromCRS: source.code, toCRS: target.code, points: [{ id: 'online', x, y, ...(height !== undefined ? { z: height } : {}) }] }).points[0] }
    catch { throw new OnlineTransformError('TRANSFORM_FAILED', 'Horizontal transformation failed; no substitute coordinate was produced.') }
    if (!transformed || !finite(transformed.x) || !finite(transformed.y) || !target.projected && (Math.abs(transformed.x) > 180 || Math.abs(transformed.y) > 90)) throw new OnlineTransformError('TRANSFORM_FAILED', 'Horizontal transformation returned an invalid target coordinate.')
    const result: NamedCoordinates = target.projected ? { easting: transformed.x, northing: transformed.y,
      ...(target.zone !== undefined ? { zone: target.zone } : {}), ...(target.hemisphere ? { hemisphere: target.hemisphere } : {}) }
      : { longitude: transformed.x, latitude: transformed.y }
    if (height !== undefined) result.elevation = height
    return { success: true, result, ...references }
  } catch (error) {
    return onlineFailure(error)
  }
}
/** Narrow compatibility adapter; the calculation authority is shared. */
export async function transformCoordinates(input: CoordinateInput, fromSystem: string, toSystem: string): Promise<TransformResult> {
  return transformOnlineCoordinates({ ...input, fromSystem, toSystem })
}
export function getSupportedSystems() {
  return listSupportedCrs().filter(info => !info.displayOnly).map(onlineReference)
}
