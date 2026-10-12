/**
 * Subdivision / Amalgamation Scheme Plan — SVG & Print Renderer
 *
 * Produces an A3 landscape draft from user-supplied geometry and metadata.
 *
 * Page Specification:
 * - Dimensions: Standard A3 Landscape (420mm × 297mm)
 * - Units: Millimeters (mm), vector SVG with high-DPI font metrics
 * - Drawing layers:
 *   1. Page background & Double-bezel border
 *   2. A coordinate grid positioned from the registered project CRS
 *   3. Main subdivision parcels with bearings, distances, beacons, and Ha areas
 *   4. Supplied road reserve polygons (when spatial geometry is available)
 *   5. User-entered location references and notes, clearly marked as not to scale
 *   6. Draft metadata and review status, without claiming official approval
 */

import type {
  SubdivisionPlanData,
  SubdivisionPortion,
  PlanPoint2D
} from './types'
import { escapeXml } from '@/lib/xml/escape'
import { coordinateArea } from '@/lib/engine/area'
import { resolveProjectCadCrs } from '@/lib/cad/projectCadDocument'
import {
  hasPolygonInteriorOverlap,
  isSimplePolygonRing,
  polygonInteriorPoint,
} from '@/lib/spatial/simplePolygon'
import {
  distance,
  bearingFromDelta,
  bearingToDMS,
  midpoint,
} from '@/lib/reports/surveyPlan/geometry'

// ─── Layout Dimensions (mm) ────────────────────────────────────────────────
const PAGE_W = 420
const PAGE_H = 297

const BORDER_OUTER_INSET = 5
const BORDER_INNER_INSET = 9

const DIVIDER_X = 304 // Separates main drawing area from right admin column

const FONT_SERIF = "'Times New Roman', Times, serif"
const FONT_SANS = "'Arial', 'Helvetica Neue', sans-serif"

interface BoundingBox {
  minE: number
  maxE: number
  minN: number
  maxN: number
}

function computePortionsBoundingBox(
  portions: SubdivisionPortion[],
  roads: SubdivisionPlanData['roadReserves'],
): BoundingBox {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
  const rings = [
    ...portions.map((portion) => portion.boundaryPoints),
    ...roads.flatMap((road) => road.boundaryRings || []),
  ]
  for (const ring of rings) {
    if (!isSimplePolygonRing(ring)) continue
    for (const pt of ring) {
      if (pt.easting < minE) minE = pt.easting
      if (pt.easting > maxE) maxE = pt.easting
      if (pt.northing < minN) minN = pt.northing
      if (pt.northing > maxN) maxN = pt.northing
    }
  }
  if (!isFinite(minE)) {
    minE = 0; maxE = 1; minN = 0; maxN = 1
  }
  return { minE, maxE, minN, maxN }
}

/**
 * Render the complete Subdivision/Amalgamation Scheme Plan as SVG.
 */
