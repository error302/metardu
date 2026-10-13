import Papa from 'papaparse'
import { computeHorizontalCurve, endAreaVolume } from '@/lib/engine/engineering'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import type { CrossSectionTemplate, IntersectionPoint, StationData, RoadDesignData } from '@/types/engineering'
import { computeSlopeIntercept } from './crossSectionGeometry'
import { integrateProfileAreas, interpolateProfile, validateProfile } from './profileGeometry'

const message = (error: unknown) => error instanceof Error ? error.message : 'Review the supplied road survey data.'
export interface ProjectRoadCurve {
  ipId: string; name: string; radius: number; turn: 'left' | 'right'; deflectionAngle: number;
  tangentLength: number; arcLength: number; chainageTC: number; chainageMC: number; chainageCT: number
}

export function calculateRoadHorizontal(ips: IntersectionPoint[], startChainage: number, crsCode: string) {
  const curves: ProjectRoadCurve[] = []
  try {
    if (assertProjectedCrs(crsCode).units !== 'metres') throw new RangeError('Road alignment requires a projected metre CRS.')
    if (!Number.isFinite(startChainage)) throw new RangeError('The starting chainage must be finite.')
    if (ips.length < 2) throw new RangeError('Enter at least two observed alignment endpoints; a curve requires three points.')
    if (ips.some(ip => ![ip.easting, ip.northing, ip.radius].every(Number.isFinite)) || new Set(ips.map(ip => ip.id)).size !== ips.length) throw new RangeError('Alignment points need unique IDs and finite coordinates/radii.')
    const legs = ips.slice(1).map((ip, i) => Math.hypot(ip.easting - ips[i].easting, ip.northing - ips[i].northing))
    if (legs.some(length => !Number.isFinite(length) || length <= 0)) throw new RangeError('Adjacent alignment points must have distinct coordinates and finite separation.')
    const elements = ips.map((ip, i) => {
      if (i === 0 || i === ips.length - 1) return null
      const before = ips[i - 1], after = ips[i + 1]
      const b1 = Math.atan2(ip.easting - before.easting, ip.northing - before.northing) * 180 / Math.PI
      const b2 = Math.atan2(after.easting - ip.easting, after.northing - ip.northing) * 180 / Math.PI
      const signed = ((b2 - b1 + 540) % 360) - 180
      if (Math.abs(signed) < 1e-9) return null
      if (Math.abs(signed) >= 180 - 1e-9) throw new RangeError(`${ip.name}: a reversing tangent cannot define a simple circular curve.`)
      if (ip.radius <= 0) throw new RangeError(`${ip.name}: supply a positive design radius; no default radius is used.`)
      if (ip.hasTransition || ip.transitionLengthIn || ip.transitionLengthOut) throw new RangeError(`${ip.name}: transition-curve geometry must be resolved before using a simple circular schedule.`)
      return { ...computeHorizontalCurve(ip.radius, Math.abs(signed), 0), signed }
    })
    for (let i = 0; i < legs.length; i++) {
      if ((elements[i]?.tangentLength ?? 0) + (elements[i + 1]?.tangentLength ?? 0) > legs[i] + 1e-9) throw new RangeError('Curve tangents overlap or extend beyond the observed alignment endpoints; review radii and spacing.')
    }
    let rawChainage = startChainage, correction = 0
    for (let i = 1; i < ips.length; i++) {
      rawChainage += legs[i - 1]
      if (!Number.isFinite(rawChainage)) throw new RangeError('Alignment chainages exceed the finite calculation range.')
      const curve = elements[i]
      if (!curve) continue
      const tc = rawChainage - correction - curve.tangentLength
      if (![tc, tc + curve.curveLength, curve.tangentLength, curve.curveLength].every(Number.isFinite)) throw new RangeError('Curve quantities exceed the finite calculation range.')
      curves.push({ ipId: ips[i].id, name: ips[i].name, radius: curve.radius,
        turn: curve.signed > 0 ? 'right' : 'left', deflectionAngle: curve.delta,
        tangentLength: curve.tangentLength, arcLength: curve.curveLength,
        chainageTC: tc, chainageMC: tc + curve.curveLength / 2, chainageCT: tc + curve.curveLength })
      correction += 2 * curve.tangentLength - curve.curveLength
    }
    const length = legs.reduce((sum, span) => sum + span, 0) - correction
    if (!Number.isFinite(length)) throw new RangeError('Alignment length exceeds the finite calculation range.')
    return { curves, issues: [] as string[], length }
  } catch (error) { return { curves: [] as ProjectRoadCurve[], issues: [message(error)], length: null } }
}

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
    ...(row.designlevel?.trim() ? { designLevel: number(row.designlevel, i + 2) } : {}) }))
  if (result.meta.fields.includes('offset')) {
    const groups = new Map<number, { profile: Array<{ offset: number; level: number }>; designLevel?: number }>()
    rows.forEach((row, i) => {
      const group = groups.get(row.chainage) ?? { profile: [] }
      if (group.designLevel != null && row.designLevel != null && group.designLevel !== row.designLevel) throw new RangeError(`CSV row ${i + 2}: conflicting design levels at the same chainage.`)
      group.designLevel ??= row.designLevel
      group.profile.push({ offset: number(result.data[i].offset, i + 2), level: row.groundLevel })
      groups.set(row.chainage, group)
    })
    if (!groups.size) throw new RangeError('Supply complete measured profile rows.')
    return [...groups].map(([chainage, group]) => {
      const groundProfile = validateProfile(group.profile)
      const groundLevel = interpolateProfile(groundProfile, 0)
      if (groundLevel === null) throw new RangeError(`Chainage ${chainage}: measured offsets must span the centreline.`)
      return { chainage, groundLevel, designLevel: group.designLevel, groundProfile }
    }).sort((a, b) => a.chainage - b.chainage)
  }
  if (!rows.length || new Set(rows.map(s => s.chainage)).size !== rows.length) throw new RangeError('Supply valid rows with distinct chainages.')
  return rows.sort((a, b) => a.chainage - b.chainage)
}

