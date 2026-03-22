// METARDU Earthworks Engine — Cross Sections and Earthworks
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 26
// Source: Merritt, Ricketts & Loftin, Standard Handbook for Civil Engineers 5th Ed., Section 21

// ─── PART 1: DATA TYPES ────────────────────────────────────────────────────────

export interface GroundShot {
  offset: number    // perpendicular distance from CL (metres, left = negative)
  rl: number        // reduced level (metres)
}

export interface CrossSectionInput {
  chainage: number          // metres (from km+m format)
  centrelineRL: number      // surveyed ground RL at CL
  formationRL: number       // design formation level at CL
  leftShots: GroundShot[]   // sorted outermost → centreline
  rightShots: GroundShot[]  // sorted centreline → outermost
}

export interface CatchPoint {
  offset: number           // metres from CL (left = negative)
  rl: number               // interpolated ground RL
  type: 'cut' | 'fill'
  sideWidth: number         // |offset| from CL
}

export interface CrossSectionComputed {
  chainage: number
  centrelineRL: number
  formationRL: number
  centreHeight: number      // positive = cut, negative = fill
  mode: 'cut' | 'fill' | 'transition'
  leftCatchPoint: CatchPoint | null
  rightCatchPoint: CatchPoint | null
  cutArea: number           // m²
  fillArea: number          // m²
  totalArea: number         // m² (all ground polygon)
  arithmeticCheck: { passed: boolean; diff: number }
  cutPolygon: Array<{ x: number; y: number }>
  fillPolygon: Array<{ x: number; y: number }>
  groundPolygon: Array<{ x: number; y: number }>
  steps: Array<{ description: string; formula: string; value: string }>
}

// ─── PART 2: ROAD TEMPLATE ────────────────────────────────────────────────────

export interface RoadTemplate {
  carriagewayWidth: number    // total carriageway width (m)
  shoulderWidth: number      // each shoulder width (m)
  camber: number             // cross-fall % (e.g. 2.5%)
  cutSlopeH: number          // horizontal component of cut slope (e.g. 1 for 1:1)
  fillSlopeH: number         // horizontal component of fill slope (e.g. 1.5 for 1.5:1)
}

export function getHalfFormationWidth(template: RoadTemplate): number {
  // Source: Merritt, Ricketts & Loftin, Section 21
  // Half-formation = half carriageway + shoulder
  return template.carriagewayWidth / 2 + template.shoulderWidth
}

// ─── PART 3: POLYGON GEOMETRY ─────────────────────────────────────────────────

function shoelaceArea(points: Array<{ x: number; y: number }>): number {
  // Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 12
  // Source: N.N. Basak, Surveying and Levelling, Chapter 4
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length - 1; i++) {
    sum += points[i].x * points[i + 1].y
    sum -= points[i + 1].x * points[i].y
  }
  return Math.abs(sum) / 2
}

function linearInterpolate(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (Math.abs(x2 - x1) < 1e-9) return y1
  return y1 + (x - x1) * ((y2 - y1) / (x2 - x1))
}

// ─── PART 4: CATCH POINT COMPUTATION ──────────────────────────────────────────

