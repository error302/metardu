import type { CrossSectionTemplate, IntersectionPoint, RoadDesignData, StationData, VerticalIP } from '@/types/engineering'

const numeric = (value: unknown): number => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') return object(JSON.parse(value) as unknown)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
const rows = (value: unknown) => {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('The saved alignment rows are malformed.')
  return value.map(object)
}
const optionalNumber = (value: unknown) => value == null ? undefined : numeric(value)

/** Encode complete project inputs, including explicit empty lists and zeros. */
export function roadAlignmentMirrorPayload(road: RoadDesignData, projectId: string) {
  return {
    header: { project_id: projectId, road_name: road.roadName, start_chainage: road.startChainage,
      design_speed: Number.isFinite(road.designSpeed) ? road.designSpeed : null, road_class: road.roadClass || null,
      terrain_type: road.terrainType, standard: road.standard, cross_section_template: road.crossSectionTemplate ?? {}, vertical_station_interval_m: road.verticalStationIntervalM ?? null },
    ips: road.ips.map(ip => ({ source_id: ip.id, name: ip.name, easting: ip.easting, northing: ip.northing, radius: ip.radius,
      has_transition: ip.hasTransition, transition_length_in: ip.transitionLengthIn, transition_length_out: ip.transitionLengthOut })),
    vips: road.vips.map(ip => ({ source_id: ip.id, chainage: ip.chainage, reduced_level: ip.reducedLevel, k_value: ip.kValue ?? null,
      curve_length: ip.curveLength ?? null, gradient_in: ip.gradientIn ?? null, gradient_out: ip.gradientOut ?? null })),
    stations: road.stations.map(station => ({ chainage: station.chainage, ground_level: station.groundLevel, design_level: station.designLevel ?? null,
      design_level_source: station.designLevelSource ?? 'manual', ground_profile: station.groundProfile ?? null })),
  }
}

/** The relational fallback never turns missing survey/design values into zero. */
export function roadFromAlignmentMirror(row: Record<string, unknown>): RoadDesignData {
  const stored = object(row.cross_section_template)
  const template: CrossSectionTemplate = {
    carriagewayWidth: numeric(stored.carriagewayWidth ?? stored.carriageway_width), shoulderWidth: numeric(stored.shoulderWidth ?? stored.shoulder_width),
    camber: numeric(stored.camber), subgradeDepth: numeric(stored.subgradeDepth ?? stored.subgrade_depth),
    shoulderCrossfall: optionalNumber(stored.shoulderCrossfall ?? stored.shoulder_crossfall),
    cutSlope: String(stored.cutSlope ?? stored.cut_slope ?? ''), fillSlope: String(stored.fillSlope ?? stored.fill_slope ?? ''),
  }
  const ips: IntersectionPoint[] = rows(row.ips).map(ip => ({ id: String(ip.source_id ?? ip.id), name: typeof ip.name === 'string' ? ip.name : '',
    easting: numeric(ip.easting), northing: numeric(ip.northing), radius: numeric(ip.radius),
    hasTransition: ip.has_transition === true, transitionLengthIn: optionalNumber(ip.transition_length_in), transitionLengthOut: optionalNumber(ip.transition_length_out) }))
  const vips: VerticalIP[] = rows(row.vips).map(ip => ({ id: String(ip.source_id ?? ip.id), chainage: numeric(ip.chainage), reducedLevel: numeric(ip.reduced_level ?? ip.elevation),
    kValue: optionalNumber(ip.k_value), curveLength: optionalNumber(ip.curve_length), gradientIn: optionalNumber(ip.gradient_in), gradientOut: optionalNumber(ip.gradient_out) }))
  const stations: StationData[] = rows(row.stations).map(station => {
    const ground = object(station.existing_ground), design = object(station.proposed_road)
    const source = design.designLevelSource
    if (source != null && source !== 'manual' && source !== 'vertical-alignment') throw new Error('A saved station has an unknown design level source.')
    return { chainage: numeric(station.chainage), groundLevel: numeric(station.ground_level ?? ground.level), designLevel: optionalNumber(design.designLevel),
      designLevelSource: source as StationData['designLevelSource'], groundProfile: ground.profile == null ? undefined : rows(ground.profile).map(p => ({ offset: numeric(p.offset), level: numeric(p.level) })) }
  })
  return { roadName: typeof row.road_name === 'string' ? row.road_name : '', startChainage: numeric(row.start_chainage),
    datum: typeof row.datum === 'string' ? row.datum : '', coordinateSystem: typeof row.coordinate_system === 'string' ? row.coordinate_system : '',
    designSpeed: numeric(row.design_speed), roadClass: (typeof row.road_class === 'string' ? row.road_class : '') as RoadDesignData['roadClass'],
    terrainType: row.terrain_type as RoadDesignData['terrainType'], standard: row.standard as RoadDesignData['standard'],
    verticalStationIntervalM: optionalNumber(row.vertical_station_interval_m), crossSectionTemplate: template, ips, vips, stations }
}