export function renderSubdivisionPlan(data: SubdivisionPlanData): string {
  const parts: string[] = []
  let projectCrs: string | undefined
  try { projectCrs = data.projectCrs ? resolveProjectCadCrs(data.projectCrs) : undefined } catch { projectCrs = undefined }
  const locatedRoads = data.roadReserves.filter((road) =>
    road.boundaryRings?.length && road.boundaryRings.every(isSimplePolygonRing),
  )
  const allPlanRings = [
    ...data.portions.map((portion) => portion.boundaryPoints),
    ...locatedRoads.flatMap((road) => road.boundaryRings || []),
  ]
  const hasValidGeometry = Boolean(projectCrs)
    && data.portions.length > 0
    && data.portions.every((portion) => isSimplePolygonRing(portion.boundaryPoints))
    && !hasPolygonInteriorOverlap(allPlanRings)

  // SVG header (A3 landscape 420x297mm)
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}mm" height="${PAGE_H}mm" style="background:#ffffff; font-family:${FONT_SERIF};">`
  )

  // Defs & Symbols (Beacon glyphs, patterns)
  parts.push(`
  <defs>
    <style>
      .txt-title { font-family: ${FONT_SERIF}; font-weight: bold; fill: #000000; text-anchor: middle; }
      .txt-head { font-family: ${FONT_SERIF}; font-weight: bold; fill: #000000; }
      .txt-body { font-family: ${FONT_SERIF}; font-size: 2.8mm; fill: #000000; }
      .txt-small { font-family: ${FONT_SERIF}; font-size: 2.2mm; fill: #111111; }
      .txt-coord { font-family: ${FONT_SANS}; font-size: 2.2mm; fill: #000000; }
      .border-line { stroke: #000000; fill: none; stroke-linecap: square; }
    </style>
    <!-- Standard Cadastral Concrete Beacon Symbol -->
    <g id="beacon-concrete">
      <circle cx="0" cy="0" r="1.2" fill="#ffffff" stroke="#cc0000" stroke-width="0.35" />
      <circle cx="0" cy="0" r="0.4" fill="#cc0000" />
    </g>
    <!-- North Arrow Symbol -->
    <g id="north-arrow">
      <line x1="0" y1="12" x2="0" y2="-12" stroke="#000000" stroke-width="0.6" />
      <polygon points="0,-12 -2.5,-3 0,-6" fill="#000000" />
      <polygon points="0,-12 2.5,-3 0,-6" fill="#ffffff" stroke="#000000" stroke-width="0.3" />
      <text x="0" y="-14" text-anchor="middle" font-size="3.5" font-weight="bold" font-family="${FONT_SERIF}">GRID N</text>
    </g>
  </defs>`)

  // 1. Double Borders (Outer 0.7mm, Inner 0.35mm)
  parts.push(`
  <!-- Double-bezel outer border frame -->
  <rect x="${BORDER_OUTER_INSET}" y="${BORDER_OUTER_INSET}" width="${PAGE_W - 2 * BORDER_OUTER_INSET}" height="${PAGE_H - 2 * BORDER_OUTER_INSET}" stroke="#000000" stroke-width="0.7" fill="none" />
  <rect x="${BORDER_INNER_INSET}" y="${BORDER_INNER_INSET}" width="${PAGE_W - 2 * BORDER_INNER_INSET}" height="${PAGE_H - 2 * BORDER_INNER_INSET}" stroke="#000000" stroke-width="0.35" fill="none" />
  `)

  // 2. Vertical Divider between Main Drawing Area and Right Admin Column
  parts.push(`
  <!-- Admin Column Divider -->
  <line x1="${DIVIDER_X}" y1="${BORDER_INNER_INSET}" x2="${DIVIDER_X}" y2="${PAGE_H - BORDER_INNER_INSET}" stroke="#000000" stroke-width="0.4" />
  `)

  // 3. Main Drawing Area Setup
  const drawArea = {
    x1: BORDER_INNER_INSET + 2,
    y1: BORDER_INNER_INSET + 2,
    x2: DIVIDER_X - 2,
    y2: PAGE_H - BORDER_INNER_INSET - 2,
    w: DIVIDER_X - BORDER_INNER_INSET - 4,
    h: PAGE_H - 2 * BORDER_INNER_INSET - 4,
  }

  // Calculate real-world bounding box only for geometry with a registered
  // projected metre CRS. Empty/unreferenced drafts do not print invented grids.
  const geometry = hasValidGeometry ? data.portions : []
  const bbox = computePortionsBoundingBox(geometry, hasValidGeometry ? locatedRoads : [])
  const rangeE = Math.max(1, bbox.maxE - bbox.minE)
  const rangeN = Math.max(1, bbox.maxN - bbox.minN)

  // Margin buffer inside main draw area (leaving space for Location Plan inset and Notes block)
  // Main parcel plotted in central-right of drawing canvas
  const parcelCanvas = {
    x: drawArea.x1 + 65,
    y: drawArea.y1 + 18,
    w: drawArea.w - 75,
    h: drawArea.h - 32,
  }

  const scaleE = parcelCanvas.w / (rangeE * 1.35)
  const scaleN = parcelCanvas.h / (rangeN * 1.35)
  const plotScale = Math.min(scaleE, scaleN)
  const scaleDenominator = hasValidGeometry && plotScale > 0
    ? Math.max(1, Math.round(1000 / plotScale))
    : null

  // 4. Right-hand draft metadata column. Scale is derived from the actual A3 fit.
  parts.push(renderAdminColumn(
    data,
    scaleDenominator ? `1:${scaleDenominator}` : 'NOT PLOTTED',
    hasValidGeometry,
    projectCrs,
  ))

  const centerE = (bbox.minE + bbox.maxE) / 2
  const centerN = (bbox.minN + bbox.maxN) / 2
  const canvasCenterM = {
    x: parcelCanvas.x + parcelCanvas.w / 2,
    y: parcelCanvas.y + parcelCanvas.h / 2,
  }

  const toCanvasX = (e: number) => canvasCenterM.x + (e - centerE) * plotScale
  const toCanvasY = (n: number) => canvasCenterM.y - (n - centerN) * plotScale

  // 5. Coordinate grid labels are positioned from the actual CRS coordinates.
  if (hasValidGeometry) {
    parts.push(renderCoordinateGrid(bbox, centerE, centerN, plotScale, canvasCenterM, projectCrs!))
  } else {
    parts.push(`
      <text x="${drawArea.x1 + drawArea.w / 2}" y="${drawArea.y1 + drawArea.h / 2}" text-anchor="middle" font-size="3.2mm" font-weight="bold" fill="#92400e">BOUNDARY NOT PLOTTED</text>
      <text x="${drawArea.x1 + drawArea.w / 2}" y="${drawArea.y1 + drawArea.h / 2 + 7}" text-anchor="middle" font-size="2.4mm" fill="#78350f">Supply a closed boundary and registered projected metre CRS.</text>
    `)
  }

  // 6. Located road reserve polygons, followed by parcel boundaries.
  if (hasValidGeometry) {
    parts.push(renderRoadReserveGeometry(locatedRoads, toCanvasX, toCanvasY))
  }

  // 7. Subdivided Parcels.
  if (hasValidGeometry) parts.push(renderPortions(geometry, toCanvasX, toCanvasY))

  // 9. 1:5,000 Location Plan Inset (Top-Left)
  parts.push(renderLocationPlanInset(data.locationPlan, drawArea.x1 + 3, drawArea.y1 + 4))

  // 10. User notes and unlocated references (Bottom-Left)
  parts.push(renderPlanningNotesBox(data, hasValidGeometry, drawArea.x1 + 3, drawArea.y2 - 68))

  parts.push(`
    <g transform="translate(210,148) rotate(-24)">
      <text text-anchor="middle" font-size="18mm" font-weight="bold" fill="#b91c1c" fill-opacity="0.18" font-family="${FONT_SANS}">DRAFT — NOT AUTHORITY APPROVED</text>
    </g>
  `)

  // Close SVG
  parts.push('</svg>')
  return parts.join('\n')
}

