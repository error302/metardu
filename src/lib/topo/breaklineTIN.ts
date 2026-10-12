/**
 * Complete breakline-constrained Delaunay surfaces and contour diagnostics.
 * Supplied 3D breakline vertices participate in the surface. Crossings are split
 * only when their interpolated heights agree; conflicting evidence fails closed.
 * Retessellated triangles replace crossing edges without leaving surface holes.
 */

import { buildTIN, type TIN, type SurfacePoint, type Triangle } from '@/lib/survey/surfaceTIN'
import { buildConstrainedTIN } from './constrainedTIN'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Breakline {
  /** Ordered points defining the breakline polyline */
  points: SurfacePoint[]
  /** Survey feature classification; every supplied line is a mesh constraint. */
  type: 'hard' | 'soft' | 'ridge' | 'valley'
  /** Optional description */
  description?: string
}

export interface BreaklineTINResult extends TIN {
  constraintEdges: Array<[number, number]>
  /** Breaklines used as constraints */
  breaklines: Breakline[]
  /** Number of baseline triangles replaced by constrained retriangulation */
  removedTriangles: number
  /** Number of replacement constrained triangles */
  addedTriangles: number
  /** Whether any breakline constraints were applied */
  hasConstraints: boolean
}

// ─── Build Breakline-Aware TIN ──────────────────────────────────────────────

/**
 * Build a TIN that respects breaklines as hard edges.
 *
 * @param points - All surface points (including breakline endpoints)
 * @param breaklines - Breaklines to use as hard edges
 * @returns TIN with triangles that don't cross breaklines
 */
export function buildBreaklineTIN(
  points: SurfacePoint[],
  breaklines: Breakline[] = [],
): BreaklineTINResult {
  const constrained = buildConstrainedTIN(points, breaklines)
  if (constrained.constraintEdges.length === 0) return { ...constrained, breaklines, removedTriangles: 0, addedTriangles: 0, hasConstraints: false }
  const baseline = buildTIN(constrained.points)
  const key = (t: Triangle) => [t.a, t.b, t.c].sort((a, b) => a - b).join(':')
  const previous = new Set(baseline.triangles.map(key))
  const current = new Set(constrained.triangles.map(key))
  return {
    ...constrained, breaklines,
    removedTriangles: baseline.triangles.filter(t => !current.has(key(t))).length,
    addedTriangles: constrained.triangles.filter(t => !previous.has(key(t))).length,
    hasConstraints: constrained.constraintEdges.length > 0,
  }
}

// ─── Segment Intersection Test ──────────────────────────────────────────────

/**
 * Check if two 2D line segments cross each other.
 * Uses the orientation test method (CLRS Introduction to Algorithms).
 */
function segmentsCross(
  p1: SurfacePoint, p2: SurfacePoint,
  p3: SurfacePoint, p4: SurfacePoint,
): boolean {
  // Don't flag shared endpoints as crossings
  if (pointsEqual(p1, p3) || pointsEqual(p1, p4) ||
      pointsEqual(p2, p3) || pointsEqual(p2, p4)) {
    return false
  }

  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  return false
}

function direction(p1: SurfacePoint, p2: SurfacePoint, p3: SurfacePoint): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)
}

function pointsEqual(a: SurfacePoint, b: SurfacePoint): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
}

// ─── Contour Sanity Flagging ────────────────────────────────────────────────

export interface ContourSanityIssue {
  type: 'self_crossing' | 'absurd_slope' | 'isolated_loop' | 'edge_crossing'
  severity: 'warning' | 'error'
  message: string
  /** Affected contour line index */
  contourIndex: number
  /** Suggested fix */
  suggestion: string
}

export interface ContourSanityResult {
  issues: ContourSanityIssue[]
  passed: boolean
  summary: string
}

