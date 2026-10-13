/**
 * Cross-Section Geometry Utilities
 *
 * Computes road formation templates, camber profiles, slope intercepts,
 * and cut/fill areas for road engineering cross-sections.
 *
 * References:
 *   - N.N. Basak, Surveying and Levelling, Ch. 8 — Earthwork computation
 *   - Ghilani & Wolf, Elementary Surveying, 16th Ed., §26.3
 *
 * Conventions:
 *   - Offsets are measured from centreline: negative = left, positive = right.
 *   - Levels are Reduced Levels (RL) in metres.
 *   - Slopes expressed as "1V:H" (e.g. "1:2" means 1 vertical, 2 horizontal).
 *   - Camber is a percentage (e.g. 2.5 means 2.5%).
 *   - No intermediate rounding — full floating point throughout.
 */

// ─── TYPES ─────────────────────────────────────────────────────────────────────
import { integrateProfileAreas, interpolateProfile, validateProfile } from './profileGeometry'

export interface ProfilePoint {
  offset: number
  level: number
}

export interface RoadTemplate {
  carriagewayWidth: number
  shoulderWidth: number
  cutSlope: string     // "1:2" format (V:H)
  fillSlope: string    // "1:1.5" format
  camber: number       // percentage, e.g. 2.5
  subgradeDepth: number
  shoulderCrossfall?: number // operator-entered percentage; never a hidden standard
}

function validateFormationTemplate(template: RoadTemplate, level: number) {
  if (![template.carriagewayWidth, template.shoulderWidth, template.camber, template.subgradeDepth, level].every(Number.isFinite) ||
    template.carriagewayWidth <= 0 || template.shoulderWidth < 0 || template.camber < 0 || template.subgradeDepth < 0) throw new RangeError('Supply finite approved formation dimensions, non-negative crossfall and depth.')
  parseSlopeRatio(template.cutSlope); parseSlopeRatio(template.fillSlope)
}
function uniqueFormation(points: ProfilePoint[]): ProfilePoint[] {
  return points.sort((a, b) => a.offset - b.offset).filter((p, i, list) => {
    if (i === 0 || p.offset !== list[i - 1].offset) return true
    if (p.level !== list[i - 1].level) throw new RangeError('Conflicting formation levels at a duplicate offset.')
    return false
  })
}

function shoulderFall(template: RoadTemplate): number {
  if (template.shoulderWidth === 0) return 0
  if (template.shoulderCrossfall == null || !Number.isFinite(template.shoulderCrossfall) || template.shoulderCrossfall < 0) throw new RangeError('Enter a finite non-negative approved shoulder crossfall.')
  return template.shoulderCrossfall / 100
}

function sideSlope(template: RoadTemplate, ground: ProfilePoint[], offset: number, level: number) {
  const observed = interpolateProfile(validateProfile(ground), offset)
  if (observed === null) throw new RangeError('Extend measured ground to cover both shoulders.')
  const isCut = observed >= level
  return { isCut, ratio: parseSlopeRatio(isCut ? template.cutSlope : template.fillSlope) }
}

// ─── SLOPE PARSING ─────────────────────────────────────────────────────────────

/**
 * Parse a slope string like "1:2", "1V:2H", "1:1.5" to a ratio (H per 1V).
 *
 * Examples:
 *   "1:2"   → 2    (for every 1m vertical, go 2m horizontal)
 *   "1:1.5" → 1.5
 *   "1:3"   → 3
 *
 * @param slope - Slope string in "1:H" or "1V:H" format
 * @returns Horizontal run per unit vertical rise
 * @throws Error if slope format is invalid
 */
export function parseSlopeRatio(slope: string): number {
  const trimmed = slope.trim().toUpperCase()

  // Match patterns like "1:2", "1V:2H", "1 V : 2 H"
  const match = trimmed.match(/^1\s*V?\s*:\s*(\d+(?:\.\d+)?)\s*H?$/)
  if (!match) {
    throw new Error(
      `Invalid slope format: "${slope}". Expected format: "1:H" or "1V:H" (e.g. "1:2").`
    )
  }

  const ratio = Number(match[1])
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError('Slope ratio must be finite and positive.')
  return ratio
}

