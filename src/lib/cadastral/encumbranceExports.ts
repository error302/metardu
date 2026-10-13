import Drawing from 'dxf-writer'
import type { MultiPolygon, Polygon } from 'geojson'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'
import { analyzeEncumbrances, type EncumbranceParcel, type EncumbranceResult } from './encumbranceAnalysis'

function checked(result: EncumbranceResult, parcel?: EncumbranceParcel): EncumbranceResult {
  const fresh = analyzeEncumbrances(result.encumbrances, result.declaredParcelArea ?? undefined, parcel)
  if (JSON.stringify(fresh) !== JSON.stringify(result)) throw new RangeError('The coverage assessment is stale; recompute from current source records and parcel geometry before exporting.')
  return fresh
}
export function buildEncumbranceCsv(result: EncumbranceResult, parcel?: EncumbranceParcel): string {
  const fresh = checked(result, parcel)
  return engineeringScheduleCsv(['Record_ID', 'DXF_record_layer_prefix', 'Supplied_type', 'Description', 'Holder', 'Source_reference', 'Source_registration_date', 'Geometry_type', 'Full_corridor_width_m',
    'Footprint_area_m2', 'Within_parcel_area_m2', 'Assessment_issue', 'CRS', 'Computed_parcel_area_m2', 'Declared_source_area_m2', 'Source_minus_grid_area_m2', 'Coverage_status', 'Assessed_union_area_m2', 'Complete_supplied_record_area_m2', 'Registry_status', 'Corridor_model', 'Method'],
  fresh.encumbrances.map((record, i) => [record.id, `RECORD_${String(i + 1).padStart(3, '0')}`, record.type, record.description, record.holder, record.referenceNumber, record.registeredDate, record.geometryType,
    record.corridorWidth, fresh.records[i].footprintArea, fresh.records[i].withinParcelArea, fresh.records[i].issue,
    fresh.crsCode, fresh.parcelArea, fresh.declaredParcelArea, fresh.declaredAreaDifference, fresh.coverageStatus,
    fresh.assessedUnionArea, fresh.totalAffectedArea, fresh.registryStatus, fresh.corridorModel, fresh.method]))
}
const polygons = (geometry: Polygon | MultiPolygon) => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
export function buildEncumbranceGeometryCsv(result: EncumbranceResult, parcel?: EncumbranceParcel): string {
  const fresh = checked(result, parcel)
  if (!parcel || !fresh.crsCode) throw new RangeError('Declare parcel geometry and CRS before exporting coordinate geometry.')
  const rows: unknown[][] = []
  const add = (id: string, role: string, polygonIndex: number, ringIndex: number, ring: number[][]) => ring.forEach((p, i) => rows.push([id, role, polygonIndex, ringIndex, ringIndex ? 'hole' : 'outer_or_line', i, p[0], p[1], fresh.crsCode, 'metres', 'DRAFT', 'not-verified']))
  add('PARCEL', 'SOURCE_PARCEL', 0, 0, parcel.boundary.map(p => [p.easting, p.northing]))
  parcel.holes?.forEach((h, i) => add('PARCEL', 'SOURCE_PARCEL', 0, i + 1, h.map(p => [p.easting, p.northing])))
  fresh.encumbrances.forEach((record, i) => {
    const role = record.geometryType === 'centreline' ? 'SUPPLIED_CENTRELINE' : 'SUPPLIED_POLYGON'
    add(record.id, role, 0, 0, record.coordinates.map(p => [p.easting, p.northing]))
    record.holes?.forEach((h, j) => add(record.id, role, 0, j + 1, h.map(p => [p.easting, p.northing])))
    const geometry = fresh.records[i].withinParcelGeometry
    if (geometry) polygons(geometry).forEach((p, j) => p.forEach((r, k) => add(record.id, 'CLIPPED_RECORD', j, k, r)))
  })
  if (fresh.unionGeometry) polygons(fresh.unionGeometry).forEach((p, i) => p.forEach((r, j) => add('UNION', 'CLIPPED_UNION', i, j, r)))
  return engineeringScheduleCsv(['Record_ID', 'Geometry_role', 'Polygon_index', 'Ring_index', 'Ring_role', 'Vertex_index', 'Easting_m', 'Northing_m', 'CRS', 'Units', 'Issue_status', 'Registry_status'], rows)
}
const safeText = (value: string) => value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 500)
export function generateEncumbranceDxf(result: EncumbranceResult, parcel?: EncumbranceParcel): string {
  const fresh = checked(result, parcel)
  if (!parcel || !fresh.crsCode || !fresh.records.some(r => r.withinParcelArea !== null)) throw new RangeError('A coverage DXF requires a parcel, declared CRS and assessed geometry.')
  const drawing = new Drawing(); drawing.setUnits('Meters')
  const layers = new Set<string>()
  const line = (layer: string, coordinates: number[][], closed: boolean, color: number) => {
    if (!layers.has(layer)) { drawing.addLayer(layer, color, 'CONTINUOUS'); layers.add(layer) }
    drawing.setActiveLayer(layer)
    const points = coordinates.length > 1 && closed && coordinates[0][0] === coordinates.at(-1)?.[0] && coordinates[0][1] === coordinates.at(-1)?.[1] ? coordinates.slice(0, -1) : coordinates
    if (points.length >= 2) drawing.drawPolyline(points.map(p => [p[0], p[1]] as [number, number]), closed)
  }
  line('PARCEL_BOUNDARY', parcel.boundary.map(p => [p.easting, p.northing]), true, 7)
  parcel.holes?.forEach(h => line('PARCEL_HOLES', h.map(p => [p.easting, p.northing]), true, 8))
  fresh.encumbrances.forEach((record, i) => {
    const prefix = `RECORD_${String(i + 1).padStart(3, '0')}`
    line(`${prefix}_SOURCE`, record.coordinates.map(p => [p.easting, p.northing]), record.geometryType === 'polygon', 8)
    record.holes?.forEach(h => line(`${prefix}_SOURCE_HOLES`, h.map(p => [p.easting, p.northing]), true, 8))
    const geometry = fresh.records[i].withinParcelGeometry
    if (geometry) polygons(geometry).forEach(p => p.forEach((r, j) => line(`${prefix}_CLIPPED${j ? '_HOLES' : ''}`, r, true, 2)))
  })
  if (fresh.unionGeometry) polygons(fresh.unionGeometry).forEach(p => p.forEach((r, j) => line(`COVERAGE_UNION${j ? '_HOLES' : ''}`, r, true, 1)))
  drawing.addLayer('DRAFT_REFERENCE', 7, 'CONTINUOUS'); drawing.setActiveLayer('DRAFT_REFERENCE')
  const minE = Math.min(...parcel.boundary.map(p => p.easting)), minN = Math.min(...parcel.boundary.map(p => p.northing))
  const span = Math.max(...parcel.boundary.map(p => p.easting)) - minE
  const textHeight = Math.max(span * 0.012, 0.1)
  const notes = ['DRAFT - REGISTRY STATUS NOT VERIFIED', `Declared projected CRS: ${fresh.crsCode}; coordinates and drawing units in metres`,
    '2D GRID GEOMETRY - NO SURVEYED ELEVATION OR VERTICAL DATUM',
    `Assessment: ${fresh.coverageStatus}; model: ${fresh.corridorModel ?? 'source polygons only'}`,
    'Source geometry and parcel-clipped coverage are on separate layers. No legal registration or field verification is implied.']
  notes.forEach((note, i) => drawing.drawText(minE, minN - (i + 2) * textHeight * 1.6, textHeight, 0, safeText(note)))
  return drawing.toDxfString()
}
