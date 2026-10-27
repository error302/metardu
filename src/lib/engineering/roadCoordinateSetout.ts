import type { IntersectionPoint, RoadDesignData } from '@/types/engineering'
import { calculateRoadHorizontal } from './roadHorizontalAlignment'
import { buildRoadVerticalSchedules, resolveRoadDesignStations } from './roadVerticalAlignment'
import { stationAtDistance, type SpiralAlignmentResult } from '@/lib/survey/curves/spiralAlignment'

interface Point { easting: number; northing: number }
interface LineSegment { kind: 'tangent'; start: number; end: number; from: Point; to: Point; direction: Point }
interface CurveSegment { kind: 'circular'; start: number; end: number; from: Point; to: Point; direction: Point; centre: Point; radius: number; turn: number }
interface TransitionSegment { kind: 'spiral-circular-spiral'; start: number; end: number; spiral: SpiralAlignmentResult }
export interface ProjectHorizontalGeometry { segments: Array<LineSegment | CurveSegment | TransitionSegment>; start: number; end: number }
const text = (error: unknown) => error instanceof Error ? error.message : 'Review the supplied route geometry.'

export function buildRoadHorizontalGeometry(ips: IntersectionPoint[], startChainage: number, crsCode: string) {
  const computed = calculateRoadHorizontal(ips, startChainage, crsCode)
  if (computed.issues.length || computed.length == null) return { alignment: null, issues: computed.issues }
  try {
    if (ips.length > 1000) throw new RangeError('Use at most 1,000 horizontal alignment points per route.')
    const segments: ProjectHorizontalGeometry['segments'] = []
    let position: Point = ips[0], chainage = startChainage
    const lineTo = (to: Point, end: number) => {
      const length = Math.hypot(to.easting - position.easting, to.northing - position.northing)
      if (length > 1e-9) {
        if (Math.abs((end - chainage) - length) > Math.max(1, length) * 1e-8) throw new RangeError('Route chainage and tangent geometry do not agree.')
        segments.push({ kind: 'tangent', start: chainage, end, from: position, to,
          direction: { easting: (to.easting - position.easting) / length, northing: (to.northing - position.northing) / length } })
      }
      position = to; chainage = end
    }
    for (let i = 1; i < ips.length - 1; i++) {
      const pi = ips[i], curve = computed.curves.find(c => c.ipId === pi.id)
      if (!curve) continue
      if (curve.spiralAlignment) {
        const spiral = curve.spiralAlignment
        if (!spiral.tsCoord || !spiral.stCoord) throw new RangeError('Transition world coordinates could not be resolved.')
        lineTo(spiral.tsCoord, spiral.tsChainage)
        segments.push({ kind: 'spiral-circular-spiral', start: spiral.tsChainage, end: spiral.stChainage, spiral })
        position = spiral.stCoord; chainage = spiral.stChainage
        continue
      }
      const previous = ips[i - 1], next = ips[i + 1]
      const beforeLength = Math.hypot(pi.easting - previous.easting, pi.northing - previous.northing), afterLength = Math.hypot(next.easting - pi.easting, next.northing - pi.northing)
      const direction = { easting: (pi.easting - previous.easting) / beforeLength, northing: (pi.northing - previous.northing) / beforeLength }
      const outgoing = { easting: (next.easting - pi.easting) / afterLength, northing: (next.northing - pi.northing) / afterLength }
      const from = { easting: pi.easting - direction.easting * curve.tangentLength, northing: pi.northing - direction.northing * curve.tangentLength }
      const to = { easting: pi.easting + outgoing.easting * curve.tangentLength, northing: pi.northing + outgoing.northing * curve.tangentLength }
      lineTo(from, curve.chainageTC)
      const turn = curve.turn === 'right' ? 1 : -1
      const centre = { easting: from.easting + turn * curve.radius * direction.northing, northing: from.northing - turn * curve.radius * direction.easting }
      segments.push({ kind: 'circular', start: curve.chainageTC, end: curve.chainageCT, from, to, centre, direction, radius: curve.radius, turn })
      position = to; chainage = curve.chainageCT
    }
    const end = startChainage + computed.length
    lineTo(ips[ips.length - 1], end)
    if (!Number.isFinite(end) || !segments.length) throw new RangeError('The route has no finite usable geometry.')
    return { alignment: { segments, start: startChainage, end } as ProjectHorizontalGeometry, issues: [] as string[] }
  } catch (error) { return { alignment: null, issues: [text(error)] } }
}

export function roadHorizontalStation(alignment: ProjectHorizontalGeometry, chainage: number) {
  if (!Number.isFinite(chainage) || chainage < alignment.start || chainage > alignment.end) return null
  let low = 0, high = alignment.segments.length - 1
  while (low < high) { const mid = Math.floor((low + high) / 2); if (alignment.segments[mid].end < chainage) low = mid + 1; else high = mid }
  const segment = alignment.segments[low], distance = chainage - segment.start
  if (segment.kind === 'spiral-circular-spiral') {
    // At the exact end use the engine's distance, avoiding subtraction drift.
    const station = stationAtDistance(segment.spiral, chainage === segment.end ? segment.spiral.totalLength : distance)
    if (!station) throw new RangeError('Unable to resolve the requested transition station.')
    return { chainage, easting: station.easting, northing: station.northing, bearing: station.tangentBearingDeg, segment: station.segment }
  }
  let point: Point, direction = segment.direction
  if (segment.kind === 'tangent') point = { easting: segment.from.easting + distance * direction.easting, northing: segment.from.northing + distance * direction.northing }
  else {
    const angle = -segment.turn * distance / segment.radius, c = Math.cos(angle), s = Math.sin(angle)
    const e = segment.from.easting - segment.centre.easting, n = segment.from.northing - segment.centre.northing
    point = { easting: segment.centre.easting + e * c - n * s, northing: segment.centre.northing + e * s + n * c }
    direction = { easting: direction.easting * c - direction.northing * s, northing: direction.easting * s + direction.northing * c }
  }
  const bearing = (Math.atan2(direction.easting, direction.northing) * 180 / Math.PI + 360) % 360
  if (![point.easting, point.northing, bearing].every(Number.isFinite)) throw new RangeError('Route coordinates exceed the finite calculation range.')
  return { chainage, ...point, bearing, segment: segment.kind }
}

