import { assertProjectedCrs, transformPoint } from '@/lib/spatial/projectCrs'
import { SPIRAL_ALIGNMENT_VERSION, stationSpiralAlignment, type SpiralAlignmentResult } from './spiralAlignment'

function surveyCrs(code?: string) {
  if (!code?.trim()) return null
  const info = assertProjectedCrs(code.trim())
  if (info.units !== 'metres') throw new RangeError('Alignment coordinates require a projected metre CRS.')
  return info
}

export function spiralAlignmentRecord(alignment: SpiralAlignmentResult, horizontalCrs?: string) {
  const info = surveyCrs(horizontalCrs)
  if (info && !alignment.piCoord) throw new RangeError('Supply PI coordinates before declaring a world coordinate system.')
  return {
    schemaVersion: 1, algorithmVersion: SPIRAL_ALIGNMENT_VERSION,
    status: 'DRAFT_NUMERICAL_DESIGN_NOT_FIELD_CHECKED', units: 'metres',
    coordinateFrame: alignment.piCoord ? 'projected_coordinates' : 'local_tangent_x_forward_y_right',
    horizontalCrs: info?.code ?? null, crsNotes: info?.notes ?? null,
    input: { ...alignment.input },
    keyChainages: { TS: alignment.tsChainage, SC: alignment.scChainage, CS: alignment.csChainage, ST: alignment.stChainage },
    stations: stationSpiralAlignment(alignment, 10),
  }
}

/** Full numerical precision is retained; a CSV decimal count is not field accuracy. */
export function spiralAlignmentSurveyCSV(alignment: SpiralAlignmentResult, horizontalCrs?: string) {
  const record = spiralAlignmentRecord(alignment, horizontalCrs), input = record.input
  const header = ['Status', 'Coordinate_frame', 'Horizontal_CRS', 'Algorithm_version', 'Radius_m', 'Intersection_angle_deg', 'Spiral_length_m', 'PI_chainage_m', 'Approach_bearing_deg', 'PI_easting_m', 'PI_northing_m', 'Chainage_m', 'Distance_from_TS_m', 'Easting_m', 'Northing_m', 'Offset_right_m', 'Chord_deflection_deg', 'Tangent_bearing_deg', 'Segment']
  const rows = record.stations.map(station => [record.status, record.coordinateFrame, record.horizontalCrs ?? 'UNDECLARED', record.algorithmVersion,
    input.radius, input.intersectionAngleDeg, input.spiralLength, input.piChainage, input.approachBearingDeg ?? 0, input.piEasting ?? '', input.piNorthing ?? '',
    station.chainage, station.distanceFromTS, station.easting, station.northing, station.offset, station.deflectionDeg, station.tangentBearingDeg, station.segment].join(','))
  return [header.join(','), ...rows].join('\n')
}

/** RFC 7946 uses WGS84 longitude/latitude. This is a map preview, not set-out.
 * https://www.rfc-editor.org/rfc/rfc7946#section-4
 */
export function spiralAlignmentGeoJSON(alignment: SpiralAlignmentResult, horizontalCrs: string) {
  if (!alignment.piCoord) throw new RangeError('Supply PI coordinates before exporting geographic GeoJSON.')
  const info = surveyCrs(horizontalCrs)
  if (!info) throw new RangeError('Declare the source projected CRS before exporting geographic GeoJSON.')
  const geographic = (easting: number, northing: number) => {
    const [longitude, latitude] = transformPoint(easting, northing, info.code, 'EPSG:4326')
    if (![longitude, latitude].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) throw new RangeError('The supplied coordinates cannot be mapped to valid longitude/latitude.')
    return [longitude, latitude]
  }
  const basis = { source_crs: info.code, crs_notes: info.notes ?? null, algorithm_version: SPIRAL_ALIGNMENT_VERSION,
    purpose: 'map_preview_not_setout', status: 'DRAFT_NUMERICAL_DESIGN_NOT_FIELD_CHECKED' }
  const features: Array<{ type: 'Feature'; geometry: { type: 'LineString' | 'Point'; coordinates: number[][] | number[] }; properties: Record<string, unknown> }> = [{
    type: 'Feature', geometry: { type: 'LineString', coordinates: stationSpiralAlignment(alignment, 2).map(point => geographic(point.easting, point.northing)) },
    properties: { ...basis, ...alignment.input, ts_chainage: alignment.tsChainage, sc_chainage: alignment.scChainage, cs_chainage: alignment.csChainage, st_chainage: alignment.stChainage },
  }]
  for (const [label, chainage, coordinate] of [
    ['TS', alignment.tsChainage, alignment.tsCoord], ['SC', alignment.scChainage, alignment.scCoord],
    ['CS', alignment.csChainage, alignment.csCoord], ['ST', alignment.stChainage, alignment.stCoord], ['PI', alignment.input.piChainage, alignment.piCoord],
  ] as const) {
    if (!coordinate) throw new RangeError('The alignment is missing a required world coordinate.')
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: geographic(coordinate.easting, coordinate.northing) }, properties: { ...basis, label, chainage } })
  }
  return { type: 'FeatureCollection' as const, features }
}