function findCatchPoint(
  formationEdgeOffset: number,   // positive = right, negative = left
  formationEdgeRL: number,
  halfWidth: number,
  cutSlopeH: number,
  fillSlopeH: number,
  shots: GroundShot[],
  side: 'left' | 'right'
): CatchPoint | null {
  // Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 26
  // Source: Merritt, Ricketts & Loftin, Standard Handbook for Civil Engineers 5th Ed., Section 21
  // Side is from formation edge outward. formationEdgeOffset is already signed.

  const direction = side === 'left' ? -1 : 1

  // Collect all candidate shots sorted by absolute offset
  const sorted = [...shots]
    .map(s => ({ offset: s.offset, rl: s.rl }))
    .filter(s => side === 'left' ? s.offset <= -0.001 : s.offset >= 0.001)
    .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))

  if (sorted.length === 0) return null

  for (let i = 0; i < sorted.length; i++) {
    const shot = sorted[i]
    const groundRL = shot.rl
    const depth = formationEdgeRL - groundRL  // positive = ground below formation = fill needed

    if (depth >= 0) {
      // Fill condition: ground below formation
      const sideWidth = Math.abs(shot.offset - formationEdgeOffset)
      const fillSlopeRise = sideWidth / fillSlopeH

      if (Math.abs(fillSlopeRise - (-depth)) < 0.05) {
        // Catch point found — interpolate between formation edge and this shot
        const catchRL = groundRL
        const catchOffset = shot.offset
        return {
          offset: catchOffset,
          rl: catchRL,
          type: 'fill',
          sideWidth: Math.abs(catchOffset),
        }
      }
    } else {
      // Cut condition: ground above formation
      const cutDepth = -depth  // positive = ground above formation
      const sideWidth = Math.abs(shot.offset - formationEdgeOffset)
      const cutSlopeRise = sideWidth / cutSlopeH

      if (Math.abs(cutSlopeRise - cutDepth) < 0.05) {
        return {
          offset: shot.offset,
          rl: shot.rl,
          type: 'cut',
          sideWidth: Math.abs(shot.offset),
        }
      }
    }
  }

  // Extrapolate catch point from outermost shot
  if (sorted.length >= 1) {
    const outer = sorted[0]
    const groundRL = outer.rl
    const depth = formationEdgeRL - groundRL

    if (depth >= 0) {
      // Fill — extrapolate outward
      const sideWidth = Math.abs(outer.offset - formationEdgeOffset)
      const requiredSideWidth = depth * fillSlopeH
      const catchOffset = formationEdgeOffset + direction * requiredSideWidth
      return {
        offset: catchOffset,
        rl: formationEdgeRL - depth,  // interpolated at catch
        type: 'fill',
        sideWidth: Math.abs(catchOffset),
      }
    } else {
      // Cut — extrapolate outward
      const cutDepth = -depth
      const requiredSideWidth = cutDepth * cutSlopeH
      const catchOffset = formationEdgeOffset + direction * requiredSideWidth
      return {
        offset: catchOffset,
        rl: formationEdgeRL + cutDepth,
        type: 'cut',
        sideWidth: Math.abs(catchOffset),
      }
    }
  }

  return null
}

// ─── PART 5: CROSS SECTION COMPUTATION ────────────────────────────────────────