// ─── CAMBER PROFILE ────────────────────────────────────────────────────────────

/**
 * Compute parabolic camber profile across the carriageway.
 *
 * Camber equation: y = c * x² where c = (camber / 100) / (CW/2).
 *
 * The camber creates a parabolic curve with the highest point at centreline
 * (formationLevel) sloping down symmetrically to both edges.
 *
 * Example: With 7m carriageway and 2.5% camber:
 *   - Half-width = 3.5m
 *   - c = 0.025 / 3.5; the specified average edge crossfall is 2.5%.
 *   - Edge level = formationLevel - 0.025 * 3.5 = formationLevel - 0.0875m
 *
 * @param carriagewayWidth - Total carriageway width in metres
 * @param camber - Camber percentage (e.g. 2.5 for 2.5%)
 * @param formationLevel - RL at centreline (top of camber)
 * @returns Array of {offset, level} points from left edge to right edge
 */
export function computeCamberProfile(
  carriagewayWidth: number,
  camber: number,
  formationLevel: number
): ProfilePoint[] {
  if (![carriagewayWidth, camber, formationLevel].every(Number.isFinite) || carriagewayWidth < 0 || camber < 0) throw new RangeError('Camber inputs must be finite and non-negative.')
  if (Math.ceil(carriagewayWidth / 0.5) > 10000) throw new RangeError('The camber profile exceeds the drawing point limit.')
  const halfWidth = carriagewayWidth / 2

  if (halfWidth <= 0) {
    return [{ offset: 0, level: formationLevel }]
  }

  // Average edge crossfall: edge drop = (camber / 100) * halfWidth.
  // This ensures the edge drop equals camber * halfWidth / 100
  const c = (camber / 100) / halfWidth

  // Generate points at 0.5m intervals along the carriageway
  const numPoints = Math.max(Math.ceil(carriagewayWidth / 0.5), 2)
  const points: ProfilePoint[] = []

  for (let i = 0; i <= numPoints; i++) {
    const x = -halfWidth + (carriagewayWidth * i) / numPoints
    const levelDrop = c * x * x
    points.push({
      offset: x,
      level: formationLevel - levelDrop,
    })
  }

  return uniqueFormation(points)
}

// ─── SLOPE INTERCEPT ───────────────────────────────────────────────────────────

/**
 * Compute where a cut or fill slope intersects the ground profile.
 *
 * For a CUT slope: the slope rises from the shoulder edge upward toward the ground.
 * For a FILL slope: the slope descends from the shoulder edge downward toward the ground.
 *
 * Uses linear interpolation between ground points to find the exact intersection.
 *
 * @param shoulderOffset - Horizontal offset of the shoulder edge from centreline
 * @param shoulderLevel - RL at the shoulder edge
 * @param slopeRatio - H per 1V (e.g., 2 means 1V:2H)
 * @param isCut - true for cut slope (going up from shoulder), false for fill slope
 * @param groundPoints - Ground profile points sorted by offset
 * @returns Intersection point {offset, level} or null if no intersection found
 */
