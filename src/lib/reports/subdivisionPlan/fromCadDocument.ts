import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { coordinateArea } from '@/lib/engine/area'
import { resolveProjectCadCrs } from '@/lib/cad/projectCadDocument'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'
import type { PlanPoint2D, SubdivisionPortion } from './types'

export interface CadSubdivisionPortion {
  portion: SubdivisionPortion
  projectCrs: string
}

/** Only an explicit, single, closed CAD boundary in a registered metre CRS can seed a plan portion. */
export function closedSubdivisionPortionFromCad(
  document: CADDocument | null | undefined,
  label = 'A',
): CadSubdivisionPortion | null {
  if (!document?.coordinateReferenceSystem || document.beacons.length < 3) return null

  let projectCrs: string
  try {
    projectCrs = resolveProjectCadCrs(document.coordinateReferenceSystem)
  } catch {
    return null
  }

  const points = new Map<string, PlanPoint2D>()
  for (const beacon of document.beacons) {
    if (typeof beacon.easting !== 'number' || typeof beacon.northing !== 'number' || !Number.isFinite(beacon.easting) || !Number.isFinite(beacon.northing) || points.has(beacon.id)) return null
    points.set(beacon.id, { easting: beacon.easting, northing: beacon.northing })
  }
  if (document.boundaries.length !== points.size) return null

  const adjacency = new Map<string, Array<{ edgeId: string; nextId: string }>>()
  for (const beaconId of points.keys()) adjacency.set(beaconId, [])
  for (const boundary of document.boundaries) {
    if (boundary.fromId === boundary.toId || !points.has(boundary.fromId) || !points.has(boundary.toId)) return null
    const from = adjacency.get(boundary.fromId)
    const to = adjacency.get(boundary.toId)
    if (!from || !to) return null
    from.push({ edgeId: boundary.id, nextId: boundary.toId })
    to.push({ edgeId: boundary.id, nextId: boundary.fromId })
  }
  if (Array.from(adjacency.values()).some((edges) => edges.length !== 2)) return null

  const startId = document.beacons[0].id
  const orderedIds = [startId]
  const usedEdges = new Set<string>()
  let currentId = startId
  let previousEdge: string | undefined
  for (let index = 0; index < points.size; index += 1) {
    const next = adjacency.get(currentId)?.find((edge) => edge.edgeId !== previousEdge && !usedEdges.has(edge.edgeId))
    if (!next) return null
    usedEdges.add(next.edgeId)
    previousEdge = next.edgeId
    currentId = next.nextId
    if (index < points.size - 1) {
      if (currentId === startId || orderedIds.includes(currentId)) return null
      orderedIds.push(currentId)
    }
  }
  if (currentId !== startId || usedEdges.size !== document.boundaries.length || orderedIds.length !== points.size) return null

  const boundaryPoints: PlanPoint2D[] = []
  for (const id of orderedIds) {
    const point = points.get(id)
    if (!point) return null
    boundaryPoints.push(point)
  }
  if (!isSimplePolygonRing(boundaryPoints)) return null
  const area = coordinateArea(boundaryPoints)
  if (!(area.areaSqm > 0) || !Number.isFinite(area.areaHa)) return null

  return {
    projectCrs,
    portion: {
      id: 'A',
      label,
      areaHa: area.areaHa,
      areaSqM: area.areaSqm,
      boundaryPoints,
    },
  }
}
