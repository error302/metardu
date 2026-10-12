import type { CADDocument, CADBackgroundImage } from '@/components/cad-editor/CADEditor'
import { cadCanvasToProject, projectToCadCanvas, resolveProjectCadCrs } from './projectCadDocument'
import { parseCadDocument } from './cadDocumentValidation'
import { deriveBoundaryMeasurements } from '@/lib/cadGeometry'
import { CrsError } from '@/lib/spatial/projectCrs'

type Point = { x: number; y: number }
export interface CadReferenceSettings {
  coordinateReferenceSystem: string
  metersPerPixel: number
  anchorId: string
  easting: number
  northing: number
}

export function cadReferenceErrorMessage(failure: unknown): string {
  if (failure instanceof CrsError) {
    switch (failure.code) {
      case 'CRS_DISPLAY_ONLY_FOR_SURVEY': return 'This CRS is for map display. Choose the projected survey CRS used by your project.'
      case 'CRS_NOT_PROJECTED': return 'This CRS uses latitude/longitude. Choose a projected project CRS measured in metres.'
      case 'CRS_UNREGISTERED': return 'This CRS is not supported by the CAD registry. Check your project CRS code; a datum will not be guessed.'
      default: return 'Enter a supported projected project CRS measured in metres.'
    }
  }
  return failure instanceof RangeError ? failure.message : 'The reference or calibration could not be applied. The current drawing was retained.'
}

/** A metric layout frame is not evidence of surveyed accuracy or datum verification. */
export function hasCadReferenceFrame<T extends Pick<CADDocument, 'metersPerPixel' | 'originEasting' | 'originNorthing' | 'coordinateReferenceSystem'>>(doc: T): doc is T & {
  metersPerPixel: number; originEasting: number; originNorthing: number
} {
  if (!Number.isFinite(doc.metersPerPixel) || (doc.metersPerPixel ?? 0) <= 0 ||
    !Number.isFinite(doc.originEasting) || !Number.isFinite(doc.originNorthing) || !doc.coordinateReferenceSystem) return false
  try { resolveProjectCadCrs(doc.coordinateReferenceSystem); return true } catch { return false }
}

function checked(doc: CADDocument): CADDocument {
  const parsed = parseCadDocument(doc)
  if (!parsed) throw new RangeError('The resulting drawing exceeds supported CAD limits. No changes were saved.')
  return parsed
}

function assertCoordinatePairs(doc: CADDocument) {
  for (const point of doc.beacons) {
    if ((point.easting === undefined) !== (point.northing === undefined)) {
      throw new RangeError(`Point ${point.label} needs a complete Easting/Northing pair.`)
    }
  }
}

function measured(doc: CADDocument, points: { id: string; easting: number; northing: number }[]) {
  return deriveBoundaryMeasurements(points, doc.boundaries).map(edge => ({ ...edge, distance: edge.distanceM.toFixed(3) }))
}

/** Explicitly declare a north-up metric frame. Never replace supplied grid controls or relabel their CRS. */
export function applyCadReferenceFrame(document: CADDocument, settings: CadReferenceSettings): CADDocument {
  const doc = checked(document)
  assertCoordinatePairs(doc)
  const crs = resolveProjectCadCrs(settings.coordinateReferenceSystem)
  if (doc.coordinateReferenceSystem && resolveProjectCadCrs(doc.coordinateReferenceSystem) !== crs) {
    throw new RangeError('Use the coordinate transformation workflow to change an existing CRS; layout settings cannot transform survey coordinates.')
  }
  const mpp = settings.metersPerPixel
  if (!Number.isFinite(mpp) || mpp <= 0 || mpp > 100_000) throw new RangeError('Drawing scale must be positive and no greater than 100000 metres per canvas unit.')
  if (![settings.easting, settings.northing].every(n => Number.isFinite(n) && Math.abs(n) <= 1e9)) throw new RangeError('Anchor coordinates must be finite and within supported CAD limits.')
  const anchor = doc.beacons.find(point => point.id === settings.anchorId)
  if (!anchor) throw new RangeError('Choose a point in this drawing as the reference anchor.')
  if (anchor.easting !== undefined && (anchor.easting !== settings.easting || anchor.northing !== settings.northing)) {
    throw new RangeError('The anchor has supplied coordinates. Preserve them here; edit the point separately if they need correction.')
  }
  const originEasting = settings.easting - anchor.x * mpp
  const originNorthing = settings.northing - (doc.height - anchor.y) * mpp
  const oldFrame = hasCadReferenceFrame(doc) ? doc : null
  const remap = (point: Point): Point => {
    if (!oldFrame) return point
    const grid = cadCanvasToProject(point.x, point.y, oldFrame.originEasting, oldFrame.originNorthing, doc.height, oldFrame.metersPerPixel)
    return projectToCadCanvas(grid.easting, grid.northing, originEasting, originNorthing, doc.height, mpp)
  }
  const beacons = doc.beacons.map(point => {
    // Supplied controls are authoritative. Uncoordinated design points follow the declared frame.
    const grid = point.easting !== undefined && point.northing !== undefined
      ? { easting: point.easting, northing: point.northing }
      : point.id === anchor.id
        ? { easting: settings.easting, northing: settings.northing }
        : oldFrame
          ? cadCanvasToProject(point.x, point.y, oldFrame.originEasting, oldFrame.originNorthing, doc.height, oldFrame.metersPerPixel)
          : cadCanvasToProject(point.x, point.y, originEasting, originNorthing, doc.height, mpp)
    return { ...point, ...grid, ...projectToCadCanvas(grid.easting, grid.northing, originEasting, originNorthing, doc.height, mpp) }
  })
  const image = doc.backgroundImage
  const backgroundImage = image && oldFrame
    ? { ...image, ...remap(image), width: image.width * oldFrame.metersPerPixel / mpp, height: image.height * oldFrame.metersPerPixel / mpp }
    : image
  return checked({
    ...doc, coordinateReferenceSystem: crs, metersPerPixel: mpp, originEasting, originNorthing,
    beacons, backgroundImage, boundaries: measured(doc, beacons),
    annotations: doc.annotations.map(annotation => ({ ...annotation, ...remap(annotation),
      ...(annotation.x2 !== undefined && annotation.y2 !== undefined ? (() => {
        const end = remap({ x: annotation.x2, y: annotation.y2 }); return { x2: end.x, y2: end.y }
      })() : {}),
    })),
    scaleBar: { ...doc.scaleBar, scaleMeters: doc.scaleBar.scaleMeters || Math.min(1e6, doc.width * mpp / 5) },
    titleBlock: { ...doc.titleBlock, scale: 'Draft — verify print scale' },
  })
}