export function computeSlopeIntercept(
  shoulderOffset: number, shoulderLevel: number, slopeRatio: number,
  isCut: boolean, groundPoints: ProfilePoint[]
): ProfilePoint | null {
  if (![shoulderOffset, shoulderLevel, slopeRatio].every(Number.isFinite) || slopeRatio <= 0) throw new RangeError('Slope parameters must be finite with a positive ratio.')
  if (groundPoints.length < 2) return null
  const sorted = validateProfile(groundPoints)
  const direction = shoulderOffset >= 0 ? 1 : -1
  const shoulderGround = interpolateProfile(sorted, shoulderOffset)
  if (shoulderGround === null) return null
  if (shoulderGround === shoulderLevel) return { offset: shoulderOffset, level: shoulderLevel }
  const slopeAt = (offset: number) => shoulderLevel + (isCut ? 1 : -1) * direction * (offset - shoulderOffset) / slopeRatio
  const pairs = sorted.slice(1).map((p, i) => [sorted[i], p])
  if (direction < 0) pairs.reverse()
  for (const [p, q] of pairs) {
    const a = direction > 0 ? Math.max(p.offset, shoulderOffset) : p.offset
    const b = direction < 0 ? Math.min(q.offset, shoulderOffset) : q.offset
    if (b <= a) continue
    const ga = interpolateProfile(sorted, a), gb = interpolateProfile(sorted, b)
    if (ga === null || gb === null) continue
    const d1 = ga - slopeAt(a), d2 = gb - slopeAt(b)
    if (d1 * d2 > 0) continue
    const x = d1 === d2 ? (direction > 0 ? a : b) : a + (b - a) * d1 / (d1 - d2)
    const level = interpolateProfile(sorted, x)
    if (level !== null) return { offset: x, level }
  }
  return null
}

// ─── FORMATION LINE ────────────────────────────────────────────────────────────

/**
 * Compute the full formation line (carriageway + shoulders + slope intercepts).
 *
 * Builds the complete road template cross-section:
 *   1. Left slope intercept (if ground is above shoulder → cut, below → fill)
 *   2. Left shoulder
 *   3. Carriageway with parabolic camber
 *   4. Right shoulder
 *   5. Right slope intercept
 *
 * Shoulder crossfall is supplied explicitly. Each side uses its own measured cut/fill condition.
 *
 * @param template - Road template parameters
 * @param formationLevel - RL at centreline
 * @param groundPoints - Natural ground profile
 * @param _isCut - Legacy caller hint; side conditions are determined from measured ground
 * @returns Array of {offset, level} points defining the formation template
 */
export function computeFormationLine(
  template: RoadTemplate,
  formationLevel: number,
  groundPoints: ProfilePoint[],
  _isCut: boolean
): ProfilePoint[] {
  validateFormationTemplate(template, formationLevel)
  const {
    carriagewayWidth,
    shoulderWidth,
    camber,
  } = template

  const halfCW = carriagewayWidth / 2
  const points: ProfilePoint[] = []

  // Determine slope ratio based on section mode
  const shoulderCrossfall = shoulderFall(template)

  // --- Left side ---

  // Left carriageway edge level (from camber profile)
  const leftEdgeLevel = formationLevel - (camber / 100) * halfCW

  // Left shoulder outer edge
  const leftShoulderOffset = -(halfCW + shoulderWidth)
  const leftShoulderLevel = leftEdgeLevel - shoulderCrossfall * shoulderWidth
  const leftSlope = sideSlope(template, groundPoints, leftShoulderOffset, leftShoulderLevel)

  // Left slope intercept
  const leftIntercept = computeSlopeIntercept(
    leftShoulderOffset,
    leftShoulderLevel,
    leftSlope.ratio,
    leftSlope.isCut,
    groundPoints
  )

  // --- Right side ---

  // Right carriageway edge level (from camber profile)
  const rightEdgeLevel = formationLevel - (camber / 100) * halfCW

  // Right shoulder outer edge
  const rightShoulderOffset = halfCW + shoulderWidth
  const rightShoulderLevel = rightEdgeLevel - shoulderCrossfall * shoulderWidth
  const rightSlope = sideSlope(template, groundPoints, rightShoulderOffset, rightShoulderLevel)

  // Right slope intercept
  const rightIntercept = computeSlopeIntercept(
    rightShoulderOffset,
    rightShoulderLevel,
    rightSlope.ratio,
    rightSlope.isCut,
    groundPoints
  )

  if (!leftIntercept || !rightIntercept) throw new RangeError('Extend measured ground to capture both slope daylight points; extrapolation is not used.')

  // --- Build points array (left to right) ---

  // Left slope
  if (leftIntercept) {
    points.push(leftIntercept)
  }
  points.push({ offset: leftShoulderOffset, level: leftShoulderLevel })

  // Left carriageway edge
  points.push({ offset: -halfCW, level: leftEdgeLevel })

  // Carriageway with camber (centre point only — for key points)
  // Full camber profile can be generated separately
  points.push({ offset: 0, level: formationLevel })

  // Right carriageway edge
  points.push({ offset: halfCW, level: rightEdgeLevel })

  // Right shoulder
  points.push({ offset: rightShoulderOffset, level: rightShoulderLevel })

  // Right slope
  if (rightIntercept) {
    points.push(rightIntercept)
  }

  return uniqueFormation(points)
}

