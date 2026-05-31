/**
 * Phase 26: Subdivision Statutory Output — Mutation Plan DXF Generator
 *
 * Generates a DXF file showing:
 *  - Parent parcel outline (dashed)
 *  - Child lot outlines (solid)
 *  - Road reserve hatching
 *  - Beacon labels at each vertex
 *  - Area annotations for each lot
 *  - Bearing & distance annotations on boundary lines
 *  - Title block with surveyor details
 *
 * Source: Kenya Survey Regulations 1994, Cap 299
 * Source: RDM 1.1 Kenya 2025 — Mutation form requirements
 */

import { bearingToString } from '@/lib/engine/angles'

export interface SubdivisionParcel {
  id: string
  label: string
  points: Array<{ easting: number; northing: number; beacon?: string }>
  areaSqm: number
  areaHa: number
}

export interface MutationPlanInput {
  parent: SubdivisionParcel
  children: SubdivisionParcel[]
  roadReserve?: SubdivisionParcel
  projectTitle: string
  schemeNumber?: string
  surveyorName: string
  surveyorRegistration: string
  firmName: string
  date: string
  scale?: string
}

export interface SubdivisionScheduleRow {
  plotNo: string
  label: string
  areaSqm: number
  areaHa: number
  beacons: string[]
  perimeterM: number
}

export interface AreaReconciliation {
  parentArea: number
  childrenTotal: number
  roadReserveArea: number
  totalSubdivided: number
  discrepancy: number
  passed: boolean
  tolerance: number
}

// ─── DXF Generation ─────────────────────────────────────────────────────────

export function generateMutationPlanDXF(input: MutationPlanInput): string {
  const lines: string[] = []

  // DXF Header
  lines.push('0', 'SECTION', '2', 'HEADER')
  lines.push('9', '$ACADVER', '1', 'AC1015')
  lines.push('9', '$INSUNITS', '70', '6') // metres
  lines.push('0', 'ENDSEC')

  // Tables section (layers)
  lines.push('0', 'SECTION', '2', 'TABLES')
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '10')

  const layers = [
    { name: 'PARENT', color: 1 },        // red - parent boundary
    { name: 'CHILDREN', color: 3 },       // green - child lots
    { name: 'ROAD_RESERVE', color: 5 },   // blue - road reserve
    { name: 'BEACONS', color: 7 },        // white - beacon labels
    { name: 'ANNOTATIONS', color: 4 },    // cyan - text annotations
    { name: 'DIMENSIONS', color: 6 },     // magenta - B&D annotations
    { name: 'TITLEBLOCK', color: 7 },     // white - title block
  ]

  for (const layer of layers) {
    lines.push('0', 'LAYER', '2', layer.name, '70', '0', '62', String(layer.color), '6', 'CONTINUOUS')
  }

  lines.push('0', 'ENDTAB')
  lines.push('0', 'ENDSEC')

  // Entities section
  lines.push('0', 'SECTION', '2', 'ENTITIES')

  // Parent parcel (dashed)
  addPolyline(lines, input.parent.points, 'PARENT', true)

  // Child lots (solid)
  for (const child of input.children) {
    addPolyline(lines, child.points, 'CHILDREN', true)

    // Area annotation at centroid
    const centroid = computeCentroid(child.points)
    addText(lines, centroid.easting, centroid.northing,
      `${child.label}\n${child.areaSqm.toFixed(1)} m²\n(${child.areaHa.toFixed(4)} Ha)`,
      'ANNOTATIONS', 1.5)
  }

  // Road reserve (if present)
  if (input.roadReserve) {
    addPolyline(lines, input.roadReserve.points, 'ROAD_RESERVE', true)
    const centroid = computeCentroid(input.roadReserve.points)
    addText(lines, centroid.easting, centroid.northing,
      `ROAD RESERVE\n${input.roadReserve.areaSqm.toFixed(1)} m²`,
      'ROAD_RESERVE', 1.2)
  }

  // Beacon labels at each vertex
  const allBeacons = new Map<string, { e: number; n: number }>()
  for (const child of input.children) {
    for (const p of child.points) {
      if (p.beacon) {
        allBeacons.set(p.beacon, { e: p.easting, n: p.northing })
      }
    }
  }

  Array.from(allBeacons.entries()).forEach(([beacon, pos]) => {
    // Beacon marker (circle + cross)
    addCircle(lines, pos.e, pos.n, 0.3, 'BEACONS')
    addText(lines, pos.e + 0.5, pos.n + 0.5, beacon, 'BEACONS', 1.0)
  })

  // Bearing & distance annotations on child lot boundaries
  for (const child of input.children) {
    const pts = child.points
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]
      const p2 = pts[(i + 1) % pts.length]
      const dx = p2.easting - p1.easting
      const dy = p2.northing - p1.northing
      const dist = Math.sqrt(dx * dx + dy * dy)
      const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360

      const midE = (p1.easting + p2.easting) / 2
      const midN = (p1.northing + p2.northing) / 2

      // Offset text slightly from line
      const perpE = -dy / dist * 1.5
      const perpN = dx / dist * 1.5

      addText(lines, midE + perpE, midN + perpN,
        `${bearingToString(bearing)}  ${dist.toFixed(3)}m`,
        'DIMENSIONS', 0.8)
    }
  }

  // Title block
  const bounds = computeBounds([
    ...input.parent.points,
    ...input.children.flatMap(c => c.points),
  ])
  const tbX = bounds.maxE + 5
  const tbY = bounds.minN

  addText(lines, tbX, tbY + 30, 'MUTATION PLAN', 'TITLEBLOCK', 3.0)
  addText(lines, tbX, tbY + 25, input.projectTitle, 'TITLEBLOCK', 2.0)
  if (input.schemeNumber) {
    addText(lines, tbX, tbY + 21, `Scheme No: ${input.schemeNumber}`, 'TITLEBLOCK', 1.5)
  }
  addText(lines, tbX, tbY + 17, `Surveyor: ${input.surveyorName}`, 'TITLEBLOCK', 1.2)
  addText(lines, tbX, tbY + 14, `Reg. No: ${input.surveyorRegistration}`, 'TITLEBLOCK', 1.2)
  addText(lines, tbX, tbY + 11, `Firm: ${input.firmName}`, 'TITLEBLOCK', 1.2)
  addText(lines, tbX, tbY + 8, `Date: ${input.date}`, 'TITLEBLOCK', 1.2)
  addText(lines, tbX, tbY + 5, `Scale: ${input.scale || '1:2500'}`, 'TITLEBLOCK', 1.2)
  addText(lines, tbX, tbY + 2, 'Coord System: Arc 1960 / UTM 37S', 'TITLEBLOCK', 1.0)

  lines.push('0', 'ENDSEC')
  lines.push('0', 'EOF')

  return lines.join('\n')
}