/** Export exactly the same fresh engineering result displayed in the workspace. */
export function buildRoadSchedules(data: RoadDesignData | null, crsCode: string) {
  const horizontal = calculateRoadHorizontal(data?.ips ?? [], data?.startChainage ?? Number.NaN, crsCode)
  const quantities = calculateRoadEarthworks(data?.stations ?? [], data?.crossSectionTemplate)
  const horizontalRows = horizontal.curves.map(curve => {
    const ip = data?.ips.find(point => point.id === curve.ipId)
    return [curve.name, ip?.easting, ip?.northing, curve.radius, curve.turn, curve.deflectionAngle,
      curve.tangentLength, curve.arcLength, curve.chainageTC, curve.chainageMC, curve.chainageCT]
  })
  return {
    horizontal: { name: 'Horizontal alignment CSV', filename: 'metardu-horizontal-alignment.csv', rows: horizontalRows,
      headers: ['PI', 'Easting_m', 'Northing_m', 'Radius_m', 'Turn', 'Deflection_deg', 'Tangent_m', 'Arc_m', 'Chainage_TC_m', 'Chainage_MC_m', 'Chainage_CT_m'] },
    earthworks: { name: 'Earthworks CSV', filename: 'metardu-earthworks.csv', rows: quantities.rows.map(row => [row.chainage, row.formationLevel, row.designLevel, row.cutArea, row.fillArea, row.cutVolume, row.fillVolume, row.cumulativeCut, row.cumulativeFill, row.leftDaylightOffset, row.rightDaylightOffset, row.method]),
      headers: ['Chainage_m', 'Formation_RL_m', 'Design_surface_RL_m', 'Cut_area_m2', 'Fill_area_m2', 'Cut_volume_m3', 'Fill_volume_m3', 'Cumulative_cut_m3', 'Cumulative_fill_m3', 'Left_daylight_offset_m', 'Right_daylight_offset_m', 'Method'] },
    profiles: { name: 'Measured ground profiles CSV', filename: 'metardu-road-ground-profiles.csv', rows: (data?.stations ?? []).flatMap(station => (station.groundProfile ?? []).map(p => [station.chainage, p.offset, p.level, station.designLevel])),
      headers: ['chainage', 'offset', 'ground_level', 'design_level'] },
    issues: [...horizontal.issues, ...quantities.issues],
  }
}