// ─── Component Renderers ────────────────────────────────────────────────────

/**
 * Render the official Right-hand Approval Column
 */
function renderAdminColumn(
  data: SubdivisionPlanData,
  scaleLabel: string,
  hasValidGeometry: boolean,
  projectCrs?: string,
): string {
  const x = DIVIDER_X
  const w = PAGE_W - BORDER_INNER_INSET - DIVIDER_X
  const cx = x + w / 2

  const out: string[] = []

  // Draft header and user-entered authority name.
  out.push(`
  <!-- User-prepared draft metadata; not an authority template -->
  <text x="${cx}" y="15" text-anchor="middle" font-size="3.2mm" font-weight="bold" font-family="${FONT_SERIF}">SUBDIVISION/AMALGAMATION SCHEME PLAN</text>
  <text x="${cx}" y="20.5" text-anchor="middle" font-size="3.0mm" font-weight="bold" font-family="${FONT_SERIF}">COUNTY / AUTHORITY: ${escapeXml(data.countyName || 'NOT PROVIDED')}</text>
  <text x="${cx}" y="25" text-anchor="middle" font-size="2.3mm" font-family="${FONT_SERIF}">Verify current county submission requirements</text>
  <line x1="${x}" y1="28" x2="${PAGE_W - BORDER_INNER_INSET}" y2="28" stroke="#000000" stroke-width="0.3" />
  `)

  // Scheme Title & Portions Table (y: 28 -> 116)
  const portions = hasValidGeometry ? data.portions : []
  const numPortionsText = `${portions.length}`
  out.push(`
  <!-- Scheme Title -->
  <text x="${cx}" y="33" text-anchor="middle" font-size="2.6mm" font-weight="bold" font-family="${FONT_SERIF}">${hasValidGeometry ? 'PROPOSED SUBDIVISION OF PARCEL' : 'DRAFT PLAN · GEOMETRY NOT PLOTTED'}</text>
  <text x="${cx}" y="37" text-anchor="middle" font-size="2.6mm" font-weight="bold" font-family="${FONT_SERIF}">${hasValidGeometry ? `NO ${escapeXml(data.parcelNumber || 'PARCEL ID NOT PROVIDED')} INTO ${numPortionsText} PORTIONS` : 'VALID CLOSED RINGS AND A REGISTERED METRE CRS ARE REQUIRED'}</text>
  
  <line x1="${x}" y1="40" x2="${PAGE_W - BORDER_INNER_INSET}" y2="40" stroke="#000000" stroke-width="0.25" />
  <text x="${x + 4}" y="45" font-size="2.7mm" font-weight="bold" text-decoration="underline" font-family="${FONT_SERIF}">COORDINATE AREAS (HA)</text>
  `)

  // Table of Portions
  let tableY = 50
  for (const portion of portions) {
    const areaText = coordinateArea(portion.boundaryPoints).areaHa.toFixed(4)
    out.push(`
    <text x="${x + 6}" y="${tableY}" font-size="2.6mm" font-weight="bold" font-family="${FONT_SERIF}">${escapeXml(portion.label)} = ${areaText}</text>
    `)
    tableY += 4.5
  }

  // User, Ward, Location
  tableY = Math.max(tableY + 2, 70)
  out.push(`
  <text x="${x + 4}" y="${tableY}" font-size="2.2mm" font-family="${FONT_SERIF}">CRS: ${escapeXml(projectCrs || 'NOT REGISTERED / INVALID')}</text>
  <text x="${x + 4}" y="${tableY + 5}" font-size="2.5mm" font-family="${FONT_SERIF}">USER: <tspan font-weight="bold">${escapeXml(data.userCategory || 'NOT PROVIDED')}</tspan></text>
  <text x="${x + 4}" y="${tableY + 10}" font-size="2.5mm" font-family="${FONT_SERIF}">WARD: <tspan font-weight="bold">${escapeXml(data.ward || 'NOT PROVIDED')}</tspan></text>
  <text x="${x + 4}" y="${tableY + 15}" font-size="2.5mm" font-family="${FONT_SERIF}">LOCATION: <tspan font-weight="bold">${escapeXml(data.location || 'NOT PROVIDED')}</tspan></text>
  <line x1="${x}" y1="${tableY + 19}" x2="${PAGE_W - BORDER_INNER_INSET}" y2="${tableY + 19}" stroke="#000000" stroke-width="0.3" />
  `)

  // Owner(s) Block
  const ownerY = tableY + 22
  out.push(`
  <!-- User-entered client / land owner details -->
  <text x="${x + 4}" y="${ownerY}" font-size="2.7mm" font-weight="bold" font-family="${FONT_SERIF}">CLIENT / LAND OWNER DETAILS · USER ENTERED</text>
  <text x="${x + 4}" y="${ownerY + 5}" font-size="2.5mm" font-family="${FONT_SERIF}">NAME: ${escapeXml(data.owner?.name || '........................................')}</text>
  <text x="${x + 4}" y="${ownerY + 9.5}" font-size="2.5mm" font-family="${FONT_SERIF}">ADDRESS: ${escapeXml(data.owner?.address || '..................................')}</text>
  <text x="${x + 4}" y="${ownerY + 14}" font-size="2.5mm" font-family="${FONT_SERIF}">ID NO: ${escapeXml(data.owner?.idNo || '........................................')}</text>
  <text x="${x + 4}" y="${ownerY + 19}" font-size="2.2mm" font-family="${FONT_SERIF}">Identity and ownership have not been verified by METARDU.</text>
  <line x1="${x}" y1="${ownerY + 22}" x2="${PAGE_W - BORDER_INNER_INSET}" y2="${ownerY + 22}" stroke="#000000" stroke-width="0.3" />
  `)

  // User-entered professional details. Registration numbers are not verified.
  const plannerY = ownerY + 26
  out.push(`
  <!-- Professional details -->
  <text x="${x + 4}" y="${plannerY}" font-size="2.7mm" font-weight="bold" font-family="${FONT_SERIF}">PROFESSIONAL DETAILS · USER ENTERED</text>
  <text x="${x + 4}" y="${plannerY + 5}" font-size="2.3mm" font-family="${FONT_SERIF}">Physical planner: ${escapeXml(data.planner?.name || 'NOT PROVIDED')}</text>
  <text x="${x + 4}" y="${plannerY + 9}" font-size="2.3mm" font-family="${FONT_SERIF}">RPP No: ${escapeXml(data.planner?.rppNo || 'NOT PROVIDED')}</text>
  <text x="${x + 4}" y="${plannerY + 13}" font-size="2.3mm" font-family="${FONT_SERIF}">Licensed surveyor: ${escapeXml(data.surveyor?.name || 'NOT PROVIDED')}</text>
  <text x="${x + 4}" y="${plannerY + 17}" font-size="2.3mm" font-family="${FONT_SERIF}">L.S. No: ${escapeXml(data.surveyor?.lsNo || 'NOT PROVIDED')}</text>
  <text x="${x + 4}" y="${plannerY + 21}" font-size="1.9mm" font-family="${FONT_SERIF}">Professional details and registrations have not been verified.</text>
  <line x1="${x}" y1="${plannerY + 22}" x2="${PAGE_W - BORDER_INNER_INSET}" y2="${plannerY + 22}" stroke="#000000" stroke-width="0.3" />
  `)

  // Scale & Cadastral North Arrow
  const scaleY = plannerY + 26
  out.push(`
  <!-- Scale & North Arrow -->
  <text x="${x + 6}" y="${scaleY + 8}" font-size="3.0mm" font-weight="bold" font-family="${FONT_SERIF}">FIT SCALE: ${escapeXml(scaleLabel)}</text>
  <text x="${x + 6}" y="${scaleY + 12}" font-size="1.9mm" font-family="${FONT_SERIF}">A3 landscape · print at 100% to retain scale</text>
  <use href="#north-arrow" x="${PAGE_W - BORDER_INNER_INSET - 16}" y="${scaleY + 7}" />
  <line x1="${x}" y1="${scaleY + 16}" x2="${PAGE_W - BORDER_INNER_INSET}" y2="${scaleY + 16}" stroke="#000000" stroke-width="0.3" />
  `)

  // A generated draft never asserts county certification or approval.
  const approvalY = scaleY + 20
  out.push(`
  <text x="${x + 4}" y="${approvalY + 4}" font-size="2.7mm" font-weight="bold" font-family="${FONT_SERIF}">AUTHORITY REVIEW</text>
  <text x="${x + 4}" y="${approvalY + 10}" font-size="2.4mm" font-family="${FONT_SERIF}">Status: NOT SUBMITTED / NOT APPROVED</text>
  <text x="${x + 4}" y="${approvalY + 16}" font-size="2.2mm" font-family="${FONT_SERIF}">Authority: ${escapeXml(data.countyName || 'NOT PROVIDED')}</text>
  <text x="${x + 4}" y="${approvalY + 22}" font-size="2.2mm" font-family="${FONT_SERIF}">METARDU has no approval evidence for this draft.</text>
  `)

  return out.join('\n')
}

