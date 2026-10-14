import { calculateRoadHorizontal } from './roadHorizontalAlignment'
export { calculateRoadHorizontal } from './roadHorizontalAlignment'
export type { ProjectRoadCurve } from './roadHorizontalAlignment'
import Papa from 'papaparse'
import { endAreaVolume } from '@/lib/engine/engineering'
import type { CrossSectionTemplate, StationData, RoadDesignData } from '@/types/engineering'
import { computeSlopeIntercept } from './crossSectionGeometry'
import { integrateProfileAreas, interpolateProfile, validateProfile } from './profileGeometry'
import { buildRoadVerticalSchedules, resolveRoadDesignStations } from './roadVerticalAlignment'
import { buildRoadCentrelineSetout } from './roadCoordinateSetout'

const message = (error: unknown) => error instanceof Error ? error.message : 'Review the supplied road survey data.'
/** Preserve the H:V convention used by the existing project template inputs. */
export function parseProjectSlope(slope: string): number {
  const match = slope.trim().toUpperCase().match(/^(\d+(?:\.\d+)?)\s*H?\s*:\s*(\d+(?:\.\d+)?)\s*V?$/)
  if (!match) throw new RangeError('Enter a slope as H:V, for example 2:1 or 2H:1V.')
  const h = Number(match[1]), v = Number(match[2])
  if (![h, v].every(Number.isFinite) || h <= 0 || v <= 0) throw new RangeError('Both slope components must be finite and positive.')
  return h / v
}

export function validateRoadTemplate(template: CrossSectionTemplate): void {
  if (![template.carriagewayWidth, template.shoulderWidth, template.camber, template.subgradeDepth].every(Number.isFinite) ||
    template.carriagewayWidth <= 0 || template.shoulderWidth < 0 || template.camber < 0 || template.subgradeDepth < 0) throw new RangeError('Supply finite positive road width and non-negative shoulders, camber and subgrade depth.')
  if (template.shoulderWidth > 0 && (template.shoulderCrossfall == null || !Number.isFinite(template.shoulderCrossfall) || template.shoulderCrossfall < 0)) throw new RangeError('Enter the approved shoulder crossfall; it is not inferred from a road standard.')
  parseProjectSlope(template.cutSlope); parseProjectSlope(template.fillSlope)
}

export function calculateRoadSection(station: StationData, template: CrossSectionTemplate) {
  validateRoadTemplate(template)
  if (!Number.isFinite(station.designLevel) || !Number.isFinite(station.chainage) || !Number.isFinite(station.groundLevel)) throw new RangeError('Supply finite chainage, ground RL and design surface RL; zero is a valid level.')
  if (!station.groundProfile?.length) throw new RangeError('Enter measured offset/ground RL observations; a centreline height cannot define a complete cross-section.')
  const ground = validateProfile(station.groundProfile)
  const atCentre = interpolateProfile(ground, 0)
  if (atCentre === null || Math.abs(atCentre - station.groundLevel) > 1e-6) throw new RangeError('The measured profile must span the centreline and agree with its supplied ground RL.')
  const centre = (station.designLevel as number) - template.subgradeDepth
  const half = template.carriagewayWidth / 2, outer = half + template.shoulderWidth
  const edge = centre - template.camber / 100 * half
  const shoulder = edge - (template.shoulderCrossfall ?? 0) / 100 * template.shoulderWidth
  const catchAt = (offset: number) => {
    const observed = interpolateProfile(ground, offset)
    if (observed === null) throw new RangeError('Extend measured ground beyond both shoulders to the slope daylight points.')
    const cut = observed >= shoulder
    const ratio = parseProjectSlope(cut ? template.cutSlope : template.fillSlope)
    const point = computeSlopeIntercept(offset, shoulder, ratio, cut, ground)
    if (!point) throw new RangeError('Extend measured ground to capture the slope daylight; no ground extrapolation is used.')
    return { ...point, type: cut ? 'cut' as const : 'fill' as const }
  }
  const leftCatch = catchAt(-outer), rightCatch = catchAt(outer)
  const formation = [leftCatch, { offset: -outer, level: shoulder }, { offset: -half, level: edge },
    { offset: 0, level: centre }, { offset: half, level: edge }, { offset: outer, level: shoulder }, rightCatch]
    .filter((p, i, list) => i === 0 || p.offset !== list[i - 1].offset)
  return { ...integrateProfileAreas(ground, formation), ground, formation, leftCatch, rightCatch, formationLevel: centre }
}

