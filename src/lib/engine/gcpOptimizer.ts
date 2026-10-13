/**
 * @module gcpOptimizer
 *
 * Ground Control Point (GCP) Planning & Optimization for Drone Surveys
 *
 * Features:
 * 1. Candidate GCP target placement within a validated project boundary
 * 2. GCP distribution across project area
 * 3. Field validation checklist
 * 4. Photo binding (GCP photo + RTK coordinate)
 * 5. Export for Pix4D, WebODM, Agisoft
 *
 * Suggested counts are starting heuristics only; they do not constitute a
 * photogrammetric design or accuracy recommendation.
 */

import { utmToGeographic } from '@/lib/geodesy/coordinates'

// Defaults removed: require explicit UTM zone and hemisphere from project CRS

export interface ProjectArea {
  /** Polygon vertices defining the project boundary */
  boundary: Array<{ easting: number; northing: number }>
}

export interface GCPPoint {
  id: string
  name: string
  easting: number
  northing: number
  plannedEasting?: number
  plannedNorthing?: number
  elevation?: number
  rtkFixed: boolean
  /** Horizontal standard uncertainty in metres. Required by Pix4D export. */
  accuracy?: number
  /** Vertical standard uncertainty in metres. Required by Pix4D export. */
  verticalAccuracy?: number
  photoCaptured: boolean
  photoUrl?: string
  status: 'planned' | 'surveyed' | 'validated'
  targetPattern: 'checkerboard' | 'cross' | 'circle'
}

export interface GCPPlan {
  gcps: GCPPoint[]
  totalGCPs: number
  /** Area derived from the supplied projected boundary, in hectares. */
  projectAreaHa: number
  /** Validated UTM boundary used to place candidate targets. */
  projectBoundary: ProjectArea['boundary']
  distribution: 'interior-spread'
}

type ProjectVertex = ProjectArea['boundary'][number]
type ExportableGCPPoint = GCPPoint & Required<Pick<GCPPoint,
  'easting' | 'northing' | 'elevation' | 'accuracy' | 'verticalAccuracy'>>

const MIN_BOUNDARY_VERTICES = 3
const MAX_BOUNDARY_VERTICES = 500
const MAX_PLANNED_GCPS = 100
const MAX_GRID_STEPS = 128

function samePoint(a: ProjectVertex, b: ProjectVertex): boolean {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing) < 1e-7
}

function cross(a: ProjectVertex, b: ProjectVertex, c: ProjectVertex): number {
  return (b.easting - a.easting) * (c.northing - a.northing)
    - (b.northing - a.northing) * (c.easting - a.easting)
}

function pointOnSegment(point: ProjectVertex, a: ProjectVertex, b: ProjectVertex): boolean {
  const scale = Math.max(1, Math.hypot(b.easting - a.easting, b.northing - a.northing))
  if (Math.abs(cross(a, b, point)) > 1e-9 * scale) return false
  return point.easting >= Math.min(a.easting, b.easting) - 1e-9
    && point.easting <= Math.max(a.easting, b.easting) + 1e-9
    && point.northing >= Math.min(a.northing, b.northing) - 1e-9
    && point.northing <= Math.max(a.northing, b.northing) + 1e-9
}

function segmentsIntersect(a: ProjectVertex, b: ProjectVertex, c: ProjectVertex, d: ProjectVertex): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true
  return (Math.abs(abC) < 1e-9 && pointOnSegment(c, a, b))
    || (Math.abs(abD) < 1e-9 && pointOnSegment(d, a, b))
    || (Math.abs(cdA) < 1e-9 && pointOnSegment(a, c, d))
    || (Math.abs(cdB) < 1e-9 && pointOnSegment(b, c, d))
}