function niceGridInterval(range: number): number {
  const rough = Math.max(range / 4, 0.01)
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return step * power
}

/** Draw a coordinate grid whose labels are tied to their actual metre coordinates. */
function renderCoordinateGrid(
  bbox: BoundingBox,
  centerE: number,
  centerN: number,
  scale: number,
  canvasCenter: { x: number; y: number },
  projectCrs: string,
): string {
  const out: string[] = [`<text x="14" y="84" font-size="1.9mm" font-family="${FONT_SANS}">GRID CRS: ${escapeXml(projectCrs)} · GRID NORTH</text>`]
  const minX = canvasCenter.x + (bbox.minE - centerE) * scale
  const maxX = canvasCenter.x + (bbox.maxE - centerE) * scale
  const minY = canvasCenter.y - (bbox.maxN - centerN) * scale
  const maxY = canvasCenter.y - (bbox.minN - centerN) * scale
  const eInterval = niceGridInterval(bbox.maxE - bbox.minE)
  const nInterval = niceGridInterval(bbox.maxN - bbox.minN)

  for (let easting = Math.ceil(bbox.minE / eInterval) * eInterval; easting <= bbox.maxE; easting += eInterval) {
    const x = canvasCenter.x + (easting - centerE) * scale
    out.push(`<line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="#64748b" stroke-opacity="0.35" stroke-width="0.2" stroke-dasharray="1,1" />`)
    out.push(`<text x="${x}" y="${minY - 2}" text-anchor="middle" font-size="1.8mm" font-family="${FONT_SANS}">E ${easting.toFixed(0)}</text>`)
  }
  for (let northing = Math.ceil(bbox.minN / nInterval) * nInterval; northing <= bbox.maxN; northing += nInterval) {
    const y = canvasCenter.y - (northing - centerN) * scale
    out.push(`<line x1="${minX}" y1="${y}" x2="${maxX}" y2="${y}" stroke="#64748b" stroke-opacity="0.35" stroke-width="0.2" stroke-dasharray="1,1" />`)
    out.push(`<text x="${minX - 2}" y="${y + 0.8}" text-anchor="end" font-size="1.8mm" font-family="${FONT_SANS}">N ${northing.toFixed(0)}</text>`)
  }
  return out.join('\n')
}

