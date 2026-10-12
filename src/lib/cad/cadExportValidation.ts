import type { CADDocument, CADBeacon } from '@/components/cad-editor/CADEditor'
import { parseCadDocument } from './cadDocumentValidation'
import { hasCadReferenceFrame } from './cadReferenceFrame'
import { cadCanvasToProject, resolveProjectCadCrs } from './projectCadDocument'
import { deriveBoundaryMeasurements } from '@/lib/cadGeometry'

export function validateCadExportDocument(document: CADDocument): CADDocument {
  const doc = parseCadDocument(document)
  if (!doc) throw new RangeError('The drawing contains invalid or incomplete records. Correct them before export.')
  for (const point of doc.beacons) {
    if ((point.easting === undefined) !== (point.northing === undefined)) throw new RangeError(`Point ${point.label} needs both Easting and Northing before export.`)
  }
  if (doc.coordinateReferenceSystem) resolveProjectCadCrs(doc.coordinateReferenceSystem)
  return doc
}

/** Validate the declared frame and regenerate labels from authoritative endpoint coordinates. */
type ReferencedCadDocument = Omit<CADDocument, 'beacons' | 'metersPerPixel' | 'originEasting' | 'originNorthing'> & {
  beacons: Array<CADBeacon & { easting: number; northing: number }>
  metersPerPixel: number; originEasting: number; originNorthing: number
}

export function prepareCadSurveyExport(document: CADDocument): ReferencedCadDocument {
  const doc = validateCadExportDocument(document)
  if (!hasCadReferenceFrame(doc)) throw new RangeError('Apply Coordinate reference settings with a projected metre CRS, scale and anchor before survey drawing export.')
  const beacons = doc.beacons.map(point => {
    if (point.easting === undefined || point.northing === undefined) throw new RangeError(`Assign grid coordinates to point ${point.label} before survey drawing export.`)
    const grid = cadCanvasToProject(point.x, point.y, doc.originEasting, doc.originNorthing, doc.height, doc.metersPerPixel)
    const tolerance = Math.max(1e-6, Math.abs(point.easting) * Number.EPSILON * 16, Math.abs(point.northing) * Number.EPSILON * 16)
    if (Math.hypot(grid.easting - point.easting, grid.northing - point.northing) > tolerance) throw new RangeError('Apply Coordinate reference settings to align the drawing with its supplied controls before export.')
    return { ...point, easting: point.easting, northing: point.northing }
  })
  const measurements = deriveBoundaryMeasurements(beacons, doc.boundaries)
  return { ...doc, beacons, boundaries: measurements.map(edge => ({ ...edge, distance: edge.distanceM.toFixed(3) })) }
}