function normalizeAndValidateBoundary(boundary: ProjectArea['boundary']): ProjectVertex[] {
  if (!Array.isArray(boundary)) throw new Error('Enter a project boundary with at least three vertices.')
  const vertices = boundary.map((vertex) => {
    if (!vertex || !Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) {
      throw new Error('Every boundary vertex must have finite easting and northing values.')
    }
    return { easting: vertex.easting, northing: vertex.northing }
  })
  if (vertices.length > 1 && samePoint(vertices[0], vertices[vertices.length - 1])) vertices.pop()
  if (vertices.length < MIN_BOUNDARY_VERTICES) {
    throw new Error('Enter at least three distinct boundary vertices.')
  }
  if (vertices.length > MAX_BOUNDARY_VERTICES) {
    throw new Error(`Use at most ${MAX_BOUNDARY_VERTICES} boundary vertices. Simplify the project outline first.`)
  }
  if (new Set(vertices.map(vertex => `${vertex.easting},${vertex.northing}`)).size < MIN_BOUNDARY_VERTICES) {
    throw new Error('The boundary must contain at least three distinct vertices.')
  }
  for (let index = 0; index < vertices.length; index += 1) {
    if (samePoint(vertices[index], vertices[(index + 1) % vertices.length])) {
      throw new Error('The boundary contains a repeated adjacent vertex.')
    }
    const previous = vertices[(index + vertices.length - 1) % vertices.length]
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    const turn = cross(previous, current, next)
    const backtrack = (previous.easting - current.easting) * (next.easting - current.easting)
      + (previous.northing - current.northing) * (next.northing - current.northing)
    if (Math.abs(turn) < 1e-9 && backtrack > 0) {
      throw new Error('The boundary doubles back along an edge.')
    }
  }

  let twiceArea = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    twiceArea += current.easting * next.northing - next.easting * current.northing
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 1e-6) {
    throw new Error('The project boundary has no measurable area.')
  }

  for (let first = 0; first < vertices.length; first += 1) {
    const firstNext = (first + 1) % vertices.length
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondNext = (second + 1) % vertices.length
      const adjacent = first === second || firstNext === second || secondNext === first
      if (adjacent) continue
      if (segmentsIntersect(vertices[first], vertices[firstNext], vertices[second], vertices[secondNext])) {
        throw new Error('The project boundary crosses itself or touches another edge.')
      }
    }
  }

  return vertices
}

/** Parse one projected UTM easting,northing pair per line and validate its polygon. */
export function parseUtmBoundary(text: string): ProjectArea['boundary'] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const vertices = lines.map((line, index) => {
    const values = line.split(/[\s,;]+/).filter(Boolean)
    if (values.length !== 2) {
      throw new Error(`Line ${index + 1}: enter exactly two values, easting then northing, in metres.`)
    }
    const [easting, northing] = values.map(Number)
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
      throw new Error(`Line ${index + 1}: easting and northing must be finite numbers.`)
    }
    if (easting < 100_000 || easting > 900_000 || northing < 0 || northing > 10_000_000) {
      throw new Error(`Line ${index + 1}: coordinate is outside the supported UTM metre range.`)
    }
    return { easting, northing }
  })
  return normalizeAndValidateBoundary(vertices)
}

/** Return the projected polygon area in hectares. Coordinates must be metres. */
export function getProjectAreaHectares(boundary: ProjectArea['boundary']): number {
  const vertices = normalizeAndValidateBoundary(boundary)
  let twiceArea = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    twiceArea += current.easting * next.northing - next.easting * current.northing
  }
  return Math.abs(twiceArea) / 2 / 10_000
}

/** Point-in-polygon test that excludes boundary points so suggested targets stay inside the site. */
function isPointInsideValidatedPolygon(point: ProjectVertex, vertices: ProjectVertex[]): boolean {
  let inside = false
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const current = vertices[index]
    const prior = vertices[previous]
    if (pointOnSegment(point, prior, current)) return false
    const crosses = (current.northing > point.northing) !== (prior.northing > point.northing)
      && point.easting < ((prior.easting - current.easting) * (point.northing - current.northing)
        / (prior.northing - current.northing) + current.easting)
    if (crosses) inside = !inside
  }
  return inside
}

