export interface SimplePolygonPoint {
  easting: number
  northing: number
}

function orientation(a: SimplePolygonPoint, b: SimplePolygonPoint, c: SimplePolygonPoint): number {
  return (b.easting - a.easting) * (c.northing - a.northing)
    - (b.northing - a.northing) * (c.easting - a.easting)
}

function onSegment(a: SimplePolygonPoint, b: SimplePolygonPoint, point: SimplePolygonPoint): boolean {
  const epsilon = 1e-9
  return point.easting >= Math.min(a.easting, b.easting) - epsilon
    && point.easting <= Math.max(a.easting, b.easting) + epsilon
    && point.northing >= Math.min(a.northing, b.northing) - epsilon
    && point.northing <= Math.max(a.northing, b.northing) + epsilon
}

export function segmentsIntersect(
  a: SimplePolygonPoint,
  b: SimplePolygonPoint,
  c: SimplePolygonPoint,
  d: SimplePolygonPoint,
): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
    && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true
  return (Math.abs(o1) <= 1e-9 && onSegment(a, b, c))
    || (Math.abs(o2) <= 1e-9 && onSegment(a, b, d))
    || (Math.abs(o3) <= 1e-9 && onSegment(c, d, a))
    || (Math.abs(o4) <= 1e-9 && onSegment(c, d, b))
}

/** Validate an implicitly closed planar ring with finite, distinct vertices. */
export function isSimplePolygonRing(points: readonly SimplePolygonPoint[]): boolean {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.easting) || !Number.isFinite(point.northing))) return false

  const epsilon = 1e-9
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (Math.hypot(current.easting - next.easting, current.northing - next.northing) <= epsilon) return false
    for (let other = index + 1; other < points.length; other += 1) {
      if (Math.hypot(current.easting - points[other].easting, current.northing - points[other].northing) <= epsilon) return false
    }
  }

  const reference = points[0]
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    const e1 = point.easting - reference.easting
    const n1 = point.northing - reference.northing
    const e2 = next.easting - reference.easting
    const n2 = next.northing - reference.northing
    return sum + e1 * n2 - e2 * n1
  }, 0)
  if (Math.abs(twiceArea) <= epsilon) return false

  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      if (firstNext === second || secondNext === first) continue
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return false
    }
  }
  return true
}

/** Find a point inside a simple ring for labels; unlike a vertex average this stays inside concave parcels. */
export function polygonInteriorPoint(points: readonly SimplePolygonPoint[]): SimplePolygonPoint | null {
  if (!isSimplePolygonRing(points)) return null
  const ordinates = Array.from(new Set(points.map((point) => point.northing))).sort((a, b) => a - b)
  let best: { point: SimplePolygonPoint; width: number } | null = null

  for (let index = 0; index < ordinates.length - 1; index += 1) {
    const northing = (ordinates[index] + ordinates[index + 1]) / 2
    const crossings: number[] = []
    for (let edge = 0; edge < points.length; edge += 1) {
      const start = points[edge]
      const end = points[(edge + 1) % points.length]
      if ((start.northing > northing) === (end.northing > northing)) continue
      const fraction = (northing - start.northing) / (end.northing - start.northing)
      crossings.push(start.easting + fraction * (end.easting - start.easting))
    }
    crossings.sort((a, b) => a - b)
    for (let crossing = 0; crossing + 1 < crossings.length; crossing += 2) {
      const width = crossings[crossing + 1] - crossings[crossing]
      if (width > 0 && (!best || width > best.width)) {
        best = { point: { easting: (crossings[crossing] + crossings[crossing + 1]) / 2, northing }, width }
      }
    }
  }
  return best?.point || null
}

export function strictPointInRing(point: SimplePolygonPoint, ring: readonly SimplePolygonPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[index]
    const end = ring[previous]
    const crosses = (start.northing > point.northing) !== (end.northing > point.northing)
      && point.easting < (end.easting - start.easting) * (point.northing - start.northing)
        / (end.northing - start.northing) + start.easting
    if (crosses) inside = !inside
  }
  return inside
}

function properSegmentsCross(
  a: SimplePolygonPoint,
  b: SimplePolygonPoint,
  c: SimplePolygonPoint,
  d: SimplePolygonPoint,
): boolean {
  const first = orientation(a, b, c)
  const second = orientation(a, b, d)
  const third = orientation(c, d, a)
  const fourth = orientation(c, d, b)
  return ((first > 1e-9 && second < -1e-9) || (first < -1e-9 && second > 1e-9))
    && ((third > 1e-9 && fourth < -1e-9) || (third < -1e-9 && fourth > 1e-9))
}

/** True only when polygon interiors overlap; shared parcel edges remain valid. */
export function hasPolygonInteriorOverlap(rings: readonly (readonly SimplePolygonPoint[])[]): boolean {
  for (let first = 0; first < rings.length; first += 1) {
    const a = rings[first]
    if (!isSimplePolygonRing(a)) return true
    for (let second = first + 1; second < rings.length; second += 1) {
      const b = rings[second]
      if (!isSimplePolygonRing(b)) return true
      const aInterior = polygonInteriorPoint(a)
      const bInterior = polygonInteriorPoint(b)
      if ((aInterior && strictPointInRing(aInterior, b)) || (bInterior && strictPointInRing(bInterior, a))) return true
      for (let edgeA = 0; edgeA < a.length; edgeA += 1) {
        for (let edgeB = 0; edgeB < b.length; edgeB += 1) {
          if (properSegmentsCross(a[edgeA], a[(edgeA + 1) % a.length], b[edgeB], b[(edgeB + 1) % b.length])) return true
        }
      }
    }
  }
  return false
}