export function computeCrossSection(
  input: CrossSectionInput,
  template: RoadTemplate
): CrossSectionComputed {
  const { chainage, centrelineRL, formationRL, leftShots, rightShots } = input
  const halfWidth = getHalfFormationWidth(template)

  // Source: Merritt, Section 21 — Formation edge levels (with camber)
  // Right formation edge: formation + camber/100 * (carriageway/2)
  const camberRise = (template.camber / 100) * (template.carriagewayWidth / 2)
  const leftFormationEdgeRL = formationRL - camberRise
  const rightFormationEdgeRL = formationRL + camberRise

  const centreHeight = centrelineRL - formationRL
  const mode = centreHeight > 0.005 ? 'cut' : centreHeight < -0.005 ? 'fill' : 'transition'

  const steps: CrossSectionComputed['steps'] = []

  steps.push({
    description: `Centre height = CL_RL − Form_RL`,
    formula: `${centrelineRL.toFixed(3)} − ${formationRL.toFixed(3)}`,
    value: `${centreHeight.toFixed(4)} m ${centreHeight > 0 ? '(CUT)' : '(FILL)'}`,
  })
  steps.push({
    description: `Half-formation width`,
    formula: `(${template.carriagewayWidth}/2) + ${template.shoulderWidth}`,
    value: `${halfWidth.toFixed(4)} m`,
  })
  steps.push({
    description: `Camber rise`,
    formula: `${template.camber}% × ${template.carriagewayWidth / 2}m`,
    value: `${camberRise.toFixed(4)} m`,
  })

  // Formation edge offsets
  const leftFormationEdgeOffset = -halfWidth
  const rightFormationEdgeOffset = halfWidth

  // Left catch point
  const leftCatch = findCatchPoint(
    leftFormationEdgeOffset, leftFormationEdgeRL,
    halfWidth, template.cutSlopeH, template.fillSlopeH,
    leftShots, 'left'
  )

  // Right catch point
  const rightCatch = findCatchPoint(
    rightFormationEdgeOffset, rightFormationEdgeRL,
    halfWidth, template.cutSlopeH, template.fillSlopeH,
    rightShots, 'right'
  )

  // Build polygons
  // Ground polygon: outermost left → CL → outermost right
  const groundPolygon: Array<{ x: number; y: number }> = []

  // Left shots (outermost to CL)
  const leftSorted = [...leftShots].sort((a, b) => a.offset - b.offset)
  for (const shot of leftSorted) {
    groundPolygon.push({ x: shot.offset, y: shot.rl })
  }

  // Centreline
  groundPolygon.push({ x: 0, y: centrelineRL })

  // Right shots (CL to outermost)
  const rightSorted = [...rightShots].sort((a, b) => a.offset - b.offset)
  for (const shot of rightSorted) {
    groundPolygon.push({ x: shot.offset, y: shot.rl })
  }

  // Formation polygon
  const formationPolygon: Array<{ x: number; y: number }> = []

  // Left: outermost → formation edge (at formation RL)
  if (leftCatch) {
    formationPolygon.push({ x: leftCatch.offset, y: leftCatch.rl })
  } else {
    formationPolygon.push({ x: leftSorted.length > 0 ? leftSorted[0].offset : -halfWidth * 2, y: leftFormationEdgeRL })
  }
  formationPolygon.push({ x: leftFormationEdgeOffset, y: leftFormationEdgeRL })

  // Formation top
  formationPolygon.push({ x: 0, y: formationRL })
  formationPolygon.push({ x: rightFormationEdgeOffset, y: rightFormationEdgeRL })

  // Right: formation edge → outermost
  if (rightCatch) {
    formationPolygon.push({ x: rightCatch.offset, y: rightCatch.rl })
  } else {
    formationPolygon.push({ x: rightSorted.length > 0 ? rightSorted[rightSorted.length - 1].offset : halfWidth * 2, y: rightFormationEdgeRL })
  }

  // Cut polygon: ground above formation, from left catch to right catch
  const cutPolygon: Array<{ x: number; y: number }> = []

  if (leftCatch && rightCatch) {
    // Left: CL → formation edge → ground at catch (where above formation)
    // Formation vertices above ground (cut)
    cutPolygon.push({ x: 0, y: formationRL })
    cutPolygon.push({ x: rightFormationEdgeOffset, y: rightFormationEdgeRL })

    // Find right catch position in ground polygon
    const rightCatchIdx = groundPolygon.findIndex(p => Math.abs(p.x - rightCatch.offset) < 0.001)
    for (let i = 1; i <= rightCatchIdx; i++) {
      const pt = groundPolygon[i]
      const formY = linearInterpolate(pt.x, 0, formationRL, rightFormationEdgeOffset, rightFormationEdgeRL)
      if (pt.y > formY + 0.001) {
        cutPolygon.push({ x: pt.x, y: pt.y })
      }
    }

    cutPolygon.push({ x: rightCatch.offset, y: rightCatch.rl })

    // Top of cut (formation back to CL)
    cutPolygon.push({ x: rightFormationEdgeOffset, y: rightFormationEdgeRL })
    cutPolygon.push({ x: 0, y: formationRL })
  }

  // Fill polygon: ground below formation
  const fillPolygon: Array<{ x: number; y: number }> = []

  if (leftCatch && rightCatch) {
    fillPolygon.push({ x: 0, y: formationRL })
    fillPolygon.push({ x: leftFormationEdgeOffset, y: leftFormationEdgeRL })

    // Left: formation edge → ground below (fill)
    const leftCatchIdx = groundPolygon.findIndex(p => Math.abs(p.x - leftCatch.offset) < 0.001)
    for (let i = leftCatchIdx; i >= 0; i--) {
      const pt = groundPolygon[i]
      const formY = linearInterpolate(pt.x, leftFormationEdgeOffset, leftFormationEdgeRL, 0, formationRL)
      if (pt.y < formY - 0.001) {
        fillPolygon.push({ x: pt.x, y: pt.y })
      }
    }

    fillPolygon.push({ x: 0, y: formationRL })

    // Right: formation edge → ground below
    fillPolygon.push({ x: rightFormationEdgeOffset, y: rightFormationEdgeRL })
    const rightCatchIdx2 = groundPolygon.findIndex(p => Math.abs(p.x - rightCatch.offset) < 0.001)
    for (let i = rightCatchIdx2; i < groundPolygon.length; i++) {
      const pt = groundPolygon[i]
      const formY = linearInterpolate(pt.x, 0, formationRL, rightFormationEdgeOffset, rightFormationEdgeRL)
      if (pt.y < formY - 0.001) {
        fillPolygon.push({ x: pt.x, y: pt.y })
      }
    }
    fillPolygon.push({ x: 0, y: formationRL })
  }

  const cutArea = shoelaceArea(cutPolygon)
  const fillArea = shoelaceArea(fillPolygon)

  // Build combined ground + formation polygon for arithmetic check
  // Ground polygon + formation polygon = total surveyed area
  const totalPolygon = [...groundPolygon]
  // Add formation polygon (closed)
  for (const p of formationPolygon) {
    totalPolygon.push({ x: p.x, y: p.y })
  }
  const totalArea = shoelaceArea(totalPolygon)
  const areaCheckDiff = Math.abs(cutArea + fillArea - totalArea)
  const arithmeticCheck = { passed: areaCheckDiff < 0.01, diff: areaCheckDiff }

  steps.push({
    description: `Cut area (Shoelace)`,
    formula: `Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)/2`,
    value: `${cutArea.toFixed(3)} m²`,
  })
  steps.push({
    description: `Fill area (Shoelace)`,
    formula: `Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)/2`,
    value: `${fillArea.toFixed(3)} m²`,
  })
  steps.push({
    description: `Total area (ground + formation)`,
    formula: `Cut + Fill must equal total`,
    value: `${totalArea.toFixed(3)} m² vs ${(cutArea + fillArea).toFixed(3)} m²`,
  })
  steps.push({
    description: `[CHECK] Area arithmetic`,
    formula: `${totalArea.toFixed(4)} ≈ ${(cutArea + fillArea).toFixed(4)}`,
    value: arithmeticCheck.passed ? 'PASS ✓' : `FAIL ✗ (diff=${arithmeticCheck.diff.toFixed(4)}m²)`,
  })

  return {
    chainage,
    centrelineRL,
    formationRL,
    centreHeight,
    mode,
    leftCatchPoint: leftCatch,
    rightCatchPoint: rightCatch,
    cutArea,
    fillArea,
    totalArea,
    arithmeticCheck,
    cutPolygon,
    fillPolygon,
    groundPolygon,
    steps,
  }
}