function renderRoadReserveGeometry(
  roads: SubdivisionPlanData['roadReserves'],
  toCanvasX: (easting: number) => number,
  toCanvasY: (northing: number) => number,
): string {
  return roads.flatMap((road) => (road.boundaryRings || []).map((ring) => {
    const points = ring.map((point) => `${toCanvasX(point.easting).toFixed(2)},${toCanvasY(point.northing).toFixed(2)}`).join(' ')
    return `<polygon points="${points}" fill="#bfdbfe" fill-opacity="0.55" stroke="#1d4ed8" stroke-width="0.45" stroke-dasharray="2,1" aria-label="${escapeXml(road.label)} road reserve" />`
  })).join('\n')
}

/**
 * Render the supplied portions with bearings, distances and vertex symbols.
 */
function renderPortions(
  portions: SubdivisionPortion[],
  toCanvasX: (e: number) => number,
  toCanvasY: (n: number) => number
): string {
  const out: string[] = []

  // Default color: soft planning yellow (#FEF9C3 / #FFFDE7)
  const defaultFill = '#FEF9C3'

  for (const portion of portions) {
    if (portion.boundaryPoints.length < 3) continue

    const svgPoints = portion.boundaryPoints
      .map(p => `${toCanvasX(p.easting).toFixed(2)},${toCanvasY(p.northing).toFixed(2)}`)
      .join(' ')

    // 1. Polygon Fill & Border
    const fillColor = portion.fillColor && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(portion.fillColor)
      ? portion.fillColor
      : defaultFill
    out.push(`
    <!-- Portion ${escapeXml(portion.label)} Polygon -->
    <polygon points="${svgPoints}" fill="${fillColor}" stroke="#000000" stroke-width="0.45" stroke-linejoin="round" />
    `)

    // 2. Portion Label & Area in Center
    const c = polygonInteriorPoint(portion.boundaryPoints) || portion.boundaryPoints[0]
    const cx = toCanvasX(c.easting)
    const cy = toCanvasY(c.northing)
    out.push(`
    <g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)})">
      <rect x="-14" y="-7" width="28" height="14" fill="#ffffff" fill-opacity="0.85" rx="1" stroke="#333333" stroke-width="0.2" />
      <text x="0" y="-1" text-anchor="middle" font-size="3.2mm" font-weight="bold" font-family="${FONT_SERIF}">${escapeXml(portion.label)}</text>
      <text x="0" y="3.8" text-anchor="middle" font-size="2.5mm" font-weight="bold" font-family="${FONT_SERIF}">${coordinateArea(portion.boundaryPoints).areaHa.toFixed(4)} Ha</text>
    </g>
    `)

    // 3. Boundary Bearings, Distances & Beacons
    for (let i = 0; i < portion.boundaryPoints.length; i++) {
      const p1 = portion.boundaryPoints[i]
      const p2 = portion.boundaryPoints[(i + 1) % portion.boundaryPoints.length]

      const sx1 = toCanvasX(p1.easting)
      const sy1 = toCanvasY(p1.northing)
      const sx2 = toCanvasX(p2.easting)
      const sy2 = toCanvasY(p2.northing)

      // Beacon symbol at vertex
      out.push(`<use href="#beacon-concrete" x="${sx1.toFixed(2)}" y="${sy1.toFixed(2)}" />`)

      // Line bearing and distance
      const distM = distance(p1.easting, p1.northing, p2.easting, p2.northing)
      const bearingDeg = bearingFromDelta(p2.easting - p1.easting, p2.northing - p1.northing)
      const wcb = bearingToDMS(bearingDeg)

      const [midE, midN] = midpoint(p1.easting, p1.northing, p2.easting, p2.northing)
      const mx = toCanvasX(midE)
      const my = toCanvasY(midN)

      // Angle for text orientation
      let angle = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI
      if (angle > 90 || angle < -90) angle += 180

      if (distM > 12) { // Only label if segment is sufficiently long
        out.push(`
        <g transform="translate(${mx.toFixed(2)}, ${my.toFixed(2)}) rotate(${angle.toFixed(1)})">
          <text x="0" y="-1.5" text-anchor="middle" font-size="1.9mm" font-family="${FONT_SANS}">${wcb}</text>
          <text x="0" y="3.0" text-anchor="middle" font-size="1.9mm" font-family="${FONT_SANS}">${distM.toFixed(2)}m</text>
        </g>
        `)
      }
    }
  }

  return out.join('\n')
}