export function isPointInsideProjectBoundary(point: ProjectVertex, boundary: ProjectArea['boundary']): boolean {
  return isPointInsideValidatedPolygon(point, normalizeAndValidateBoundary(boundary))
}

/** Calculate the bounding box of a validated polygon. */
function getBoundingBox(vertices: ProjectVertex[]): {
  minE: number; maxE: number; minN: number; maxN: number
  width: number; height: number
} {
  let minE = vertices[0].easting, maxE = vertices[0].easting
  let minN = vertices[0].northing, maxN = vertices[0].northing

  for (const v of vertices) {
    minE = Math.min(minE, v.easting)
    maxE = Math.max(maxE, v.easting)
    minN = Math.min(minN, v.northing)
    maxN = Math.max(maxN, v.northing)
  }

  return { minE, maxE, minN, maxN, width: maxE - minE, height: maxN - minN }
}

function distanceSquaredToSegment(point: ProjectVertex, start: ProjectVertex, end: ProjectVertex): number {
  const deltaE = end.easting - start.easting
  const deltaN = end.northing - start.northing
  const lengthSquared = deltaE * deltaE + deltaN * deltaN
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.easting - start.easting) * deltaE + (point.northing - start.northing) * deltaN) / lengthSquared,
  ))
  const nearestE = start.easting + t * deltaE
  const nearestN = start.northing + t * deltaN
  return (point.easting - nearestE) ** 2 + (point.northing - nearestN) ** 2
}

function distanceSquaredToBoundary(point: ProjectVertex, boundary: ProjectVertex[]): number {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < boundary.length; index += 1) {
    minimum = Math.min(minimum, distanceSquaredToSegment(point, boundary[index], boundary[(index + 1) % boundary.length]))
  }
  return minimum
}

function generateInteriorTargets(boundary: ProjectVertex[], count: number): ProjectVertex[] {
  const bbox = getBoundingBox(boundary)
  let candidates: ProjectVertex[] = []
  for (const steps of [16, 32, 64, MAX_GRID_STEPS]) {
    candidates = []
    const candidateKeys = new Set<string>()
    for (let row = 0; row < steps; row += 1) {
      const northing = bbox.minN + bbox.height * (row + 0.5) / steps
      for (let column = 0; column < steps; column += 1) {
        const point = {
          easting: Number((bbox.minE + bbox.width * (column + 0.5) / steps).toFixed(3)),
          northing: Number(northing.toFixed(3)),
        }
        const key = `${point.easting},${point.northing}`
        if (isPointInsideValidatedPolygon(point, boundary) && !candidateKeys.has(key)) {
          candidateKeys.add(key)
          candidates.push(point)
        }
      }
    }
    if (candidates.length >= count) break
  }
  if (candidates.length < count) {
    throw new Error('The boundary is too narrow for the suggested target count. Divide the site into smaller survey blocks or review the outline.')
  }

  const selected: ProjectVertex[] = []
  const first = candidates.reduce((best, point) =>
    distanceSquaredToBoundary(point, boundary) > distanceSquaredToBoundary(best, boundary) ? point : best,
  )
  selected.push(first)
  while (selected.length < count) {
    let best: ProjectVertex | null = null
    let bestDistance = -1
    for (const candidate of candidates) {
      if (selected.some(point => samePoint(point, candidate))) continue
      const nearestSelected = Math.min(...selected.map(point =>
        (candidate.easting - point.easting) ** 2 + (candidate.northing - point.northing) ** 2,
      ))
      if (nearestSelected > bestDistance) {
        best = candidate
        bestDistance = nearestSelected
      }
    }
    if (!best) throw new Error('Could not place distinct GCP targets inside the project boundary.')
    selected.push(best)
  }
  return selected
}

