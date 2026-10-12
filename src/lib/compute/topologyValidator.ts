/**
 * Topological Validator — v0.3
 *
 * Reviews cadastral boundary geometry before professional review.
 * Flags common geometry concerns:
 *   1. Self-intersecting boundary (line crosses itself)
 *   2. Sliver polygons (tiny area from coordinate snap errors)
 *   3. Adjoiner overlaps (new boundary overlaps existing cadastral fabric)
 *   4. Unclosed rings (first point != last point)
 *   5. Insufficient vertices (need at least 3 for a polygon)
 *   6. Area below a configured local review threshold
 *
 * Uses turf.js for geometry operations — runs entirely client-side, no API call.
 * This is a geometry check only; it does not predict registry acceptance.
 */

import * as turf from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  id: string
  severity: ValidationSeverity
  rule: string
  message: string
  /** GeoJSON coordinates of the issue location, if applicable */
  location?: [number, number]
  /** Additional context (area, distance, etc.) */
  detail?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  /** Summary stats about the validated geometry */
  stats: {
    areaSqM: number
    perimeterM: number
    vertexCount: number
    isClosed: boolean
  }
}

export interface ValidationOptions {
  /** Optional local review threshold in m²; omitted means no area threshold */
  minAreaSqM?: number
  /** Maximum sliver area in m² — polygons smaller than this are flagged (default: 5) */
  sliverThresholdSqM?: number
  /** Maximum sliver ratio (area / perimeter²) — thin slivers flagged (default: 0.01) */
  sliverRatioThreshold?: number
  /** Adjoiner polygons to check for overlaps (existing cadastral fabric) */
  adjoiners?: Array<{ id: string; coordinates: [number, number][] }>
  /** Minimum vertices for a valid polygon (default: 4 = triangle + closing point) */
  minVertices?: number
}

// ─── Main validation function ───────────────────────────────────────────────

/**
 * Validate a cadastral boundary polygon.
 *
 * @param coordinates Array of [easting, northing] vertices (UTM coordinates)
 * @param options Validation options
 * @returns ValidationResult with errors (blocking) and warnings (non-blocking)
 */