/**
 * Check generated contours for geometric sanity issues.
 *
 * This is the topo equivalent of the field-side closure check — catching a
 * bad shot at generation time rather than after the surveyor has drawn over
 * it by hand in AutoCAD.
 *
 * Checks:
 * 1. Self-crossing contour lines (a contour that crosses itself = TIN error)
 * 2. Absurd slopes between adjacent contour points (suggests a busted shot)
 * 3. Isolated loops (tiny closed contours far from other contours = noise)
 *
 * @param contourLines - Array of contour polylines (arrays of [x, y] points)
 * @param interval - Contour interval in meters
 * @param maxSlope - Maximum reasonable slope (degrees). Default: 45°
 */
export function checkContourSanity(
  contourLines: Array<Array<[number, number]>>,
  interval: number,
  maxSlope: number = 45,
): ContourSanityResult {
  const issues: ContourSanityIssue[] = []

  for (let i = 0; i < contourLines.length; i++) {
    const line = contourLines[i]
    if (line.length < 2) continue

    // 1. Check for self-crossing
    for (let j = 0; j < line.length - 1; j++) {
      for (let k = j + 2; k < line.length - 1; k++) {
        const seg1P1 = { x: line[j][0], y: line[j][1], z: 0 }
        const seg1P2 = { x: line[j + 1][0], y: line[j + 1][1], z: 0 }
        const seg2P1 = { x: line[k][0], y: line[k][1], z: 0 }
        const seg2P2 = { x: line[k + 1][0], y: line[k + 1][1], z: 0 }

        if (segmentsCross(seg1P1, seg1P2, seg2P1, seg2P2)) {
          issues.push({
            type: 'self_crossing',
            severity: 'error',
            message: `Contour ${i} self-crosses at segment ${j}-${k}`,
            contourIndex: i,
            suggestion: 'Check for a bust shot near the crossing point. The TIN may have a triangle with an absurd slope.',
          })
          break // one crossing per line is enough to flag
        }
      }
    }

    // 2. Check for absurd slopes (contour points too close together for the interval)
    const slopeRad = maxSlope * Math.PI / 180
    const minDist = interval / Math.tan(slopeRad) // minimum horizontal distance for the slope
    let closePointCount = 0

    for (let j = 0; j < line.length - 1; j++) {
      const dx = line[j + 1][0] - line[j][0]
      const dy = line[j + 1][1] - line[j][1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist * 0.1) { // extremely close = likely a bust
        closePointCount++
      }
    }

    if (closePointCount > 3) {
      issues.push({
        type: 'absurd_slope',
        severity: 'warning',
        message: `Contour ${i} has ${closePointCount} extremely close points — likely a bust shot causing steep slope`,
        contourIndex: i,
        suggestion: 'Check the point cloud for a spike (e.g., a shot with wrong RL). Remove or correct the bust and regenerate.',
      })
    }

    // 3. Check for isolated tiny loops
    if (line.length >= 3 && line.length <= 5) {
      const first = line[0]
      const last = line[line.length - 1]
      const isClosed = Math.abs(first[0] - last[0]) < 0.01 && Math.abs(first[1] - last[1]) < 0.01
      if (isClosed) {
        // Check if it's tiny
        let maxDist = 0
        for (const pt of line) {
          const d = Math.sqrt(pt[0] ** 2 + pt[1] ** 2)
          if (d > maxDist) maxDist = d
        }
        if (maxDist < 1.0) { // < 1m extent
          issues.push({
            type: 'isolated_loop',
            severity: 'warning',
            message: `Contour ${i} is a tiny isolated loop (${maxDist.toFixed(2)}m extent) — likely noise`,
            contourIndex: i,
            suggestion: 'This may be a legitimate depression, but check if it\'s caused by a single bust shot. Consider smoothing or filtering.',
          })
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error')
  const passed = errors.length === 0

  let summary: string
  if (issues.length === 0) {
    summary = `All ${contourLines.length} contour lines pass sanity checks. No self-crossings, absurd slopes, or isolated loops detected.`
  } else if (passed) {
    summary = `${issues.length} warning(s) but no errors. Contours are usable but check flagged issues.`
  } else {
    summary = `${errors.length} error(s) and ${issues.length - errors.length} warning(s). Contours have issues that should be fixed before export.`
  }

  return { issues, passed, summary }
}
