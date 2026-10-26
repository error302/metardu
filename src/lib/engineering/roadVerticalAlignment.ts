import { computeVerticalCurve, verticalCurveElevation, verticalCurveGrade } from '@/lib/engine/engineering'
import type { VerticalIP, StationData, RoadDesignData } from '@/types/engineering'
import { roadGroundAssociationIssue } from './roadGroundAssociation'

export interface ProjectVerticalCurve {
  vipId: string; vipIndex: number; type: 'crest' | 'sag'; length: number; k: number
  gradeIn: number; gradeOut: number; pvcChainage: number; pvcLevel: number; pvtChainage: number; pvtLevel: number
  engineCurve: ReturnType<typeof computeVerticalCurve>
}
export interface ProjectVerticalAlignment { vips: VerticalIP[]; grades: number[]; curves: ProjectVerticalCurve[]; start: number; end: number }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Review the approved vertical alignment inputs.'

export function validateVerticalDraft(vips: VerticalIP[], interval?: number): void {
  if (vips.length > 1000) throw new RangeError('Use at most 1,000 vertical design points.')
  if (interval != null && (!Number.isFinite(interval) || interval <= 0)) throw new RangeError('Design station interval must be finite and positive.')
  const ids = new Set<string>(), chainages = new Set<number>()
  for (const vip of vips) {
    if (!vip.id.trim() || ids.has(vip.id.trim()) || ![vip.chainage, vip.reducedLevel].every(Number.isFinite) || chainages.has(vip.chainage)) throw new RangeError('VIPs need unique IDs/chainages and complete finite chainage/RL measurements.')
    ids.add(vip.id.trim()); chainages.add(vip.chainage)
    for (const value of [vip.curveLength, vip.kValue]) if (value != null && (!Number.isFinite(value) || value <= 0)) throw new RangeError('A supplied curve length or K must be finite and positive; leave an unknown value blank.')
  }
}

/** Evaluate the supplied symmetric parabolic design; never choose a standard K or shorten a curve. */
export function calculateRoadVertical(vips: VerticalIP[]) {
  try {
    validateVerticalDraft(vips)
    if (vips.length < 2) throw new RangeError('At least two supplied vertical design endpoints are required.')
    const ordered = [...vips].sort((a, b) => a.chainage - b.chainage)
    const endpoint = ordered[ordered.length - 1]
    if ([ordered[0], endpoint].some(p => p.kValue != null || p.curveLength != null)) throw new RangeError('Curve parameters belong to interior VIPs; add design endpoints on both sides of each curve.')
    const grades = ordered.slice(1).map((b, i) => (b.reducedLevel - ordered[i].reducedLevel) / (b.chainage - ordered[i].chainage) * 100)
    if (grades.some(grade => !Number.isFinite(grade))) throw new RangeError('Vertical grades exceed the finite calculation range.')
    const curves: ProjectVerticalCurve[] = []
    for (let i = 1; i < ordered.length - 1; i++) {
      const vip = ordered[i], gradeIn = grades[i - 1], gradeOut = grades[i], a = gradeOut - gradeIn
      const noise = 32 * Number.EPSILON * Math.max(1, Math.abs(gradeIn), Math.abs(gradeOut))
      if (Math.abs(a) <= noise) {
        if (vip.curveLength != null || vip.kValue != null) throw new RangeError(`${vip.id}: no grade change exists; remove curve parameters or review design points.`)
        continue
      }
      if (vip.curveLength == null && vip.kValue == null) throw new RangeError(`${vip.id}: supply the approved curve length or K; no automatic K is used.`)
      const length = vip.curveLength ?? (vip.kValue as number) * Math.abs(a)
      if (vip.curveLength != null && vip.kValue != null && Math.abs(length - vip.kValue * Math.abs(a)) > Math.max(1, length) * 1e-9) throw new RangeError(`${vip.id}: supplied K and curve length conflict.`)
      if (!Number.isFinite(length) || length <= 0) throw new RangeError('Vertical curve length exceeds the finite calculation range.')
      const pvcChainage = vip.chainage - length / 2, pvtChainage = vip.chainage + length / 2
      if (pvcChainage < ordered[0].chainage || pvtChainage > endpoint.chainage || pvcChainage < (curves.at(-1)?.pvtChainage ?? -Infinity)) throw new RangeError(`${vip.id}: the supplied curve overlaps another curve or extends outside the design endpoints; it is not clipped.`)
      const engineCurve = computeVerticalCurve(vip.chainage, vip.reducedLevel, gradeIn, gradeOut, length)
      const pvcLevel = verticalCurveElevation(engineCurve, pvcChainage), pvtLevel = verticalCurveElevation(engineCurve, pvtChainage), k = length / Math.abs(a)
      if (![pvcChainage, pvtChainage, pvcLevel, pvtLevel, k].every(Number.isFinite)) throw new RangeError('Vertical curve values exceed the finite calculation range.')
      curves.push({ vipId: vip.id, vipIndex: i, type: a < 0 ? 'crest' : 'sag', length, k, gradeIn, gradeOut, pvcChainage, pvcLevel, pvtChainage, pvtLevel, engineCurve })
    }
    const alignment: ProjectVerticalAlignment = { vips: ordered, grades, curves, start: ordered[0].chainage, end: endpoint.chainage }
    return { alignment, curves, issues: [] as string[] }
  } catch (error) { return { alignment: null, curves: [] as ProjectVerticalCurve[], issues: [errorText(error)] } }
}