/** Render user-entered location references with their non-georeferenced status. */
function renderLocationPlanInset(
  inset: SubdivisionPlanData['locationPlan'],
  x: number,
  y: number
): string {
  const w = 78
  const h = 62

  return `
  <!-- Location reference details; this is not a georeferenced map inset. -->
  <g transform="translate(${x}, ${y})">
    <!-- Box frame -->
    <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#000000" stroke-width="0.35" />
    <text x="${w / 2}" y="5.5" text-anchor="middle" font-size="2.6mm" font-weight="bold" font-family="${FONT_SERIF}">LOCATION REFERENCE</text>
    <text x="${w / 2}" y="9" text-anchor="middle" font-size="1.9mm" font-family="${FONT_SERIF}">Not to scale / not georeferenced</text>
    <line x1="2" y1="11" x2="${w - 2}" y2="11" stroke="#000000" stroke-width="0.25" />
    <text x="4" y="18" font-size="2.1mm" font-family="${FONT_SERIF}">Landmark: ${escapeXml(inset?.landmarkName || 'NOT PROVIDED')}</text>
    <text x="4" y="24" font-size="2.0mm" font-family="${FONT_SERIF}">Access: ${escapeXml(inset?.accessRoadLabel || 'NOT PROVIDED')}</text>
    <text x="4" y="30" font-size="2.0mm" font-family="${FONT_SERIF}">Nearby parcels:</text>
    ${(inset?.nearbyParcels || []).slice(0, 4).map((parcel, index) => `<text x="6" y="${36 + index * 5}" font-size="1.9mm" font-family="${FONT_SERIF}">${escapeXml(parcel)}</text>`).join('\n') || '<text x="6" y="38" font-size="1.9mm" font-family="' + FONT_SERIF + '">NOT PROVIDED</text>'}
  </g>
  `
}