export function validateCadastralBoundary(
  coordinates: [number, number][],
  options: ValidationOptions = {},
): ValidationResult {
  const {
    minAreaSqM,
    sliverThresholdSqM = 5,
    sliverRatioThreshold = 0.01,
    adjoiners = [],
    minVertices = 4,
  } = options

  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  // ─── Check 1: Sufficient vertices ──────────────────────────────────────
  if (coordinates.length < minVertices) {
    errors.push({
      id: 'insufficient-vertices',
      severity: 'error',
      rule: 'MIN_VERTICES',
      message: `Boundary has ${coordinates.length} vertices — minimum ${minVertices} required (3 distinct points + closing point).`,
      detail: `A valid polygon needs at least 3 distinct corners. Add more boundary points.`,
    })
    return {
      isValid: false,
      errors,
      warnings,
      stats: { areaSqM: 0, perimeterM: 0, vertexCount: coordinates.length, isClosed: false },
    }
  }

  // ─── Check 2: Ring is closed (first point == last point) ───────────────
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  const isClosed = first[0] === last[0] && first[1] === last[1]

  let workingCoords = coordinates
  if (!isClosed) {
    // Auto-close for turf (turf requires closed rings)
    workingCoords = [...coordinates, first]
    warnings.push({
      id: 'unclosed-ring',
      severity: 'warning',
      rule: 'RING_NOT_CLOSED',
      message: 'Boundary ring was not explicitly closed (first point ≠ last point). Auto-closed for validation.',
      detail: 'The validator closes the ring for this geometry check. Confirm the intended final vertex before using the boundary.',
    })
  }

  // ─── Build turf polygon ─────────────────────────────────────────────────
  let polygon: Feature<Polygon>
  try {
    polygon = turf.polygon([workingCoords]) as Feature<Polygon>
  } catch {
    errors.push({
      id: 'invalid-geometry',
      severity: 'error',
      rule: 'INVALID_GEOMETRY',
      message: 'Boundary coordinates do not form a valid polygon.',
      detail: 'Check for duplicate consecutive points or NaN values in coordinates.',
    })
    return {
      isValid: false,
      errors,
      warnings,
      stats: { areaSqM: 0, perimeterM: 0, vertexCount: coordinates.length, isClosed },
    }
  }

  // ─── Check 3: Self-intersection (kinks) ─────────────────────────────────
  const kinks = turf.kinks(polygon)
  if (kinks.features.length > 0) {
    const firstKink = kinks.features[0].geometry.coordinates as [number, number]
    errors.push({
      id: 'self-intersection',
      severity: 'error',
      rule: 'SELF_INTERSECT',
      message: `Boundary self-intersects at ${kinks.features.length} location${kinks.features.length > 1 ? 's' : ''}.`,
      location: firstKink,
      detail: `The boundary crosses itself at [${firstKink[0].toFixed(3)}, ${firstKink[1].toFixed(3)}]. Review the coordinates and correct the geometry before professional review.`,
    })
  }

  // ─── Compute area and perimeter ─────────────────────────────────────────
  // Inputs are projected Easting/Northing coordinates in metres. Turf's
  // area/length helpers treat values as longitude/latitude, so use planar
  // calculations to preserve the declared coordinate units.
  const areaSqM = planarRingArea(workingCoords)
  const perimeterM = planarRingLength(workingCoords)

  // ─── Check 4: Optional configured area threshold ────────────────────────
  if (minAreaSqM !== undefined && areaSqM < minAreaSqM) {
    warnings.push({
      id: 'area-below-review-threshold',
      severity: 'warning',
      rule: 'MIN_AREA',
      message: `Parcel area is ${areaSqM.toFixed(2)} m² — below the configured ${minAreaSqM} m² review threshold.`,
      detail: 'This is an optional local review threshold, not a statutory minimum. Check the applicable planning and survey requirements for this parcel.',
    })
  }

  // ─── Check 5: Sliver polygon detection ──────────────────────────────────
  // Sliver = very thin polygon (small area relative to perimeter)
  // Ratio: area / perimeter² — for a square this is 1/16 = 0.0625
  // Slivers have ratio < 0.01 (very thin)
  const sliverRatio = perimeterM > 0 ? areaSqM / (perimeterM * perimeterM) : 0

  if (areaSqM < sliverThresholdSqM) {
    errors.push({
      id: 'sliver-area',
      severity: 'error',
      rule: 'SLIVER_POLYGON',
      message: `Parcel area is only ${areaSqM.toFixed(4)} m² — this is a sliver polygon.`,
      detail: `This geometry is below the configured ${sliverThresholdSqM} m² review threshold. Inspect the source coordinates and project-specific criteria; this heuristic does not determine registry acceptance.`,
    })
  } else if (sliverRatio < sliverRatioThreshold && areaSqM < 1000) {
    warnings.push({
      id: 'sliver-shape',
      severity: 'warning',
      rule: 'SLIVER_SHAPE',
      message: `Parcel is unusually thin (area-to-perimeter ratio: ${sliverRatio.toFixed(4)}).`,
      detail: `This may be intentional (road reserve, access strip) but verify the boundary is correct. Ratio < ${sliverRatioThreshold} suggests a very narrow shape.`,
    })
  }

  // ─── Check 6: Duplicate consecutive vertices ────────────────────────────
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1]
    const curr = coordinates[i]
    if (prev[0] === curr[0] && prev[1] === curr[1]) {
      warnings.push({
        id: `duplicate-vertex-${i}`,
        severity: 'warning',
        rule: 'DUPLICATE_VERTEX',
        message: `Duplicate consecutive vertex at position ${i}: [${curr[0].toFixed(3)}, ${curr[1].toFixed(3)}].`,
        location: curr,
        detail: 'Duplicate points create zero-length legs. Remove the duplicate before submission.',
      })
    }
  }

  // ─── Check 7: Adjoiner overlap detection ────────────────────────────────
  for (const adjoiner of adjoiners) {
    try {
      const adjoinerCoords = adjoiner.coordinates
      const adjoinerFirst = adjoinerCoords[0]
      const adjoinerLast = adjoinerCoords[adjoinerCoords.length - 1]
      const adjoinerClosed =
        adjoinerFirst[0] === adjoinerLast[0] && adjoinerFirst[1] === adjoinerLast[1]
          ? adjoinerCoords
          : [...adjoinerCoords, adjoinerFirst]

      const adjoinerPolygon = turf.polygon([adjoinerClosed])
      const overlap = turf.intersect(turf.featureCollection([polygon, adjoinerPolygon]))

      if (overlap) {
        const overlapArea = planarGeometryArea(overlap.geometry)
        if (overlapArea > 0.01) {
          errors.push({
            id: `adjoiner-overlap-${adjoiner.id}`,
            severity: 'error',
            rule: 'ADJOINER_OVERLAP',
            message: `Boundary overlaps adjoiner "${adjoiner.id}" by ${overlapArea.toFixed(2)} m².`,
            detail: 'Review the shared boundary against source observations and current project records. This geometry check does not determine title status or registry acceptance.',
          })
        }
      }
    } catch {
      // If adjoiner geometry is invalid, skip it (don't block validation)
    }
  }

  // ─── Check 8: Winding order (clockwise vs counter-clockwise) ────────────
  // Report orientation for downstream format review; do not claim every
  // format requires the same orientation or that this check edits geometry.
  const winding = computeWindingOrder(workingCoords)
  if (winding === 'clockwise') {
    warnings.push({
      id: 'winding-order',
      severity: 'warning',
      rule: 'WINDING_ORDER',
      message: 'Boundary ring is clockwise. Review the target format\'s exterior-ring orientation requirement.',
      detail: 'This check reports orientation only; it does not change geometry or guarantee downstream display.',
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      areaSqM,
      perimeterM,
      vertexCount: coordinates.length,
      isClosed,
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute winding order of a polygon ring.
 * Uses the signed area method (shoelace formula).
 * Positive = counter-clockwise, negative = clockwise.
 */
function computeWindingOrder(coords: [number, number][]): 'clockwise' | 'counter-clockwise' {
  let sum = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[i + 1]
    sum += (x2 - x1) * (y2 + y1)
  }
  // In standard math coordinates (Y up), positive sum = clockwise
  // In surveying coordinates (Northing up), this is the same
  return sum > 0 ? 'clockwise' : 'counter-clockwise'
}

function planarRingArea(coords: [number, number][]): number {
  let twiceArea = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[i + 1]
    twiceArea += x1 * y2 - x2 * y1
  }
  return Math.abs(twiceArea) / 2
}

function planarRingLength(coords: [number, number][]): number {
  let length = 0
  for (let i = 0; i < coords.length - 1; i++) {
    length += Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1])
  }
  return length
}