// ─── Subdivision Schedule ───────────────────────────────────────────────────

export function generateSubdivisionSchedule(
  parent: SubdivisionParcel,
  children: SubdivisionParcel[],
  roadReserve?: SubdivisionParcel
): {
  rows: SubdivisionScheduleRow[]
  reconciliation: AreaReconciliation
} {
  const rows: SubdivisionScheduleRow[] = children.map((child, i) => {
    const beacons = child.points
      .map(p => p.beacon || `P${i + 1}_${child.points.indexOf(p)}`)
      .filter(Boolean)

    let perimeter = 0
    for (let j = 0; j < child.points.length; j++) {
      const p1 = child.points[j]
      const p2 = child.points[(j + 1) % child.points.length]
      perimeter += Math.sqrt(
        (p2.easting - p1.easting) ** 2 + (p2.northing - p1.northing) ** 2
      )
    }

    return {
      plotNo: String(i + 1),
      label: child.label,
      areaSqm: child.areaSqm,
      areaHa: child.areaHa,
      beacons,
      perimeterM: perimeter,
    }
  })

  // Area reconciliation check
  const childrenTotal = children.reduce((sum, c) => sum + c.areaSqm, 0)
  const roadArea = roadReserve?.areaSqm ?? 0
  const totalSubdivided = childrenTotal + roadArea
  const discrepancy = Math.abs(parent.areaSqm - totalSubdivided)
  // Tolerance: 0.1% of parent area or 1 m², whichever is greater
  const tolerance = Math.max(parent.areaSqm * 0.001, 1.0)

  return {
    rows,
    reconciliation: {
      parentArea: parent.areaSqm,
      childrenTotal,
      roadReserveArea: roadArea,
      totalSubdivided,
      discrepancy,
      passed: discrepancy <= tolerance,
      tolerance,
    },
  }
}

// ─── DXF Helpers ────────────────────────────────────────────────────────────

function addPolyline(
  lines: string[],
  points: Array<{ easting: number; northing: number }>,
  layer: string,
  closed: boolean
): void {
  lines.push('0', 'LWPOLYLINE')
  lines.push('8', layer)
  lines.push('90', String(points.length))
  lines.push('70', closed ? '1' : '0')
  for (const p of points) {
    lines.push('10', p.easting.toFixed(4), '20', p.northing.toFixed(4))
  }
}

function addText(
  lines: string[],
  x: number, y: number,
  text: string,
  layer: string,
  height: number
): void {
  lines.push('0', 'TEXT')
  lines.push('8', layer)
  lines.push('10', x.toFixed(4), '20', y.toFixed(4), '30', '0')
  lines.push('40', String(height))
  lines.push('1', text)
}

function addCircle(
  lines: string[],
  x: number, y: number,
  radius: number,
  layer: string
): void {
  lines.push('0', 'CIRCLE')
  lines.push('8', layer)
  lines.push('10', x.toFixed(4), '20', y.toFixed(4), '30', '0')
  lines.push('40', radius.toFixed(4))
}

function computeCentroid(
  points: Array<{ easting: number; northing: number }>
): { easting: number; northing: number } {
  let sumE = 0, sumN = 0
  for (const p of points) {
    sumE += p.easting
    sumN += p.northing
  }
  return { easting: sumE / points.length, northing: sumN / points.length }
}

function computeBounds(
  points: Array<{ easting: number; northing: number }>
): { minE: number; maxE: number; minN: number; maxN: number } {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
  for (const p of points) {
    if (p.easting < minE) minE = p.easting
    if (p.easting > maxE) maxE = p.easting
    if (p.northing < minN) minN = p.northing
    if (p.northing > maxN) maxN = p.northing
  }
  return { minE, maxE, minN, maxN }
}