/**
 * Compute the full formation line with detailed camber points for rendering.
 *
 * This returns a more detailed set of points including multiple camber profile
 * points across the carriageway (instead of just edge-centre-edge).
 */
export function computeDetailedFormationLine(
  template: RoadTemplate,
  formationLevel: number,
  groundPoints: ProfilePoint[],
  _isCut: boolean
): ProfilePoint[] {
  validateFormationTemplate(template, formationLevel)
  const {
    carriagewayWidth,
    shoulderWidth,
    camber,
  } = template

  const halfCW = carriagewayWidth / 2
  const points: ProfilePoint[] = []

  const shoulderCrossfall = shoulderFall(template)

  // Left carriageway edge level
  const leftEdgeLevel = formationLevel - (camber / 100) * halfCW
  const rightEdgeLevel = formationLevel - (camber / 100) * halfCW

  // Left shoulder
  const leftShoulderOffset = -(halfCW + shoulderWidth)
  const leftShoulderLevel = leftEdgeLevel - shoulderCrossfall * shoulderWidth

  // Right shoulder
  const rightShoulderOffset = halfCW + shoulderWidth
  const rightShoulderLevel = rightEdgeLevel - shoulderCrossfall * shoulderWidth
  const leftSlope = sideSlope(template, groundPoints, leftShoulderOffset, leftShoulderLevel)
  const rightSlope = sideSlope(template, groundPoints, rightShoulderOffset, rightShoulderLevel)

  // Slope intercepts
  const leftIntercept = computeSlopeIntercept(
    leftShoulderOffset,
    leftShoulderLevel,
    leftSlope.ratio,
    leftSlope.isCut,
    groundPoints
  )
  const rightIntercept = computeSlopeIntercept(
    rightShoulderOffset,
    rightShoulderLevel,
    rightSlope.ratio,
    rightSlope.isCut,
    groundPoints
  )

  if (!leftIntercept || !rightIntercept) throw new RangeError('Extend measured ground to capture both slope daylight points; extrapolation is not used.')

  // Left slope
  if (leftIntercept) {
    points.push(leftIntercept)
  }
  points.push({ offset: leftShoulderOffset, level: leftShoulderLevel })
  points.push({ offset: -halfCW, level: leftEdgeLevel })

  // Detailed camber profile
  const camberProfile = computeCamberProfile(carriagewayWidth, camber, formationLevel)
  for (const cp of camberProfile) {
    // Skip duplicate points at edges and centre
    if (Math.abs(cp.offset - (-halfCW)) < 0.01) continue
    if (Math.abs(cp.offset - halfCW) < 0.01) continue
    if (Math.abs(cp.offset) < 0.01) continue
    points.push(cp)
  }

  // Centre point
  points.push({ offset: 0, level: formationLevel })

  // Right carriageway edge
  points.push({ offset: halfCW, level: rightEdgeLevel })
  points.push({ offset: rightShoulderOffset, level: rightShoulderLevel })

  // Right slope
  if (rightIntercept) {
    points.push(rightIntercept)
  }

  // Sort by offset to ensure correct rendering order
  return uniqueFormation(points)
}

// ─── CUT/FILL AREA (SHOELACE METHOD) ───────────────────────────────────────────