/**
 * Generate candidate target locations distributed inside a projected project boundary.
 *
 * The count is a planning heuristic only. It does not estimate photogrammetric
 * accuracy or replace a project-specific flight/GCP design.
 */
export function generateGCPPlan(area: ProjectArea): GCPPlan {
  const boundary = normalizeAndValidateBoundary(area.boundary)
  const projectAreaHa = getProjectAreaHectares(boundary)

  // A conservative starting count, not a standard or accuracy guarantee.
  let gcpCount: number

  if (projectAreaHa < 50) {
    gcpCount = 5
  } else {
    gcpCount = Math.max(5, Math.ceil(projectAreaHa / 10))
  }
  if (gcpCount > MAX_PLANNED_GCPS) {
    throw new Error(`This site suggests more than ${MAX_PLANNED_GCPS} targets. Divide it into smaller survey blocks and design each block separately.`)
  }

  const gcps: GCPPoint[] = []
  const targets = generateInteriorTargets(boundary, gcpCount)
  targets.forEach((target, index) => {
    gcps.push({
      id: crypto.randomUUID(),
      name: `GCP-${String(index + 1).padStart(2, '0')}`,
      easting: Number(target.easting.toFixed(3)),
      northing: Number(target.northing.toFixed(3)),
      plannedEasting: Number(target.easting.toFixed(3)),
      plannedNorthing: Number(target.northing.toFixed(3)),
      rtkFixed: false,
      photoCaptured: false,
      status: 'planned',
      targetPattern: index === 0 ? 'cross' : 'checkerboard',
    })
  })

  return {
    gcps,
    totalGCPs: gcps.length,
    projectAreaHa,
    projectBoundary: boundary,
    distribution: 'interior-spread',
  }
}

/**
 * Update a GCP with surveyed coordinates.
 */
export function updateGCPWithSurvey(
  gcp: GCPPoint,
  easting: number,
  northing: number,
  elevation: number,
  accuracy: number,
  verticalAccuracy: number,
  rtkFixed: boolean,
): GCPPoint {
  if (![easting, northing, elevation].every(Number.isFinite)) {
    throw new Error('Surveyed easting, northing and elevation must be finite numbers.')
  }
  if (!Number.isFinite(accuracy) || accuracy <= 0 || !Number.isFinite(verticalAccuracy) || verticalAccuracy <= 0) {
    throw new Error('Enter positive horizontal and vertical uncertainty values in metres.')
  }
  return {
    ...gcp,
    easting,
    northing,
    elevation,
    accuracy,
    verticalAccuracy,
    rtkFixed,
    status: 'surveyed',
  }
}

/**
 * Mark a GCP as photo-captured.
 */
export function markGCPPhotoCaptured(
  gcp: GCPPoint,
  photoUrl: string,
): GCPPoint {
  return {
    ...gcp,
    photoCaptured: true,
    photoUrl,
    // A photo is supporting evidence; it does not by itself validate the
    // coordinates, control or project datum.
    status: gcp.status,
  }
}

function assertExportableGCPs(
  gcps: GCPPoint[],
  utmZone: number,
  hemisphere: 'N' | 'S',
): asserts gcps is ExportableGCPPoint[] {
  if (!Array.isArray(gcps) || gcps.length === 0) throw new Error('Add surveyed GCPs before exporting.')
  if (!Number.isInteger(utmZone) || utmZone < 1 || utmZone > 60) throw new Error('UTM zone must be an integer from 1 to 60.')
  if (hemisphere !== 'N' && hemisphere !== 'S') throw new Error('Choose the project UTM hemisphere.')

  for (const gcp of gcps) {
    if (gcp.status === 'planned') throw new Error(`${gcp.name} is a planned target, not a surveyed control point.`)
    if (!gcp.rtkFixed) throw new Error(`${gcp.name} does not have a fixed RTK solution.`)
    if (![gcp.easting, gcp.northing, gcp.elevation].every(Number.isFinite)) {
      throw new Error(`${gcp.name} is missing surveyed easting, northing or elevation.`)
    }
    if (!Number.isFinite(gcp.accuracy) || (gcp.accuracy ?? 0) <= 0
      || !Number.isFinite(gcp.verticalAccuracy) || (gcp.verticalAccuracy ?? 0) <= 0) {
      throw new Error(`${gcp.name} is missing positive horizontal or vertical uncertainty.`)
    }
  }
}