/** Render user notes and unlocated metadata without implying mapped geometry. */
function renderPlanningNotesBox(data: SubdivisionPlanData, hasValidGeometry: boolean, x: number, y: number): string {
  const w = 110
  const h = 64
  const references = [
    ...data.roadReserves.map((road) => {
      const rings = road.boundaryRings || []
      const status = !hasValidGeometry
        ? 'parcel boundary not plotted'
        : rings.length === 0
        ? 'alignment not supplied'
        : rings.every(isSimplePolygonRing) ? 'corridor geometry plotted' : 'invalid corridor geometry; not plotted'
      return `Road reserve: ${road.label} · ${road.widthM} m; ${status}`
    }),
    ...data.truncations.map((item) => `Truncation: ${item.atJunction} · ${item.truncationM} m; location not supplied`),
    ...data.abuttals.map((item) => `Abuttal ${item.direction}: ${item.label}; not plotted`),
    ...(data.notes || []),
  ].slice(0, 7)
  const noteLines = references.map((note, index) => (
    `<text x="4" y="${13 + index * 4.5}" font-size="1.85mm" font-family="${FONT_SERIF}">${escapeXml(note)}</text>`
  )).join('\n')

  return `
  <!-- Text references are not spatially located -->
  <g transform="translate(${x}, ${y})">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#000000" stroke-width="0.35" />
    <text x="4" y="6" font-size="2.35mm" font-weight="bold" font-family="${FONT_SERIF}">USER-ENTERED NOTES / REFERENCES</text>
    ${noteLines || `<text x="4" y="14" font-size="2.0mm" font-family="${FONT_SERIF}">No notes or road/abuttal references supplied.</text>`}
    <text x="4" y="52" font-size="1.9mm" font-weight="bold" font-family="${FONT_SERIF}">References above are metadata; they are not plotted.</text>
    <line x1="4" y1="55" x2="${w - 4}" y2="55" stroke="#000000" stroke-width="0.2" />
    <text x="4" y="60" font-size="2.0mm" font-weight="bold" font-family="${FONT_SERIF}">DRAFT · Confirm current authority requirements</text>
  </g>
  `
}