/**
 * Compute the area between ground profile and formation line using the shoelace formula.
 *
 * The function creates a closed polygon by tracing:
 *   1. Ground profile from left to right
 *   2. Formation line from right to left
 *   3. Close back to start
 *
 * Shoelace formula (surveyor's formula):
 *   A = ½ |Σ(xᵢyᵢ₊₁ - xᵢ₊₁yᵢ)|
 *
 * Sign convention:
 *   - Positive result = cut (ground above formation, material to remove)
 *   - Negative result = fill (ground below formation, material to add)
 *
 * Reference: Ghilani & Wolf, Elementary Surveying, §26.3
 *
 * @param groundPoints - Ground profile points (sorted by offset)
 * @param formationPoints - Formation line points (sorted by offset)
 * @returns Signed area: positive = cut, negative = fill (m²)
 */
export function computeCutFillArea(groundPoints: ProfilePoint[], formationPoints: ProfilePoint[]): number {
  if (groundPoints.length < 2 || formationPoints.length < 2) return 0
  return integrateProfileAreas(groundPoints, formationPoints).netArea
}

// ─── UTILITY FUNCTIONS ─────────────────────────────────────────────────────────

/**
 * Determine whether a cross-section is predominantly cut or fill.
 *
 * A section is "cut" if the ground level at centreline is above the formation level,
 * "fill" if below, and "mixed" if there are significant areas of both.
 *
 * @param groundPoints - Ground profile points
 * @param formationLevel - Formation RL at centreline
 * @returns 'cut' | 'fill' | 'mixed'
 */
export function determineSectionType(
  groundPoints: ProfilePoint[],
  formationLevel: number
): 'cut' | 'fill' | 'mixed' {
  if (groundPoints.length === 0) return 'fill'

  const sorted = [...groundPoints].sort((a, b) => a.offset - b.offset)

  let aboveCount = 0
  let belowCount = 0

  for (const p of sorted) {
    if (p.level > formationLevel) aboveCount++
    else if (p.level < formationLevel) belowCount++
  }

  if (aboveCount === 0) return 'fill'
  if (belowCount === 0) return 'cut'

  // If more than 70% of points are on one side, classify as that side
  const total = aboveCount + belowCount
  if (aboveCount / total > 0.7) return 'cut'
  if (belowCount / total > 0.7) return 'fill'

  return 'mixed'
}

/**
 * Format chainage as "Km+mmm.ddd" for display.
 *
 * @param chainage - Chainage in metres
 * @returns Formatted chainage string
 */
export function formatChainage(chainage: number): string {
  const km = Math.floor(chainage / 1000)
  const m = chainage % 1000
  return km > 0
    ? `${km}+${m.toFixed(3).padStart(6, '0')}`
    : `${m.toFixed(3)}`
}

/**
 * Compute ground level at centreline by interpolation.
 */
export function interpolateGroundAtCentre(
  groundPoints: ProfilePoint[]
): number | null {
  if (groundPoints.length === 0) return null

  const sorted = [...groundPoints].sort((a, b) => a.offset - b.offset)

  // Check if we have a point at offset 0
  const exact = sorted.find(p => Math.abs(p.offset) < 0.001)
  if (exact) return exact.level

  // Check if offset 0 is within the range
  if (sorted[0].offset > 0 || sorted[sorted.length - 1].offset < 0) {
    // Extrapolate from the nearest two points
    if (sorted[0].offset > 0) {
      const p1 = sorted[0]
      const p2 = sorted[1] || p1
      const dOffset = p2.offset - p1.offset
      if (Math.abs(dOffset) < 1e-12) return p1.level
      return p1.level + (-p1.offset / dOffset) * (p2.level - p1.level)
    }
    const p1 = sorted[sorted.length - 2] || sorted[0]
    const p2 = sorted[sorted.length - 1]
    const dOffset = p2.offset - p1.offset
    if (Math.abs(dOffset) < 1e-12) return p2.level
    return p1.level + (-p1.offset / dOffset) * (p2.level - p1.level)
  }

  // Linear interpolation
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].offset <= 0 && sorted[i + 1].offset >= 0) {
      const t = -sorted[i].offset / (sorted[i + 1].offset - sorted[i].offset)
      return sorted[i].level + t * (sorted[i + 1].level - sorted[i].level)
    }
  }

  return null
}