/**
 * Generate a GCP export file for Pix4D.
 * Format: GCP Name, Lat (WGS84), Lon (WGS84), elevation in the project vertical datum, and uncertainties
 *
 * P0-1 FIX (2026-07-24): Previously exported `lat=0, lng=0` with the comment
 * "Would be transformed" — producing a file full of zeros that Pix4D would
 * silently accept and then fail to georeference. Now transforms UTM→WGS84
 * via the Redfearn formula in `geodesy/coordinates.ts` (Basak Ch.3,
 * Ghilani & Wolf Ch.7, EPSG Guidance Note 7-2).
 *
 * @param gcps        - measured RTK-fixed GCPs with horizontal and vertical uncertainties
 * @param utmZone     - UTM zone (1-60) for the measured easting/northing
 * @param hemisphere  - 'N' or 'S' for the measured easting/northing
 */
export function exportForPix4D(
  gcps: GCPPoint[],
  utmZone: number,
  hemisphere: 'N' | 'S',
): string {
  assertExportableGCPs(gcps, utmZone, hemisphere)
  let csv = ''

  for (const gcp of gcps) {
    const { lat, lon } = utmToGeographic(gcp.easting, gcp.northing, utmZone, hemisphere)

    csv += `${gcp.name},${lat.toFixed(9)},${lon.toFixed(9)},${gcp.elevation.toFixed(4)},${gcp.accuracy.toFixed(4)},${gcp.verticalAccuracy.toFixed(4)}\n`
  }

  return csv
}

/**
 * Generate a coordinate CSV for WebODM's GCP Editor Pro import.
 * Format: label,northing,easting,elevation. Image marks are assigned later.
 *
 * P0-1 FIX (2026-07-24): Same zero-export bug as `exportForPix4D`. Now
 * transforms UTM→WGS84 via Redfearn.
 *
 * @param gcps        - measured GCPs in projected metre coordinates
 * @param utmZone     - UTM zone (1-60) selected for the project
 * @param hemisphere  - 'N' or 'S' selected for the project
 */
export function exportForWebODM(
  gcps: GCPPoint[],
  utmZone: number,
  hemisphere: 'N' | 'S',
): string {
  assertExportableGCPs(gcps, utmZone, hemisphere)
  let csv = 'GCP Label,Northing,Easting,Elevation\n'

  for (const gcp of gcps) {
    csv += `${gcp.name},${gcp.northing.toFixed(4)},${gcp.easting.toFixed(4)},${gcp.elevation.toFixed(4)}\n`
  }

  return csv
}

/**
 * Generate a validation checklist for field work.
 */
export function generateValidationChecklist(plan: GCPPlan): Array<{
  item: string
  completed: boolean
  gcpsCompleted: number
  totalGCPs: number
}> {
  return [
    {
      item: 'Surveyed coordinates recorded for all GCPs',
      completed: plan.gcps.every(g => g.status !== 'planned'),
      gcpsCompleted: plan.gcps.filter(g => g.status !== 'planned').length,
      totalGCPs: plan.totalGCPs,
    },
    {
      item: 'RTK coordinates captured for all GCPs',
      completed: plan.gcps.every(g => g.rtkFixed),
      gcpsCompleted: plan.gcps.filter(g => g.rtkFixed).length,
      totalGCPs: plan.totalGCPs,
    },
  ]
}
