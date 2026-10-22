import type { RoadFieldFeatureCode, RoadFieldPlan } from '@/types/engineering'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { formatChainageLabel } from '@/lib/formatChainage'

export const ROAD_FIELD_CODE_OPTIONS: ReadonlyArray<{
  code: RoadFieldFeatureCode
  label: string
}> = [
  { code: 'CL', label: 'Centreline' },
  { code: 'LE', label: 'Left road edge' },
  { code: 'RE', label: 'Right road edge' },
  { code: 'SHL', label: 'Left shoulder' },
  { code: 'SHR', label: 'Right shoulder' },
  { code: 'DITCH_L', label: 'Left ditch' },
  { code: 'DITCH_R', label: 'Right ditch' },
  { code: 'CULV_IN', label: 'Culvert inlet' },
  { code: 'CULV_OUT', label: 'Culvert outlet' },
  { code: 'ACCESS', label: 'Access / junction' },
  { code: 'BREAKLINE', label: 'Terrain breakline' },
]

const VALID_CODES = new Set(ROAD_FIELD_CODE_OPTIONS.map(({ code }) => code))
const MAX_ROAD_FIELD_STATIONS = 10_000

/** Extract only an explicit, registered projected EPSG code; never infer from a zone label. */
export function resolveRoadFieldPlanCrsCode(value: string): string | null {
  const match = /\bEPSG:\s*(\d{4,6})\b/i.exec(value)
  if (!match) return null
  try {
    return assertProjectedCrs(`EPSG:${match[1]}`).code
  } catch {
    return null
  }
}

export function roadFieldPlanCrsIsBoundToProject(value: string, projectCrsCode: string | null | undefined): boolean {
  return !!projectCrsCode && resolveRoadFieldPlanCrsCode(value) === projectCrsCode
}

export interface RoadFieldPlanDraft {
  startChainageM: number | null
  endChainageM: number | null
  stationIntervalM: number | null
  leftExtentM: number | null
  rightExtentM: number | null
  projectCrs: string
  controlReference: string
  featureCodes: RoadFieldFeatureCode[]
}

export function validateRoadFieldPlan(plan: RoadFieldPlanDraft): string | null {
  if (plan.startChainageM === null || !Number.isFinite(plan.startChainageM) || plan.startChainageM < 0) {
    return 'Enter a valid start chainage (0 or greater).'
  }
  if (plan.endChainageM === null || !Number.isFinite(plan.endChainageM) || plan.endChainageM < plan.startChainageM) {
    return 'End chainage must be equal to or greater than the start chainage.'
  }
  if (plan.stationIntervalM === null || !Number.isFinite(plan.stationIntervalM) || plan.stationIntervalM < 0.001) {
    return 'Enter a station interval of at least 0.001 m; road chainage is recorded to the nearest millimetre.'
  }
  if (!plan.projectCrs.trim()) {
    return 'Enter the approved project CRS before opening field collection.'
  }
  if (!plan.controlReference.trim()) {
    return 'Enter the project control or benchmark ID and source before opening field collection.'
  }
  for (const [label, value] of [['Left', plan.leftExtentM], ['Right', plan.rightExtentM]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return `${label} survey extent must be zero or greater.`
    }
  }
  if (plan.featureCodes.length === 0) return 'Select at least one feature code for the field crew.'
  if (plan.featureCodes.some(code => !VALID_CODES.has(code))) return 'The plan contains an unsupported feature code.'
  if (plan.featureCodes.length > new Set(plan.featureCodes).size) return 'Remove duplicate feature codes.'

  const intervalCount = Math.floor((plan.endChainageM - plan.startChainageM) / plan.stationIntervalM) + 1
  const lastRegularStation = plan.startChainageM + (intervalCount - 1) * plan.stationIntervalM
  const includesEnd = plan.endChainageM - lastRegularStation > 1e-8
  if (intervalCount + (includesEnd ? 1 : 0) > MAX_ROAD_FIELD_STATIONS) {
    return `The plan exceeds ${MAX_ROAD_FIELD_STATIONS.toLocaleString()} stations. Increase the interval or shorten the chainage range.`
  }
  return null
}

