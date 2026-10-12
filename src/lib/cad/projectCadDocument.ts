import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { parseCadGridCoordinate } from './cadDocumentValidation'

export interface ProjectCadStation {
  pointName?: unknown
  name?: unknown
  label?: unknown
  adjustedEasting?: unknown
  easting?: unknown
  adjustedNorthing?: unknown
  northing?: unknown
}

export interface ProjectCadMetadata {
  projectName?: string | null
  lrNumber?: string | null
  surveyorName?: string | null
  surveyorLicense?: string | null
  projectCrs?: string | null
  date?: string
}

export interface ProjectCadDocumentResult {
  document: CADDocument
  omittedStationCount: number
  referenceIssue?: string
}

const WIDTH = 1122
const HEIGHT = 794
const PADDING = 100

export function resolveProjectCadCrs(code: string): string {
  const info = assertProjectedCrs(code)
  if (info.units !== 'metres') throw new RangeError(`${info.code} is not a metre-based project CRS.`)
  return info.code
}

function stationCoordinate(value: unknown): number | undefined {
  if (typeof value === 'string') return parseCadGridCoordinate(value)
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9 ? value : undefined
}

function hasCoordinateValue(value: unknown): boolean {
  return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')
}

function stationCoordinatePair(station: ProjectCadStation): { easting: number; northing: number } | null {
  // An adjustment is one result, not two independently replaceable axes.
  const hasAdjustment = hasCoordinateValue(station.adjustedEasting) || hasCoordinateValue(station.adjustedNorthing)
  const easting = stationCoordinate(hasAdjustment ? station.adjustedEasting : station.easting)
  const northing = stationCoordinate(hasAdjustment ? station.adjustedNorthing : station.northing)
  return easting === undefined || northing === undefined ? null : { easting, northing }
}

/**
 * Convert project grid coordinates into CAD canvas coordinates. The origin
 * is defined at canvas (0, height), so imported point coordinates round-trip
 * exactly and newly drawn points stay on the same grid.
 */
export function projectToCadCanvas(
  easting: number,
  northing: number,
  originEasting: number,
  originNorthing: number,
  height: number,
  metersPerPixel: number,
): { x: number; y: number } {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    throw new RangeError('CAD drawing scale must be a positive finite value.')
  }
  return {
    x: (easting - originEasting) / metersPerPixel,
    y: height - (northing - originNorthing) / metersPerPixel,
  }
}

export function cadCanvasToProject(
  x: number,
  y: number,
  originEasting: number,
  originNorthing: number,
  height: number,
  metersPerPixel: number,
): { easting: number; northing: number } {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    throw new RangeError('CAD drawing scale must be a positive finite value.')
  }
  return {
    easting: originEasting + x * metersPerPixel,
    northing: originNorthing + (height - y) * metersPerPixel,
  }
}

export function buildProjectCadDocument(
  metadata: ProjectCadMetadata,
  stations: readonly ProjectCadStation[],
): ProjectCadDocumentResult {
  const projectCrs = metadata.projectCrs?.trim()
  let referenceIssue: string | undefined
  if (!projectCrs) {
    referenceIssue = 'This project has no registered CRS. Survey points were not plotted as metric CAD coordinates.'
  } else {
    try {
      resolveProjectCadCrs(projectCrs)
    } catch (error) {
      referenceIssue = error instanceof Error ? error.message : 'The registered project CRS is not valid for CAD coordinates.'
    }
  }

  const usable = referenceIssue ? [] : stations.flatMap((station, index) => {
    const pair = stationCoordinatePair(station)
    if (!pair) return []
    const label = [station.pointName, station.name, station.label]
      .find((value) => typeof value === 'string' && value.trim())
    return [{ id: `b${index}`, label: typeof label === 'string' ? label.trim() : `P${index + 1}`, ...pair }]
  })

  const minE = usable.length ? Math.min(...usable.map((point) => point.easting)) : null
  const maxE = usable.length ? Math.max(...usable.map((point) => point.easting)) : null
  const minN = usable.length ? Math.min(...usable.map((point) => point.northing)) : null
  const maxN = usable.length ? Math.max(...usable.map((point) => point.northing)) : null
  const rangeE = minE === null || maxE === null ? 0 : Math.max(maxE - minE, 100)
  const rangeN = minN === null || maxN === null ? 0 : Math.max(maxN - minN, 100)
  const pixelsPerMetre = usable.length
    ? Math.min((WIDTH - 2 * PADDING) / rangeE, (HEIGHT - 2 * PADDING) / rangeN)
    : null
  const metersPerPixel = pixelsPerMetre ? 1 / pixelsPerMetre : undefined

  // originEasting/Northing represent the project coordinate at canvas x=0
  // and y=HEIGHT. Account for the map padding so editing preserves E/N.
  const originEasting = minE !== null && metersPerPixel !== undefined
    ? minE - PADDING * metersPerPixel
    : undefined
  const originNorthing = minN !== null && metersPerPixel !== undefined
    ? minN - PADDING * metersPerPixel
    : undefined

  const beacons = usable.flatMap((point) => {
    if (originEasting===undefined || originNorthing===undefined || metersPerPixel===undefined) return []
    const canvas = projectToCadCanvas(
      point.easting,
      point.northing,
      originEasting,
      originNorthing,
      HEIGHT,
      metersPerPixel,
    )
    return [{
      ...point,
      ...canvas,
      symbol: 'concrete_beacon',
      locked: false,
    }]
  })

  const lrNumber = metadata.lrNumber?.trim()
    || metadata.projectName?.match(/LR\s*[\d/]+/i)?.[0]
    || ''

  return {
    document: {
      beacons,
      // Project points are not proof of a parcel boundary or station order.
      boundaries: [],
      annotations: [],
      northArrow: { x: WIDTH - 110, y: 90, rotation: 0, type: 'grid', bearing: '0°00\'00"' },
      scaleBar: {
        x: 70,
        y: HEIGHT - 50,
        scaleMeters: metersPerPixel ? Math.max(1, Math.round(Math.max(rangeE, rangeN) / 5)) : 0,
      },
      titleBlock: {
        projectName: metadata.projectName?.trim() || 'Project CAD draft',
        lrNumber,
        surveyor: metadata.surveyorName?.trim() || '',
        regNo: metadata.surveyorLicense?.trim() || '',
        date: metadata.date || '',
        scale: metersPerPixel ? 'Not print-verified' : 'Uncalibrated',
        sheet: '1 of 1',
      },
      width: WIDTH,
      height: HEIGHT,
      ...(metersPerPixel !== undefined ? { metersPerPixel } : {}),
      ...(originEasting !== undefined ? { originEasting } : {}),
      ...(originNorthing !== undefined ? { originNorthing } : {}),
      ...(!referenceIssue && projectCrs ? { coordinateReferenceSystem: projectCrs } : {}),
      backgroundImage: null,
    },
    omittedStationCount: stations.length - usable.length,
    ...(referenceIssue ? { referenceIssue } : {}),
  }
}