export interface RoadEarthworksRow {
  chainage: number; groundLevel: number; designLevel: number; formationLevel: number;
  cutArea: number; fillArea: number; cutVolume: number; fillVolume: number; cumulativeCut: number; cumulativeFill: number;
  leftDaylightOffset: number; rightDaylightOffset: number; method: 'origin' | 'average-end-area'
}
export function calculateRoadEarthworks(stations: StationData[], template: CrossSectionTemplate | undefined) {
  try {
    if (!template) throw new RangeError('Save a complete cross-section template.')
    if (stations.length < 2) throw new RangeError('At least two measured/design cross-sections are needed for volumes.')
    if (stations.some((s, i) => !Number.isFinite(s.chainage) || i > 0 && s.chainage <= stations[i - 1].chainage)) throw new RangeError('Station chainages must be finite, unique and strictly increasing.')
    const rows: RoadEarthworksRow[] = []
    let totalCut = 0, totalFill = 0
    for (const station of stations) {
      let section: ReturnType<typeof calculateRoadSection>
      try { section = calculateRoadSection(station, template) }
      catch (error) { throw new RangeError(`Chainage ${station.chainage}: ${message(error)}`) }
      const previous = rows.at(-1), length = previous ? station.chainage - previous.chainage : 0
      const cutVolume = previous ? endAreaVolume(previous.cutArea, section.cutArea, length) : 0
      const fillVolume = previous ? endAreaVolume(previous.fillArea, section.fillArea, length) : 0
      totalCut += cutVolume; totalFill += fillVolume
      if (![totalCut, totalFill].every(Number.isFinite)) throw new RangeError('Road volumes exceed the finite calculation range.')
      rows.push({ chainage: station.chainage, groundLevel: station.groundLevel, designLevel: station.designLevel as number,
        formationLevel: section.formationLevel, cutArea: section.cutArea, fillArea: section.fillArea,
        cutVolume, fillVolume, cumulativeCut: totalCut, cumulativeFill: totalFill,
        leftDaylightOffset: section.leftCatch.offset, rightDaylightOffset: section.rightCatch.offset,
        method: previous ? 'average-end-area' : 'origin' })
    }
    return { rows, totalCut, totalFill, issues: [] as string[] }
  } catch (error) { return { rows: [] as RoadEarthworksRow[], totalCut: null, totalFill: null, issues: [message(error)] } }
}

export function parseRoadStationsCSV(text: string): StationData[] {
  if (text.length > 10 * 1024 * 1024) throw new RangeError('Use a measured station CSV smaller than 10 MiB.')
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy',
    transformHeader: header => header.trim().toLowerCase().replace(/[\s_-]/g, '') })
  if (result.errors.length || !result.meta.fields?.includes('chainage') || !result.meta.fields.includes('groundlevel')) throw new RangeError('CSV requires chainage and ground_level columns and valid complete rows.')
  if (result.data.length > 20000) throw new RangeError('Import at most 20,000 measured station/profile rows per CSV.')
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  const number = (value: string | undefined, row: number) => {
    if (value == null || !decimal.test(value.trim()) || !Number.isFinite(Number(value))) throw new RangeError(`CSV row ${row}: enter a complete finite decimal; units and missing measurements are not accepted.`)
    return Number(value)
  }
  const rows = result.data.map((row, i) => ({ chainage: number(row.chainage, i + 2), groundLevel: number(row.groundlevel, i + 2),
    ...(row.designlevel?.trim() ? { designLevel: number(row.designlevel, i + 2) } : {}),
    ...(result.meta.fields?.includes('designlevelsource') ? { designLevelSource: row.designlevelsource?.trim() as StationData['designLevelSource'] } : {}) }))
  if (result.meta.fields.includes('designlevelsource') && rows.some(row => !['manual', 'vertical-alignment'].includes(row.designLevelSource ?? ''))) throw new RangeError('Every supplied design_level_source must be manual or vertical-alignment.')
  if (result.meta.fields.includes('offset')) {
    const groups = new Map<number, { profile: Array<{ offset: number; level: number }>; designLevel?: number; designLevelSource?: StationData['designLevelSource'] }>()
    rows.forEach((row, i) => {
      const group = groups.get(row.chainage) ?? { profile: [] }
      if (group.designLevel != null && row.designLevel != null && group.designLevel !== row.designLevel) throw new RangeError(`CSV row ${i + 2}: conflicting design levels at the same chainage.`)
      group.designLevel ??= row.designLevel
      if (group.designLevelSource != null && group.designLevelSource !== row.designLevelSource) throw new RangeError(`CSV row ${i + 2}: conflicting design level sources at the same chainage.`)
      group.designLevelSource ??= row.designLevelSource
      group.profile.push({ offset: number(result.data[i].offset, i + 2), level: row.groundLevel })
      groups.set(row.chainage, group)
    })
    if (!groups.size) throw new RangeError('Supply complete measured profile rows.')
    return [...groups].map(([chainage, group]) => {
      const groundProfile = validateProfile(group.profile)
      const groundLevel = interpolateProfile(groundProfile, 0)
      if (groundLevel === null) throw new RangeError(`Chainage ${chainage}: measured offsets must span the centreline.`)
      return { chainage, groundLevel, designLevel: group.designLevel, ...(group.designLevelSource ? { designLevelSource: group.designLevelSource } : {}), groundProfile }
    }).sort((a, b) => a.chainage - b.chainage)
  }
  if (!rows.length || new Set(rows.map(s => s.chainage)).size !== rows.length) throw new RangeError('Supply valid rows with distinct chainages.')
  return rows.sort((a, b) => a.chainage - b.chainage)
}

