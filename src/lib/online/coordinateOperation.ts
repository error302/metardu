import { getRegisteredCrsDefinition, type CrsInfo } from '@/lib/spatial/projectCrs'
import { OnlineTransformError, type OnlineReference, type OnlineOperation } from './coordinateContract'

// Bounded named-ellipsoid admission, not a second ellipsoid mathematics table.
// Unknown proj4 names silently fall back to WGS84. Other names need operation
// review or explicit axes; the current registry's Arc path uses clrk80.
const reviewedEllipsoids = new Set(['wgs84', 'grs80', 'clrk80'])
function explicitEllipsoid(parameters: Map<string, string>): boolean {
  if (parameters.has('datum') || ['R', 'R_A', 'R_a', 'R_g', 'R_h', 'R_lat_a', 'R_lat_g', 'f', 'es', 'e'].some(key => parameters.has(key))) return false
  const ellipsoid = parameters.get('ellps')
  const axes = ['a', 'b', 'rf'].some(key => parameters.has(key))
  if (ellipsoid !== undefined) return !axes && reviewedEllipsoids.has(ellipsoid.toLowerCase())
  const a = Number(parameters.get('a'))
  if (!Number.isFinite(a) || a <= 0) return false
  if (parameters.has('b') && !parameters.has('rf')) {
    const b = Number(parameters.get('b'))
    return Number.isFinite(b) && b > 0 && b <= a
  }
  if (parameters.has('rf') && !parameters.has('b')) {
    if (!parameters.get('rf')?.trim()) return false
    const rf = Number(parameters.get('rf'))
    return Number.isFinite(rf) && (rf === 0 || rf > 1)
  }
  return false
}

export function onlineReference(info: CrsInfo): OnlineReference {
  // Catalogue free-text accuracy/operation claims are not verified evidence.
  const { notes: _notes, displayOnly: _display, ...reference } = info
  return { ...reference, id: info.code, type: info.projected ? 'projected' : 'geographic',
    axisConvention: info.projected ? 'easting,northing' : 'longitude,latitude' }
}
function datumSignature(definition: string): string {
  const parameters = new Map<string, string>()
  for (const token of definition.trim().split(/\s+/)) {
    if (!token.startsWith('+')) throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'This registered definition does not expose an explicit supported proj4 datum path.')
    const [name, ...value] = token.slice(1).split('=')
    if (parameters.has(name)) throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'Repeated definition parameters require explicit operation review.')
    parameters.set(name, value.join('='))
  }
  if (parameters.has('nadgrids') || parameters.has('geoidgrids')) throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'Grid-dependent operations are not configured in this online calculator.')
  const shift = parameters.get('towgs84')
  if (shift !== undefined) {
    const values = shift.split(',').map(value => value.trim() === '' ? NaN : Number(value))
    if (![3, 7].includes(values.length) || !values.every(Number.isFinite)) throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'The registered datum translation is not an explicit finite 3- or 7-parameter operation.')
    if (!explicitEllipsoid(parameters)) throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'A configured translation requires a reviewed named ellipsoid (WGS84, GRS80 or clrk80) or explicit positive finite axes. Conflicting datum or shape overrides require operation review.')
    return JSON.stringify(['configured', ...['datum', 'ellps', 'a', 'b', 'rf', 'pm'].map(key => parameters.get(key) ?? null), values])
  }
  if (parameters.get('datum')?.toUpperCase() === 'WGS84'
    && (!parameters.has('ellps') || parameters.get('ellps')?.toUpperCase() === 'WGS84')
    && !['a', 'b', 'rf', 'pm', 'R', 'R_A', 'R_a', 'R_g', 'R_h', 'R_lat_a', 'R_lat_g', 'f', 'es', 'e'].some(key => parameters.has(key))) return 'WGS84'
  throw new OnlineTransformError('OPERATION_UNAVAILABLE', 'The registered definitions do not establish an explicit supported horizontal datum path. Provide reviewed CRS configuration.')
}
export function onlineOperation(source: CrsInfo, target: CrsInfo): OnlineOperation {
  const sourceDefinition = getRegisteredCrsDefinition(source.code).def
  const targetDefinition = getRegisteredCrsDefinition(target.code).def
  const kind = source.code === target.code ? 'identity'
    : datumSignature(sourceDefinition) === datumSignature(targetDefinition) ? 'projection' : 'configured-datum-transform'
  const notes = ['This describes the configured horizontal path, not a certified EPSG operation. Position accuracy and regional applicability have not been established.',
    'Elevation is preserved unchanged; no vertical datum transformation is performed.']
  if ([sourceDefinition, targetDefinition].some(def => /\+towgs84=-160,-6,-302(?:,0,0,0,0)?(?:\s|$)/.test(def))) {
    notes.push('Arc 1960 uses the configured -160, -6, -302 metre translation. Verify regional applicability against independent control before survey use.')
  }
  return { engine: 'proj4', authority: 'METARDU shared CRS authority', kind, sourceDefinition, targetDefinition,
    accuracyMetres: null, accuracyStatus: 'not-established', applicabilityStatus: 'not-verified',
    horizontalOnly: true, verticalTreatment: 'preserved-untransformed', notes }
}
