export interface BoundaryCoordinate {
  id: string
  easting?: number
  northing?: number
}

export interface BoundarySpec {
  id: string
  fromId: string
  toId: string
  type: 'standard' | 'road' | 'water' | 'fence'
  roadLabel?: string
}

function toBearingDms(eastingDelta: number, northingDelta: number): { degrees: number; label: string } {
  const degrees = (Math.atan2(eastingDelta, northingDelta) * 180 / Math.PI + 360) % 360
  const totalSeconds = Math.round(degrees * 3600) % (360 * 3600)
  const wholeDegrees = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return {
    degrees,
    label: `${wholeDegrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`,
  }
}

/** Canvas Y points down; a zero-length preview has no bearing. */
export function getCadCanvasBearing(dx: number, dy: number): { totalDeg: number | undefined; formatted: string } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Bearing components must be finite.')
  if (dx === 0 && dy === 0) return { totalDeg: undefined, formatted: '—' }
  const bearing = toBearingDms(dx, -dy)
  return { totalDeg: bearing.degrees, formatted: bearing.label }
}

/** Drafting-space measurements use only an explicitly supplied metric scale. */
export function measureCadCanvasSegment(from: {x:number;y:number}, to: {x:number;y:number}, metersPerPixel?: number): {bearing:string;bearingDeg:number|undefined;distance:string;distanceM:number|undefined} {
  if (![from.x,from.y,to.x,to.y].every(Number.isFinite)) throw new RangeError('Drawing endpoints must be finite.')
  if (metersPerPixel!==undefined && (!Number.isFinite(metersPerPixel) || metersPerPixel<=0)) throw new RangeError('Drawing scale must be finite and positive.')
  const dx=to.x-from.x; const dy=to.y-from.y
  const bearing=getCadCanvasBearing(dx,dy)
  const distanceM=metersPerPixel===undefined?undefined:Math.hypot(dx,dy)*metersPerPixel
  if (distanceM!==undefined && !Number.isFinite(distanceM)) throw new RangeError('Drawing distance exceeds finite limits.')
  return {bearing:bearing.formatted,bearingDeg:bearing.totalDeg,distance:distanceM?.toFixed(3)??'Uncalibrated',distanceM}
}

/** Derive whole-circle bearing and horizontal distance from endpoint coordinates. */
export function deriveBoundaryMeasurements(
  beacons: BoundaryCoordinate[],
  specs: BoundarySpec[],
): Array<BoundarySpec & { bearing: string; bearingDeg: number; distance: string; distanceM: number }> {
  const points = new Map<string, BoundaryCoordinate>()
  for (const point of beacons) {
    if (points.has(point.id)) throw new RangeError(`Duplicate point identity: ${point.id}`)
    points.set(point.id, point)
  }
  return specs.map(spec => {
    const from = points.get(spec.fromId)
    const to = points.get(spec.toId)
    if (!from || !to || from.easting == null || from.northing == null || to.easting == null || to.northing == null) {
      throw new Error(`Boundary ${spec.id} is missing endpoint coordinates`)
    }
    if (![from.easting, from.northing, to.easting, to.northing].every(Number.isFinite)) throw new RangeError(`Boundary ${spec.id} has nonfinite endpoint coordinates.`)
    const dE = to.easting - from.easting
    const dN = to.northing - from.northing
    const distanceM = Math.hypot(dE, dN)
    if (!Number.isFinite(distanceM)) throw new RangeError(`Boundary ${spec.id} exceeds finite measurement limits.`)
    if (distanceM === 0) throw new RangeError(`Boundary ${spec.id} has coincident endpoints; its bearing is undefined.`)
    const bearing = toBearingDms(dE, dN)
    return {
      ...spec,
      bearing: bearing.label,
      bearingDeg: bearing.degrees,
      distance: distanceM.toFixed(2),
      distanceM,
    }
  })
}
