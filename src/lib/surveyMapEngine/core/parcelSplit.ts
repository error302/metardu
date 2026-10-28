import { assertProjectedCrs, surveyArea, surveyPerimeter, type Position2D } from '@/lib/spatial/projectCrs'
import { isSimplePolygonRing, segmentsIntersect, strictPointInRing } from '@/lib/spatial/simplePolygon'

export interface ParcelSplit {
  polygon1: Position2D[]
  polygon2: Position2D[]
  area1: number
  area2: number
}

const point = ([easting, northing]: Position2D) => ({ easting, northing })
const cross = (a: Position2D, b: Position2D) => a[0] * b[1] - a[1] * b[0]
const difference = (a: Position2D, b: Position2D): Position2D => [a[0] - b[0], a[1] - b[1]]
const distance = (a: Position2D, b: Position2D) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Partition one simple, hole-free grid parcel by the actual drawn polyline.
 * Exactly two distinct boundary junctions and one interior cut path are required.
 * No cutter strip, endpoint extrapolation or coordinate rounding is introduced.
 */
export function splitSimpleParcel(parent: Position2D[], cut: Position2D[], crs: string): ParcelSplit | null {
  assertProjectedCrs(crs)
  if (parent.length < 3 || cut.length < 2 || [...parent, ...cut].some(p => p.length !== 2 || !p.every(Number.isFinite))) return null
  const ring = parent.map(([x, y]): Position2D => [x, y])
  if (distance(ring[0], ring[ring.length - 1]) === 0) ring.pop()
  if (!isSimplePolygonRing(ring.map(point))) return null
  const parentArea = surveyArea(ring, crs)
  if (!(parentArea > 0) || !Number.isFinite(parentArea)) return null
  const magnitude = [...ring, ...cut].reduce((max, p) => Math.max(max, Math.abs(p[0]), Math.abs(p[1])), 1)
  const tolerance = Math.max(1e-9, Number.EPSILON * magnitude * 32)
  const cutPoints = cut.map(point)
  for (let i = 0; i < cut.length - 1; i++) {
    if (!(distance(cut[i], cut[i + 1]) > tolerance)) return null
    for (let j = i + 1; j < cut.length - 1; j++) {
      if (j === i + 1) {
        const r = difference(cut[i + 1], cut[i]), s = difference(cut[j + 1], cut[j])
        if (Math.abs(cross(r, s)) <= tolerance * Math.hypot(...r) && r[0] * s[0] + r[1] * s[1] < 0) return null
      } else if (segmentsIntersect(cutPoints[i], cutPoints[i + 1], cutPoints[j], cutPoints[j + 1])) return null
    }
  }

  const junctions: Array<{ coordinate: Position2D; boundaryPosition: number; cutPosition: number }> = []
  for (let leg = 0; leg < cut.length - 1; leg++) {
    const a = cut[leg], r = difference(cut[leg + 1], a), rLength = Math.hypot(...r)
    for (let edge = 0; edge < ring.length; edge++) {
      const c = ring[edge], d = ring[(edge + 1) % ring.length], s = difference(d, c), sLength = Math.hypot(...s)
      const offset = difference(c, a), denominator = cross(r, s)
      const uncertainty = Number.EPSILON * 32 * (Math.abs(r[0] * s[1]) + Math.abs(r[1] * s[0]))
      if (Math.abs(denominator) <= uncertainty) {
        if (denominator !== 0) return null // Ill-conditioned near-parallel junction.
        if (Math.abs(cross(offset, r)) / rLength <= tolerance) {
          const lengthSquared = rLength * rLength
          const t0 = (offset[0] * r[0] + offset[1] * r[1]) / lengthSquared
          const endOffset = difference(d, a)
          const t1 = (endOffset[0] * r[0] + endOffset[1] * r[1]) / lengthSquared
          if ((Math.min(1, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1))) * rLength > tolerance) return null
        }
        continue
      }
      let t = cross(offset, s) / denominator
      let u = cross(offset, r) / denominator
      const tError = tolerance / rLength, uError = tolerance / sLength
      if (t < -tError || t > 1 + tError || u < -uError || u > 1 + uError) continue
      t = Math.abs(t) <= tError ? 0 : Math.abs(t - 1) <= tError ? 1 : t
      u = Math.abs(u) <= uError ? 0 : Math.abs(u - 1) <= uError ? 1 : u
      const coordinate: Position2D = u === 0 ? [...c] : u === 1 ? [...d] : [c[0] + u * s[0], c[1] + u * s[1]]
      if (!coordinate.every(Number.isFinite)) return null
      const existing = junctions.find(junction => distance(junction.coordinate, coordinate) <= tolerance)
      if (!existing) junctions.push({ coordinate, boundaryPosition: (edge + u) % ring.length, cutPosition: leg + t })
      if (junctions.length > 2) return null // The two-parcel contract must account for every resulting face.
    }
  }
  if (junctions.length !== 2) return null
  const [first, last] = junctions.sort((a, b) => a.cutPosition - b.cutPosition)
  const path: Position2D[] = [first.coordinate]
  for (let vertex = Math.floor(first.cutPosition) + 1; vertex < last.cutPosition; vertex++) path.push([...cut[vertex]])
  path.push(last.coordinate)
  const polygonPoints = ring.map(point)
  for (let i = 0; i < path.length - 1; i++) {
    const midpoint = { easting: (path[i][0] + path[i + 1][0]) / 2, northing: (path[i][1] + path[i + 1][1]) / 2 }
    if (!strictPointInRing(midpoint, polygonPoints)) return null
  }
  const boundaryArc = (start: typeof first, end: typeof first): Position2D[] => {
    const stop = end.boundaryPosition > start.boundaryPosition ? end.boundaryPosition : end.boundaryPosition + ring.length
    const arc: Position2D[] = [start.coordinate]
    for (let vertex = Math.floor(start.boundaryPosition) + 1; vertex < stop; vertex++) arc.push(ring[vertex % ring.length])
    arc.push(end.coordinate)
    return arc
  }
  const polygon1 = [...boundaryArc(first, last), ...path.slice(0, -1).reverse()]
  const polygon2 = [...boundaryArc(last, first), ...path.slice(1)]
  if (![polygon1, polygon2].every(polygon => isSimplePolygonRing(polygon.slice(0, -1).map(point)))) return null
  const area1 = surveyArea(polygon1, crs), area2 = surveyArea(polygon2, crs)
  const areaError = Math.max(parentArea * Number.EPSILON * 128, surveyPerimeter(ring, crs) * tolerance * 4)
  if (![area1, area2, areaError].every(Number.isFinite) || !(area1 > 0 && area2 > 0) || Math.abs(area1 + area2 - parentArea) > areaError) return null
  return { polygon1, polygon2, area1, area2 }
}