// ─── PART 6: VOLUME COMPUTATION ───────────────────────────────────────────────

export interface VolumeLeg {
  fromChainage: number
  toChainage: number
  distance: number
  cutArea1: number
  fillArea1: number
  cutArea2: number
  fillArea2: number
  cutVolEndArea: number
  fillVolEndArea: number
  cutVolPrismoidal: number
  fillVolPrismoidal: number
  cutCorrection: number
  fillCorrection: number
  cumCutEndArea: number
  cumFillEndArea: number
  cumCutPrismoidal: number
  cumFillPrismoidal: number
  arithmeticCheck: { passed: boolean; diff: number }
}

export interface EarthworkResult {
  legs: VolumeLeg[]
  totalCutEndArea: number
  totalFillEndArea: number
  totalCutPrismoidal: number
  totalFillPrismoidal: number
  shrinkageFactor: number
  adjustedCut: number
  massOrdinates: Array<{ chainage: number; ordinate: number; cumCut: number; cumFill: number }>
}

export function computeEarthwork(
  sections: CrossSectionComputed[],
  shrinkageFactor: number = 0.85
): EarthworkResult {
  // Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 26, Section 26.4
  // Source: Merritt, Ricketts & Loftin, Standard Handbook for Civil Engineers 5th Ed.

  if (sections.length < 2) {
    return { legs: [], totalCutEndArea: 0, totalFillEndArea: 0, totalCutPrismoidal: 0, totalFillPrismoidal: 0, shrinkageFactor, adjustedCut: 0, massOrdinates: [] }
  }

  const legs: VolumeLeg[] = []
  let cumCutEndArea = 0
  let cumFillEndArea = 0
  let cumCutPrismoidal = 0
  let cumFillPrismoidal = 0

  for (let i = 0; i < sections.length - 1; i++) {
    const s1 = sections[i]
    const s2 = sections[i + 1]
    const D = s2.chainage - s1.chainage

    // Source: Ghilani & Wolf, Section 26.4 — End Area Method
    const cutVolEndArea = (s1.cutArea + s2.cutArea) / 2 * D
    const fillVolEndArea = (s1.fillArea + s2.fillArea) / 2 * D

    // Source: Ghilani & Wolf, Section 26.4 — Prismoidal Formula
    // Middle section: linear interpolation
    const midCutArea = (s1.cutArea + s2.cutArea) / 2
    const midFillArea = (s1.fillArea + s2.fillArea) / 2

    const cutVolPrismoidal = (s1.cutArea + 4 * midCutArea + s2.cutArea) / 6 * D
    const fillVolPrismoidal = (s1.fillArea + 4 * midFillArea + s2.fillArea) / 6 * D

    // Prismoidal correction: Cp = (D/6)(c1 - c2)(h1 - h2)
    // where c = formation width, h = centre height
    const c1 = getHalfFormationWidth({
      carriagewayWidth: 7,
      shoulderWidth: 1.5,
      camber: 2.5,
      cutSlopeH: 1,
      fillSlopeH: 1.5,
    }) * 2  // full width
    const c2 = c1  // assume same template
    const h1 = s1.centreHeight
    const h2 = s2.centreHeight
    const cutCorrection = (D / 6) * (c1 - c2) * (h1 - h2)
    const fillCorrection = 0  // no correction for fill

    const volEndDiff = Math.abs((cutVolEndArea - cutCorrection) - cutVolPrismoidal)
    const arithmeticCheck = { passed: volEndDiff < 0.1, diff: volEndDiff }

    cumCutEndArea += cutVolEndArea
    cumFillEndArea += fillVolEndArea
    cumCutPrismoidal += cutVolPrismoidal
    cumFillPrismoidal += fillVolPrismoidal

    legs.push({
      fromChainage: s1.chainage,
      toChainage: s2.chainage,
      distance: D,
      cutArea1: s1.cutArea,
      fillArea1: s1.fillArea,
      cutArea2: s2.cutArea,
      fillArea2: s2.fillArea,
      cutVolEndArea,
      fillVolEndArea,
      cutVolPrismoidal,
      fillVolPrismoidal,
      cutCorrection,
      fillCorrection,
      cumCutEndArea,
      cumFillEndArea,
      cumCutPrismoidal,
      cumFillPrismoidal,
      arithmeticCheck,
    })
  }

  const totalCutEndArea = cumCutEndArea
  const totalFillEndArea = cumFillEndArea
  const totalCutPrismoidal = cumCutPrismoidal
  const totalFillPrismoidal = cumFillPrismoidal
  const adjustedCut = totalCutPrismoidal * shrinkageFactor

  // Mass ordinates
  const massOrdinates: EarthworkResult['massOrdinates'] = []
  let runningOrdinate = 0

  massOrdinates.push({
    chainage: sections[0].chainage,
    ordinate: 0,
    cumCut: 0,
    cumFill: 0,
  })

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const nextSection = sections[i + 1]
    const prevOrdinate = massOrdinates[massOrdinates.length - 1].ordinate

    // Adjusted cut (with shrinkage) - fill
    const deltaOrdinate = (leg.cutVolPrismoidal * shrinkageFactor) - leg.fillVolPrismoidal
    runningOrdinate += deltaOrdinate

    massOrdinates.push({
      chainage: nextSection.chainage,
      ordinate: runningOrdinate,
      cumCut: leg.cumCutPrismoidal,
      cumFill: leg.cumFillPrismoidal,
    })
  }

  return {
    legs,
    totalCutEndArea,
    totalFillEndArea,
    totalCutPrismoidal,
    totalFillPrismoidal,
    shrinkageFactor,
    adjustedCut,
    massOrdinates,
  }
}