export function buildRoadFieldStations(plan: RoadFieldPlan): number[] {
  const draft: RoadFieldPlanDraft = plan
  if (validateRoadFieldPlan(draft)) return []

  const stations: number[] = []
  const span = plan.endChainageM - plan.startChainageM
  const count = Math.floor(span / plan.stationIntervalM)
  const appendStation = (chainage: number) => {
    const rounded = Number(chainage.toFixed(3))
    if (stations.length === 0 || Math.abs(stations[stations.length - 1] - rounded) > 1e-8) stations.push(rounded)
  }
  for (let index = 0; index <= count; index += 1) {
    appendStation(plan.startChainageM + index * plan.stationIntervalM)
  }
  if (stations.length === 0) appendStation(plan.startChainageM)
  if (Math.abs(stations[stations.length - 1] - plan.endChainageM) > 1e-8) {
    appendStation(plan.endChainageM)
  }
  return stations
}

export interface RoadCaptureRecord {
  notes?: string | null
}

export interface RoadStationCaptureStatus {
  chainageM: number
  pointCount: number
  capturedFeatureCodes: RoadFieldFeatureCode[]
}

/**
 * Summarize only points whose saved road metadata matches a planned station
 * and a feature code selected for this job. This is a capture indicator, not
 * a completeness or survey-quality assessment.
 */
export function summarizeRoadStationCaptures(
  stations: readonly number[],
  featureCodes: readonly RoadFieldFeatureCode[],
  observations: readonly RoadCaptureRecord[],
): RoadStationCaptureStatus[] {
  const stationIndexByMillimetre = new Map<number, number>()
  stations.forEach((chainage, index) => {
    stationIndexByMillimetre.set(Math.round(chainage * 1000), index)
  })

  const pointCounts = stations.map(() => 0)
  const capturedCodes = stations.map(() => new Set<RoadFieldFeatureCode>())
  const allowedCodes = new Set(featureCodes)

  for (const observation of observations) {
    if (typeof observation.notes !== 'string') continue
    const codeMatch = /(?:^|;\s*)ROAD_CODE=([^;]*)/.exec(observation.notes)
    const chainageMatch = /(?:^|;\s*)CHAINAGE_M=([^;]*)/.exec(observation.notes)
    const code = codeMatch?.[1]?.trim() as RoadFieldFeatureCode | undefined
    const chainageText = chainageMatch?.[1]?.trim()
    if (!code || !allowedCodes.has(code) || !chainageText) continue
    const chainage = Number(chainageText)
    if (!Number.isFinite(chainage)) continue

    const stationIndex = stationIndexByMillimetre.get(Math.round(chainage * 1000))
    if (stationIndex === undefined || Math.abs(stations[stationIndex] - chainage) > 0.0005) continue

    pointCounts[stationIndex] += 1
    capturedCodes[stationIndex].add(code)
  }

  return stations.map((chainageM, index) => ({
    chainageM,
    pointCount: pointCounts[index],
    capturedFeatureCodes: featureCodes.filter(code => capturedCodes[index].has(code)),
  }))
}

export function formatRoadChainage(chainageM: number): string {
  return formatChainageLabel(chainageM)
}

export function parseRoadFieldPlan(value: unknown): RoadFieldPlan | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<Record<keyof RoadFieldPlan, unknown>>
  const codes = candidate.featureCodes
  if (!Array.isArray(codes) || codes.some(code => typeof code !== 'string' || !VALID_CODES.has(code as RoadFieldFeatureCode))) {
    return null
  }
  const optionalExtent = (extent: unknown) => extent === null
    ? null
    : typeof extent === 'number' && Number.isFinite(extent)
      ? extent
      : undefined
  const leftExtentM = optionalExtent(candidate.leftExtentM)
  const rightExtentM = optionalExtent(candidate.rightExtentM)
  if (leftExtentM === undefined || rightExtentM === undefined) return null
  if (typeof candidate.startChainageM !== 'number'
    || typeof candidate.endChainageM !== 'number'
    || typeof candidate.stationIntervalM !== 'number'
    || typeof candidate.projectCrs !== 'string'
    || typeof candidate.controlReference !== 'string') return null

  const plan: RoadFieldPlan = {
    startChainageM: candidate.startChainageM,
    endChainageM: candidate.endChainageM,
    stationIntervalM: candidate.stationIntervalM,
    leftExtentM,
    rightExtentM,
    projectCrs: candidate.projectCrs,
    controlReference: candidate.controlReference,
    featureCodes: codes as RoadFieldFeatureCode[],
  }
  return validateRoadFieldPlan(plan) ? null : plan
}