function insideImage(point: Point, image: CADBackgroundImage): boolean {
  const angle = image.rotation * Math.PI / 180
  const dx = point.x - (image.x + image.width / 2)
  const dy = point.y - (image.y + image.height / 2)
  const x = dx * Math.cos(angle) + dy * Math.sin(angle)
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle)
  return Math.abs(x) <= image.width / 2 + 1e-8 && Math.abs(y) <= image.height / 2 + 1e-8
}

/** Use project grid distance, never an assumed ground-to-grid factor. */
export function calibrateCadScale(document: CADDocument, picks: readonly Point[], distanceMetres: number): CADDocument {
  const doc = checked(document)
  assertCoordinatePairs(doc)
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) throw new RangeError('Enter a complete positive distance in metres.')
  if (picks.length !== 2 || !picks.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new RangeError('Select two finite reference points.')
  const span = Math.hypot(picks[1].x - picks[0].x, picks[1].y - picks[0].y)
  if (!Number.isFinite(span) || span < 2) throw new RangeError('Points are too close together to calibrate accurately.')
  const image = doc.backgroundImage
  if (image) {
    if (image.locked || !image.visible || image.opacity === 0) throw new RangeError('Show and unlock the image before calibrating it.')
    if (!picks.every(point => insideImage(point, image))) throw new RangeError('Both reference points must be inside the visible image.')
  }
  if (hasCadReferenceFrame(doc)) {
    for (const point of doc.beacons) {
      if (point.easting === undefined || point.northing === undefined) continue
      const grid = cadCanvasToProject(point.x, point.y, doc.originEasting, doc.originNorthing, doc.height, doc.metersPerPixel)
      const tolerance = Math.max(1e-6, Math.abs(point.easting) * Number.EPSILON * 16, Math.abs(point.northing) * Number.EPSILON * 16)
      if (Math.hypot(grid.easting - point.easting, grid.northing - point.northing) > tolerance) {
        throw new RangeError('Apply Coordinate reference settings to align the drawing with its supplied controls before image calibration.')
      }
    }
    if (!image) throw new RangeError('Attach an image to calibrate it. Change drawing layout scale in Coordinate reference settings.')
    const factor = distanceMetres / (span * doc.metersPerPixel)
    return checked({ ...doc, backgroundImage: {
      ...image, x: picks[0].x + factor * (image.x - picks[0].x), y: picks[0].y + factor * (image.y - picks[0].y),
      width: image.width * factor, height: image.height * factor,
    } })
  }
  if (doc.beacons.some(point => point.easting !== undefined) || doc.originEasting !== undefined || doc.originNorthing !== undefined) {
    throw new RangeError('Set the Coordinate reference before calibrating a drawing with supplied survey coordinates.')
  }
  if (doc.coordinateReferenceSystem) resolveProjectCadCrs(doc.coordinateReferenceSystem)
  const metersPerPixel = distanceMetres / span
  const metricPoints = doc.beacons.map(point => ({ id: point.id, easting: point.x * metersPerPixel, northing: -point.y * metersPerPixel }))
  return checked({ ...doc, metersPerPixel, boundaries: measured(doc, metricPoints),
    scaleBar: { ...doc.scaleBar, scaleMeters: Math.min(1e6, doc.width * metersPerPixel / 5) },
    titleBlock: { ...doc.titleBlock, scale: 'Draft — verify print scale' },
  })
}