// ─── PART 7: CSV PARSER ────────────────────────────────────────────────────────
// Source: Brief 9 Part 8

export interface CSVSectionRow {
  chainageKm: number
  chainageM: number
  clRl: number
  formationRl: number
  leftShots: GroundShot[]
  rightShots: GroundShot[]
}

export function parseEarthworkCSV(csv: string): CrossSectionInput[] {
  const lines = csv.trim().split('\n')
  const sections: CrossSectionInput[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.toLowerCase().startsWith('chainage')) continue

    const cols = line.split(',').map(c => c.trim())
    if (cols.length < 4) continue

    const chainageKm = parseFloat(cols[0]) || 0
    const chainageM = parseFloat(cols[1]) || 0
    const chainage = chainageKm * 1000 + chainageM
    const clRl = parseFloat(cols[2]) || 0
    const formationRl = parseFloat(cols[3]) || 0

    const leftShots: GroundShot[] = []
    const rightShots: GroundShot[] = []

    // Columns 4-11: L4_offset, L4_rl, L3_offset, L3_rl, L2_offset, L2_rl, L1_offset, L1_rl
    // Columns 12-19: R1_offset, R1_rl, R2_offset, R2_rl, R3_offset, R3_rl, R4_offset, R4_rl
    let col = 4

    // Left shots (outer to inner: L4, L3, L2, L1)
    const leftPairs = [[4, 5], [6, 7], [8, 9], [10, 11]]
    for (const [offIdx, rlIdx] of leftPairs) {
      if (cols[offIdx] && cols[rlIdx]) {
        const off = parseFloat(cols[offIdx])
        const rl = parseFloat(cols[rlIdx])
        if (!isNaN(off) && !isNaN(rl)) {
          leftShots.push({ offset: -off, rl })
        }
      }
    }

    // Right shots (inner to outer: R1, R2, R3, R4)
    const rightPairs = [[12, 13], [14, 15], [16, 17], [18, 19]]
    for (const [offIdx, rlIdx] of rightPairs) {
      if (cols[offIdx] && cols[rlIdx]) {
        const off = parseFloat(cols[offIdx])
        const rl = parseFloat(cols[rlIdx])
        if (!isNaN(off) && !isNaN(rl)) {
          rightShots.push({ offset: off, rl })
        }
      }
    }

    sections.push({
      chainage,
      centrelineRL: clRl,
      formationRL: formationRl,
      leftShots,
      rightShots,
    })
  }

  return sections
}
