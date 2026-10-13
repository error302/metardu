// Record parsing and completeness checks have no runtime geospatial dependencies.
import type { MultiPolygon, Polygon } from 'geojson'
export type EncumbranceType = 'wayleave' | 'easement' | 'restriction' | 'caveat' | 'lease' | 'charge'
export interface PlanarPoint { easting: number; northing: number }
export interface Encumbrance {
  id: string; type: EncumbranceType; description: string; holder: string
  coordinates: PlanarPoint[]; holes?: PlanarPoint[][]
  geometryType?: 'centreline' | 'polygon'; corridorWidth?: number
  registeredDate?: string; referenceNumber?: string
}
export interface EncumbranceParcel {
  boundary: PlanarPoint[]; holes?: PlanarPoint[][]; crsCode: string
  corridorModel?: 'butt-bevel'
}
export interface EncumbranceGeometryRow {
  id: string; footprintArea: number | null; withinParcelArea: number | null
  withinParcelGeometry: Polygon | MultiPolygon | null; issue: string | null
}
export interface EncumbranceResult {
  encumbrances: Encumbrance[]; restrictions: Encumbrance[]; summary: string
  parcelArea: number | null; declaredParcelArea: number | null; declaredAreaDifference: number | null
  totalAffectedArea: number | null; affectedPercent: number | null; assessedUnionArea: number | null
  registryStatus: 'not-verified'; coverageStatus: 'not-assessed' | 'partial' | 'complete-for-supplied-geometry'
  records: EncumbranceGeometryRow[]; unionGeometry: Polygon | MultiPolygon | null
  crsCode: string | null; method: 'planar-polygon-union-clipped-to-parcel' | 'not-assessed'
  corridorModel: 'butt-bevel' | null
}
const types = new Set<EncumbranceType>(['wayleave', 'easement', 'restriction', 'caveat', 'lease', 'charge'])
function validateRecords(records: Encumbrance[], declaredArea?: number) {
  if (declaredArea != null && (!Number.isFinite(declaredArea) || declaredArea <= 0)) throw new RangeError('A supplied source parcel area must be finite and positive.')
  if (records.length > 100 || records.reduce((sum, r) => sum + r.coordinates.length + (r.holes ?? []).reduce((n, h) => n + h.length, 0), 0) > 5000) throw new RangeError('Assess at most 100 records and 5,000 geometry vertices per draft.')
  const ids = new Set<string>()
  for (const r of records) {
    const id = r.id.trim()
    if (!id || ids.has(id) || !types.has(r.type)) throw new RangeError('Supply unique record IDs and recognized record categories.')
    ids.add(id)
    if (r.coordinates.some(p => !Number.isFinite(p.easting) || !Number.isFinite(p.northing)) || (r.holes ?? []).some(h => h.some(p => !Number.isFinite(p.easting) || !Number.isFinite(p.northing)))) throw new RangeError('All supplied coordinates must be finite; missing observations are not zero.')
    if (r.corridorWidth != null && (!Number.isFinite(r.corridorWidth) || r.corridorWidth <= 0)) throw new RangeError('A supplied corridor width must be finite and positive.')
    if (r.geometryType != null && !['centreline', 'polygon'].includes(r.geometryType)) throw new RangeError('Declare centreline or source polygon geometry.')
    if (r.coordinates.length && !r.geometryType) throw new RangeError('Declare the geometry type before interpreting supplied coordinates.')
    if (r.holes?.length && (r.geometryType !== 'polygon' || !r.coordinates.length)) throw new RangeError('Hole observations require a declared polygon and its outer boundary.')
    if (r.geometryType === 'centreline' && r.coordinates.length === 1 || r.geometryType === 'polygon' && r.coordinates.length > 0 && r.coordinates.length < 3) throw new RangeError('Complete the supplied centreline or polygon observations; partial geometry is not ignored.')
  }
}

export function reviewEncumbranceRecords(records: Encumbrance[], declaredParcelArea?: number): EncumbranceResult {
  validateRecords(records, declaredParcelArea)
  const base: EncumbranceResult = { encumbrances: records, restrictions: records.filter(r => ['restriction', 'caveat', 'wayleave'].includes(r.type)),
    summary: 'No parcel coverage or registry status has been verified.', parcelArea: null, declaredParcelArea: declaredParcelArea ?? null, declaredAreaDifference: null,
    totalAffectedArea: null, affectedPercent: null, assessedUnionArea: null, registryStatus: 'not-verified', coverageStatus: 'not-assessed',
    records: records.map(r => ({ id: r.id, footprintArea: null, withinParcelArea: null, withinParcelGeometry: null, issue: r.coordinates.length ? 'Parcel boundary and projected metre CRS are required.' : 'No spatial footprint supplied; parcel boundary and projected metre CRS are also required.' })),
    unionGeometry: null, crsCode: null, method: 'not-assessed', corridorModel: null }
  return { ...base, summary: records.length ? `${records.length} supplied records retained; spatial coverage requires a parcel boundary and declared projected metre CRS. Registry status is not verified.` : 'No encumbrance records were supplied. This is not a registry search or evidence of an unrestricted title.' }
}

export function parseEncumbranceCoordinates(text: string): PlanarPoint[][] {
  if (!text.trim()) return []
  if (text.length > 1024 * 1024) throw new RangeError('Use coordinate text smaller than 1 MiB.')
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  let count = 0
  return text.trim().split(/\r?\n\s*\r?\n/).map((block, ringIndex) => block.split(/\r?\n/).map((line, i) => {
    if (++count > 5000) throw new RangeError('Use at most 5,000 coordinate observations per input.')
    const pair = line.split(',').map(value => value.trim())
    if (pair.length !== 2 || pair.some(value => !decimal.test(value) || !Number.isFinite(Number(value)))) throw new RangeError(`Ring ${ringIndex + 1}, row ${i + 1}: supply a complete finite easting,northing pair.`)
    return { easting: Number(pair[0]), northing: Number(pair[1]) }
  }))
}