function planarGeometryArea(geometry: Polygon | MultiPolygon): number {
  if (geometry.type === 'Polygon') {
    const [outerRing, ...holes] = geometry.coordinates as [number, number][][]
    return Math.max(0, planarRingArea(outerRing) - holes.reduce((sum, ring) => sum + planarRingArea(ring), 0))
  }

  return geometry.coordinates.reduce((sum, polygonCoordinates) => {
    const [outerRing, ...holes] = polygonCoordinates as [number, number][][]
    return sum + Math.max(0, planarRingArea(outerRing) - holes.reduce((holeSum, ring) => holeSum + planarRingArea(ring), 0))
  }, 0)
}

/**
 * Quick check: is a coordinate array a valid closed polygon with no self-intersections?
 * Lightweight version of validateCadastralBoundary for real-time UI feedback.
 */
export function isBoundaryValidQuick(coordinates: [number, number][]): boolean {
  if (coordinates.length < 4) return false
  try {
    const first = coordinates[0]
    const last = coordinates[coordinates.length - 1]
    const closed = first[0] === last[0] && first[1] === last[1] ? coordinates : [...coordinates, first]
    const polygon = turf.polygon([closed])
    const kinks = turf.kinks(polygon)
    return kinks.features.length === 0
  } catch {
    return false
  }
}