/** Export exactly the same fresh engineering result displayed in the workspace. */
export function buildRoadSchedules(data: RoadDesignData | null, crsCode: string, verticalDatum?: string | null) {
  const horizontal = calculateRoadHorizontal(data?.ips ?? [], data?.startChainage ?? Number.NaN, crsCode)
  const resolved = resolveRoadDesignStations(data)
  const quantities = calculateRoadEarthworks(resolved.stations, data?.crossSectionTemplate)
  const vertical = buildRoadVerticalSchedules(data)
  const setout = buildRoadCentrelineSetout(data, crsCode, verticalDatum)
  const horizontalRows = horizontal.curves.map(curve => {
    const ip = data?.ips.find(point => point.id === curve.ipId)
    return [curve.name, ip?.easting, ip?.northing, curve.radius, curve.turn, curve.deflectionAngle,
      curve.tangentLength, curve.arcLength, curve.chainageTC, curve.chainageMC, curve.chainageCT]
  })
  return {
    horizontal: { name: 'Horizontal alignment CSV', filename: 'metardu-horizontal-alignment.csv', rows: horizontalRows,
      headers: ['PI', 'Easting_m', 'Northing_m', 'Radius_m', 'Turn', 'Deflection_deg', 'Tangent_m', 'Arc_m', 'Chainage_TC_m', 'Chainage_MC_m', 'Chainage_CT_m'] },
    vertical: { name: 'Evaluated vertical curves CSV', filename: 'metardu-vertical-curves.csv', rows: vertical.curves.map(c => [c.vipId, c.type, c.gradeIn, c.gradeOut, c.length, c.k, c.pvcChainage, c.pvcLevel, c.pvtChainage, c.pvtLevel, c.engineCurve.highLowPoint?.chainage, c.engineCurve.highLowPoint?.elevation]),
      headers: ['VIP_ID', 'Type', 'Grade_in_percent', 'Grade_out_percent', 'Length_m', 'K_m_per_percent', 'PVC_chainage_m', 'PVC_RL_m', 'PVT_chainage_m', 'PVT_RL_m', 'Turning_chainage_m', 'Turning_RL_m'] },
    verticalStations: { name: 'Vertical profile design stations CSV', filename: 'metardu-vertical-profile-stations.csv', rows: vertical.stations.map(s => [s.chainage, s.elevation, s.grade, s.segment, s.vipId, verticalDatum]),
      headers: ['Chainage_m', 'Design_surface_RL_m', 'Grade_percent', 'Segment', 'Curve_VIP_ID', 'Declared_height_reference'] },
    centrelineSetout: { name: 'Centreline coordinate targets CSV', filename: 'metardu-centreline-coordinate-targets.csv', rows: setout.rows.map(s => [s.chainage, s.easting, s.northing, s.designLevel, s.formationLevel, s.bearing, s.levelSource, s.horizontalSegment, crsCode, verticalDatum, 'DRAFT']),
      headers: ['Chainage_m', 'Easting_m', 'Northing_m', 'Design_surface_RL_m', 'Formation_RL_m', 'Grid_tangent_bearing_deg', 'Level_source', 'Horizontal_segment', 'Declared_CRS', 'Declared_height_reference', 'Issue_status'] },
    earthworks: { name: 'Earthworks CSV', filename: 'metardu-earthworks.csv', rows: quantities.rows.map(row => [row.chainage, row.formationLevel, row.designLevel, row.cutArea, row.fillArea, row.cutVolume, row.fillVolume, row.cumulativeCut, row.cumulativeFill, row.leftDaylightOffset, row.rightDaylightOffset, row.method]),
      headers: ['Chainage_m', 'Formation_RL_m', 'Design_surface_RL_m', 'Cut_area_m2', 'Fill_area_m2', 'Cut_volume_m3', 'Fill_volume_m3', 'Cumulative_cut_m3', 'Cumulative_fill_m3', 'Left_daylight_offset_m', 'Right_daylight_offset_m', 'Method'] },
    profiles: { name: 'Measured ground profiles CSV', filename: 'metardu-road-ground-profiles.csv', rows: (data?.stations ?? []).flatMap(station => (station.groundProfile ?? []).map(p => [station.chainage, p.offset, p.level, station.designLevel, station.designLevelSource ?? 'manual'])),
      headers: ['chainage', 'offset', 'ground_level', 'design_level', 'design_level_source'] },
    stationLevels: { name: 'Station level schedule CSV', filename: 'metardu-station-levels.csv', rows: resolved.stations.map(station => [station.chainage, station.groundLevel, station.designLevel, station.designLevelSource ?? 'manual']),
      headers: ['Chainage_m', 'Ground_RL_m', 'Design_surface_RL_m', 'Design_level_source'] },
    issues: [...new Set([...horizontal.issues, ...quantities.issues, ...resolved.issues, ...vertical.issues, ...setout.issues])],
  }
}