export type RoadDerivativeSide = 'before' | 'after'
/** Signed d(bearing radians)/d(grid chainage); positive for a right turn.
 * Simple circular PC/PT curvature jumps require an explicit one-sided request.
 * The outward derivative at a route endpoint is unknown, never extrapolated.
 */
export function roadHorizontalCurvature(alignment: ProjectHorizontalGeometry, chainage: number, side: RoadDerivativeSide): number | null {
  if (side !== 'before' && side !== 'after') throw new RangeError('Choose the before or after side for the requested road derivative.')
  if (!Number.isFinite(chainage) || chainage < alignment.start || chainage > alignment.end || !alignment.segments.length) return null
  let low = 0, high = alignment.segments.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2), end = alignment.segments[mid].end
    if (side === 'before' ? end < chainage : end <= chainage) low = mid + 1
    else high = mid
  }
  const segment = alignment.segments[low]
  if (side === 'before' ? chainage <= segment.start || chainage > segment.end : chainage < segment.start || chainage >= segment.end) return null
  let curvature = 0
  if (segment.kind === 'circular') curvature = segment.turn / segment.radius
  else if (segment.kind === 'spiral-circular-spiral') {
    const { input, totalLength, Lc } = segment.spiral, ls = input.spiralLength
    const distance = chainage === segment.end ? totalLength : chainage - segment.start
    const fraction = ls > 0 ? Math.min(1, distance / ls, (totalLength - distance) / ls) : 1
    if (distance < 0 || distance > totalLength || Lc < 0 || fraction < 0) throw new RangeError('The transition derivative lacks consistent retained geometry.')
    curvature = Math.sign(input.intersectionAngleDeg) * fraction / input.radius
  }
  if (!Number.isFinite(curvature)) throw new RangeError('Road curvature exceeds the finite calculation range.')
  return curvature === 0 ? 0 : curvature
}

export interface CentrelineSetoutRow { chainage: number; easting: number; northing: number; bearing: number; designLevel: number; formationLevel: number | null; levelSource: 'manual' | 'vertical-alignment'; horizontalSegment: 'tangent' | 'circular' | 'entry-spiral' | 'exit-spiral' }
export function buildRoadCentrelineSetout(data: RoadDesignData | null, crsCode: string, verticalDatum?: string | null) {
  try {
    if (!data) throw new RangeError('Save the supplied horizontal/vertical design and target stations.')
    if (!verticalDatum?.trim()) throw new RangeError('Declare the height datum/benchmark reference before exporting 3D centreline targets.')
    const horizontal = buildRoadHorizontalGeometry(data.ips, data.startChainage, crsCode)
    if (!horizontal.alignment) throw new RangeError(horizontal.issues.join(' '))
    const resolved = resolveRoadDesignStations(data)
    if (resolved.issues.length) throw new RangeError(resolved.issues.join(' '))
    const targets = new Map<number, { level: number | undefined; source: 'manual' | 'vertical-alignment' }>()
    if (new Set(resolved.stations.map(s => s.chainage)).size !== resolved.stations.length) throw new RangeError('Target station chainages must be unique.')
    if (data.verticalStationIntervalM != null) {
      const vertical = buildRoadVerticalSchedules(data)
      if (vertical.issues.length) throw new RangeError(vertical.issues.join(' '))
      vertical.stations.forEach(s => targets.set(s.chainage, { level: s.elevation, source: 'vertical-alignment' }))
    }
    for (const station of resolved.stations) {
      targets.set(station.chainage, { level: station.designLevel, source: station.designLevelSource ?? 'manual' })
    }
    if (!targets.size) throw new RangeError('Supply target stations or an explicit vertical design interval.')
    const rows: CentrelineSetoutRow[] = [...targets].sort((a, b) => a[0] - b[0]).map(([chainage, target]) => {
      const point = roadHorizontalStation(horizontal.alignment, chainage)
      if (!point) throw new RangeError(`Chainage ${chainage}: target lies outside horizontal route coverage; no extrapolation is used.`)
      if (!Number.isFinite(target.level)) throw new RangeError(`Chainage ${chainage}: enter a manual target RL or explicitly select the saved vertical alignment.`)
      const depth = data.crossSectionTemplate?.subgradeDepth
      const formationLevel = depth != null && Number.isFinite(depth) && depth >= 0 ? (target.level as number) - depth : null
      if (formationLevel != null && !Number.isFinite(formationLevel)) throw new RangeError('Formation level exceeds the finite calculation range.')
      return { chainage, easting: point.easting, northing: point.northing, bearing: point.bearing, designLevel: target.level as number, formationLevel,
        levelSource: target.source, horizontalSegment: point.segment }
    })
    return { rows, issues: [] as string[] }
  } catch (error) { return { rows: [] as CentrelineSetoutRow[], issues: [text(error)] } }
}
