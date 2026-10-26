import type { RoadDesignData, StationData } from '@/types/engineering'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  buildRoadHorizontalGeometry,
  roadHorizontalStation,
  type ProjectHorizontalGeometry,
} from './roadCoordinateSetout'
import {
  calculateRoadVertical,
  roadVerticalStation,
  resolveRoadDesignStations,
} from './roadVerticalAlignment'
import {
  calculateRoadSection,
  roadFormationProfile,
} from './roadProjectOutputs'
import {
  calculateRoadQuantityRun,
  type QuantityReference,
  type RoadQuantityCalculation,
} from './roadQuantity'
import { validateProfile } from './profileGeometry'
import { roadGroundAssociationIssue } from './roadGroundAssociation'
type PlanPoint = NonNullable<ReturnType<typeof roadHorizontalStation>>
type ProfilePoint = NonNullable<ReturnType<typeof roadVerticalStation>>
export interface RoadWorkbenchModel {
  sourceKey: string
  road: RoadDesignData | null
  reference: QuantityReference
  horizontal: ProjectHorizontalGeometry | null
  vertical: ReturnType<typeof calculateRoadVertical>['alignment']
  plan: PlanPoint[]
  profile: ProfilePoint[]
  stations: StationData[]
  stationByChainage: ReadonlyMap<number, StationData>
  start: number | null
  end: number | null
  quantity: RoadQuantityCalculation | null
  issues: string[]
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'The road design could not be evaluated.'
/** One evaluated source for every view. Display sampling is never an export source. */
export function buildRoadWorkbenchModel(
  road: RoadDesignData | null,
  reference: QuantityReference,
): RoadWorkbenchModel {
  const model: RoadWorkbenchModel = {
    sourceKey: '',
    road,
    reference,
    horizontal: null,
    vertical: null,
    plan: [],
    profile: [],
    stations: [],
    stationByChainage: new Map(),
    start: null,
    end: null,
    quantity: null,
    issues: [],
  }
  try {
    if (!road) throw Error('Save a road design to begin the visual workspace.')
    if (
      !Array.isArray(road.ips) ||
      !Array.isArray(road.vips) ||
      !Array.isArray(road.stations)
    )
      throw Error('The saved road input lists are incomplete.')
    if (
      road.ips.length > 1000 ||
      road.vips.length > 1000 ||
      road.stations.length > 5000 ||
      road.stations.reduce((n, s) => n + (s.groundProfile?.length ?? 0), 0) >
        250000
    )
      throw Error(
        'This view supports 1,000 alignment/VIP points, 5,000 sections and 250,000 measured profile points. Retain the original job and open a bounded work package.',
      )
    model.sourceKey = canonicalJSON({ road, reference })
    if (!reference.code || reference.code !== road.coordinateSystem)
      throw Error('The road CRS must match the declared project reference.')
    if (reference.distanceMode !== 'grid')
      throw Error(
        'Declare a reduced grid distance basis before evaluating the visual road. Ground-to-grid reduction is not inferred by this workspace.',
      )
    const horizontal = buildRoadHorizontalGeometry(
      road.ips,
      road.startChainage,
      reference.code,
    )
    if (!horizontal.alignment) throw Error(horizontal.issues.join(' '))
    model.horizontal = horizontal.alignment
    model.start = horizontal.alignment.start
    model.end = horizontal.alignment.end
    const chainages = new Set<number>([model.start, model.end])
    const curves = horizontal.alignment.segments.filter(
      (s) => s.kind !== 'tangent',
    ).length
    const count = Math.max(
      4,
      Math.min(48, Math.floor(4096 / Math.max(1, curves))),
    )
    for (const s of horizontal.alignment.segments) {
      chainages.add(s.start)
      chainages.add(s.end)
      if (s.kind !== 'tangent')
        for (let i = 1; i < count; i++)
          chainages.add(s.start + ((s.end - s.start) * i) / count)
    }
    for (let i = 0; i <= 512; i++)
      chainages.add(model.start + ((model.end - model.start) * i) / 512)
    for (const s of road.stations) {
      if (
        !Number.isFinite(s.chainage) ||
        s.chainage < model.start ||
        s.chainage > model.end
      )
        throw Error(
          'A measured section lies outside the evaluated horizontal alignment. Review station chainages; no extrapolation is used.',
        )
      chainages.add(s.chainage)
    }
    if (
      road.stations.some(
        (s, i) => i > 0 && s.chainage <= road.stations[i - 1].chainage,
      )
    )
      throw Error(
        'Measured station chainages must be unique and strictly increasing.',
      )
    model.plan = [...chainages]
      .sort((a, b) => a - b)
      .flatMap((ch) => {
        const p = roadHorizontalStation(horizontal.alignment, ch)
        return p ? [p] : []
      })
    const vertical = calculateRoadVertical(road.vips)
    model.vertical = vertical.alignment
    if (vertical.alignment) {
      const v = vertical.alignment,
        chs = new Set([
          v.start,
          v.end,
          ...v.vips.map((p) => p.chainage),
          ...v.curves.flatMap((c) => [c.pvcChainage, c.pvtChainage]),
        ])
      for (let i = 0; i <= 1024; i++)
        chs.add(v.start + ((v.end - v.start) * i) / 1024)
      model.profile = [...chs]
        .sort((a, b) => a - b)
        .flatMap((ch) => {
          const p = roadVerticalStation(v, ch)
          return p ? [p] : []
        })
    } else model.issues.push(...vertical.issues)
    const resolved = resolveRoadDesignStations(road)
    const groundIssue = roadGroundAssociationIssue(road)
    model.stations = groundIssue ? [] : resolved.issues.length ? road.stations : resolved.stations
    model.stationByChainage = new Map(
      model.stations.map((s) => [s.chainage, s]),
    )
    if (resolved.issues.length) model.issues.push(...resolved.issues)
    try {
      model.quantity = calculateRoadQuantityRun(road, reference)
    } catch (e) {
      model.issues.push(message(e))
    }
  } catch (e) {
    model.issues.push(message(e))
    model.horizontal = null
    model.vertical = null
    model.plan = []
    model.profile = []
    model.quantity = null
    model.start = null
    model.end = null
  }
  model.issues = [...new Set(model.issues)]
  return model
}
export interface WorkbenchSection {
  chainage: number
  position: PlanPoint | null
  target: number | null
  targetSource: 'manual' | 'vertical-alignment' | null
  measured: boolean
  ground: Array<{ offset: number; level: number }>
  formation: Array<{ offset: number; level: number }>
  worldGround: Array<{
    offset: number
    easting: number
    northing: number
    elevation: number
  }>
  worldFormation: Array<{
    offset: number
    easting: number
    northing: number
    elevation: number
  }>
  cutArea: number | null
  fillArea: number | null
  issues: string[]
}
/** Selected chainage is evaluated exactly, independently of the plan display samples. */
export function roadWorkbenchSection(
  model: RoadWorkbenchModel,
  chainage: number,
): WorkbenchSection {
  const section: WorkbenchSection = {
    chainage,
    position: null,
    target: null,
    targetSource: null,
    measured: false,
    ground: [],
    formation: [],
    worldGround: [],
    worldFormation: [],
    cutArea: null,
    fillArea: null,
    issues: [],
  }
  try {
    if (!model.horizontal || !model.road)
      throw Error('A valid horizontal alignment is required.')
    const position = roadHorizontalStation(model.horizontal, chainage)
    if (!position)
      throw Error(
        'Selected chainage is outside the evaluated road. No extrapolation is used.',
      )
    section.position = position
    const station = model.stationByChainage.get(chainage)
    section.measured = !!station
    if (station) {
      if (
        station.designLevelSource != null &&
        !['manual', 'vertical-alignment'].includes(station.designLevelSource)
      )
        throw Error(
          'The saved station target source is unrecognized. Review the original input before using its level.',
        )
      section.targetSource = station.designLevelSource ?? 'manual'
      if (section.targetSource === 'vertical-alignment') {
        const target = model.vertical
          ? roadVerticalStation(model.vertical, chainage)
          : null
        section.target = target?.elevation ?? null
      } else
        section.target = Number.isFinite(station.designLevel)
          ? (station.designLevel as number)
          : null
      if (station.groundProfile?.length) {
        try {
          section.ground = validateProfile(station.groundProfile)
        } catch (e) {
          section.issues.push(message(e))
        }
      }
    } else if (model.vertical) {
      const target = roadVerticalStation(model.vertical, chainage)
      section.target = target?.elevation ?? null
      section.targetSource = target ? 'vertical-alignment' : null
    }
    if (section.target !== null && model.road.crossSectionTemplate) {
      section.formation = roadFormationProfile(
        model.road.crossSectionTemplate,
        section.target,
      )
      if (station) {
        try {
          const evaluated = calculateRoadSection(
            { ...station, designLevel: section.target },
            model.road.crossSectionTemplate,
          )
          section.formation = evaluated.formation
          section.cutArea = evaluated.cutArea
          section.fillArea = evaluated.fillArea
        } catch (e) {
          section.issues.push(message(e))
        }
      }
    }
    if (!station)
      section.issues.push(
        'No measured ground section exists at this chainage. Design template only; no ground or section areas are inferred.',
      )
    if (section.target === null)
      section.issues.push('The selected station has no evaluated target level.')
    if (!model.reference.verticalDatum?.trim()) {
      section.cutArea = null
      section.fillArea = null
      section.issues.push(
        'Declare the shared height reference before viewing world-space 3D levels or assessing section areas.',
      )
    } else {
      const rad = (position.bearing * Math.PI) / 180
      const world = (p: { offset: number; level: number }) => ({
        offset: p.offset,
        easting: position.easting + p.offset * Math.cos(rad),
        northing: position.northing - p.offset * Math.sin(rad),
        elevation: p.level,
      })
      section.worldGround = section.ground.map(world)
      section.worldFormation = section.formation.map(world)
    }
  } catch (e) {
    section.issues.push(message(e))
    section.formation = []
    section.worldFormation = []
    section.cutArea = null
    section.fillArea = null
  }
  return section
}