export function roadVerticalStation(alignment: ProjectVerticalAlignment, chainage: number) {
  if (!Number.isFinite(chainage) || chainage < alignment.start || chainage > alignment.end) return null
  let low = 0, high = alignment.curves.length
  while (low < high) { const middle = Math.floor((low + high) / 2); if (alignment.curves[middle].pvtChainage < chainage) low = middle + 1; else high = middle }
  const candidate = alignment.curves[low]
  const curve = candidate && chainage >= candidate.pvcChainage && chainage <= candidate.pvtChainage ? candidate : undefined
  if (curve) {
    const elevation = verticalCurveElevation(curve.engineCurve, chainage), grade = verticalCurveGrade(curve.engineCurve, chainage)
    if (![elevation, grade].every(Number.isFinite)) throw new RangeError('Vertical curve evaluation exceeds the finite calculation range.')
    return { chainage, elevation, grade, segment: 'curve' as const, vipId: curve.vipId }
  }
  low = 1; high = alignment.vips.length - 1
  while (low < high) { const middle = Math.floor((low + high) / 2); if (alignment.vips[middle].chainage < chainage) low = middle + 1; else high = middle }
  const index = low
  const a = alignment.vips[index - 1], grade = alignment.grades[index - 1]
  const elevation = a.reducedLevel + grade / 100 * (chainage - a.chainage)
  if (!Number.isFinite(elevation)) throw new RangeError('Vertical profile level exceeds the finite calculation range.')
  return { chainage, elevation, grade, segment: 'tangent' as const, vipId: null }
}

export function resolveRoadDesignStations(road: (Pick<RoadDesignData, 'vips' | 'stations'> & Partial<Pick<RoadDesignData, 'coordinateSystem' | 'startChainage' | 'ips' | 'groundSectionAlignmentKey'>>) | null) {
  const stations = road?.stations ?? []
  if (road?.groundSectionAlignmentKey !== undefined) {
    const issue = road.ips && road.coordinateSystem != null && road.startChainage != null
      ? roadGroundAssociationIssue({ coordinateSystem: road.coordinateSystem, startChainage: road.startChainage, ips: road.ips, groundSectionAlignmentKey: road.groundSectionAlignmentKey })
      : 'Retained ground sections need their original horizontal alignment before using station targets or quantities.'
    if (issue) return { stations: [] as StationData[], issues: [issue] }
  }
  if (stations.some(s => s.designLevelSource != null && !['manual','vertical-alignment'].includes(s.designLevelSource))) return { stations: [] as StationData[], issues: ['Station target source must be manual or vertical-alignment.'] }
  if (!stations.some(s => s.designLevelSource === 'vertical-alignment')) return { stations, issues: [] as string[] }
  const computed = calculateRoadVertical(road?.vips ?? [])
  if (!computed.alignment) return { stations: [] as StationData[], issues: computed.issues }
  try {
    const resolved = stations.map(station => {
      if (station.designLevelSource !== 'vertical-alignment') return station
      const target = roadVerticalStation(computed.alignment, station.chainage)
      if (!target) throw new RangeError(`Chainage ${station.chainage}: target is outside the saved vertical design; no extrapolation is used.`)
      return { ...station, designLevel: target.elevation }
    })
    return { stations: resolved, issues: [] as string[] }
  } catch (error) { return { stations: [] as StationData[], issues: [errorText(error)] } }
}

export function buildRoadVerticalSchedules(data: RoadDesignData | null) {
  const result = calculateRoadVertical(data?.vips ?? [])
  if (!result.alignment) return { ...result, stations: [] as NonNullable<ReturnType<typeof roadVerticalStation>>[], drawing: [] as NonNullable<ReturnType<typeof roadVerticalStation>>[] }
  try {
    const alignment = result.alignment
    validateVerticalDraft(data?.vips ?? [], data?.verticalStationIntervalM)
    const critical = [...alignment.vips.map(v => v.chainage), ...alignment.curves.flatMap(c => [c.pvcChainage, c.pvtChainage, ...(c.engineCurve.highLowPoint ? [c.engineCurve.highLowPoint.chainage] : [])])]
    const chainages = new Set([...critical, ...(data?.stations ?? []).map(s => s.chainage)])
    if (data?.verticalStationIntervalM != null) {
      const n = Math.floor((alignment.end - alignment.start) / data.verticalStationIntervalM)
      if (!Number.isFinite(n) || n > 20000) throw new RangeError('Design interval creates more than 20,000 stations; increase it.')
      for (let i = 0; i <= n; i++) chainages.add(alignment.start + i * data.verticalStationIntervalM)
    }
    if (chainages.size > 30000) throw new RangeError('The design schedule exceeds 30,000 rows.')
    const stations = [...chainages].sort((a, b) => a - b).map(ch => {
      const point = roadVerticalStation(alignment, ch)
      if (!point) throw new RangeError(`Chainage ${ch}: supplied station is outside vertical design coverage.`)
      return point
    })
    const displayChainages = new Set(critical)
    alignment.curves.forEach(c => { for (let i = 0; i <= 64; i++) displayChainages.add(c.pvcChainage + c.length * i / 64) })
    const drawing = [...displayChainages].sort((a, b) => a - b).map(ch => {
      const point = roadVerticalStation(alignment, ch)
      if (!point) throw new RangeError('Display sampling is outside the supplied design.')
      return point
    })
    return { ...result, stations, drawing }
  } catch (error) { return { alignment: null, curves: [] as ProjectVerticalCurve[], stations: [] as NonNullable<ReturnType<typeof roadVerticalStation>>[], drawing: [] as NonNullable<ReturnType<typeof roadVerticalStation>>[], issues: [errorText(error)] } }
}
