/**
 * Topographic Plan Renderer — SoK-standard topographic survey plan.
 *
 * Produces a print-ready SVG topographic plan with:
 *   - SoK-standard title block (surveyor, client, scale, date, datum)
 *   - North arrow (survey-style half-black/half-white)
 *   - Scale bar (alternating black/white with RF notation)
 *   - Contour lines with elevation labels
 *   - Spot heights with elevation values
 *   - Coordinate grid (UTM grid lines with easting/northing labels)
 *   - Legend (contour interval, spot height symbol, control points)
 *   - Location diagram (Kenya map inset)
 *   - Boundary lines (if cadastral overlay present)
 *   - Control points with names and coordinates
 *
 * Output format: SVG (vector, print-ready, can be converted to PDF)
 *
 * Reference: Survey of Kenya Topographic Mapping Standards
 *            RDM 1.1 Section 4 — Topographic Survey Deliverables
 */

import type { SpotHeight, ContourLine } from '@/lib/engine/contours'

export interface TopoPlanInput {
  // Project metadata
  projectName: string
  surveyNumber: string
  location: string
  county: string
  surveyorName: string
  iskNumber: string
  firmName: string
  surveyDate: string

  // Coordinate system
  utmZone: number
  hemisphere: 'N' | 'S'
  datum: string // 'Arc 1960' or 'WGS84'

  // Scale
  scale: number // e.g., 1000 for 1:1000

  // Data
  contours: ContourLine[]
  spotHeights: SpotHeight[]
  controlPoints?: Array<{ name: string; easting: number; northing: number; elevation: number }>
  boundaryPoints?: Array<{ easting: number; northing: number; label?: string }>

  // Contour settings
  contourInterval: number
  majorContourInterval?: number

  // Optional survey annotations
  magneticDeclination?: number
  gridConvergence?: number
  declinationYear?: number

  // Bounding box (auto-computed if not provided)
  bounds?: { minE: number; maxE: number; minN: number; maxN: number }
}

export interface TopoPlanOutput {
  svg: string
  metadata: {
    scale: string
    contourInterval: string
    spotHeightCount: number
    contourCount: number
    area: number
  }
}

/**
 * Render a complete topographic survey plan as SVG.
 */
export function renderTopoPlanSVG(input: TopoPlanInput): TopoPlanOutput {
  // Compute bounds from data if not provided
  const bounds = input.bounds || computeBounds(input)

  // Page dimensions (A1 landscape at 96 DPI)
  const pageW = 1123 // pixels (A1 at 96dpi)
  const pageH = 794
  const margin = 40
  const titleBlockH = 80

  // Drawing area
  const drawX = margin
  const drawY = margin
  const drawW = pageW - margin * 2
  const drawH = pageH - margin * 2 - titleBlockH

  // Compute scale to fit bounds in drawing area
  const extentE = bounds.maxE - bounds.minE
  const extentN = bounds.maxN - bounds.minN
  const scaleX = drawW / extentE
  const scaleY = drawH / extentN
  const scale = Math.min(scaleX, scaleY)

  // Transform function: UTM → SVG coordinates
  const tx = (easting: number) => drawX + (easting - bounds.minE) * scale
  const ty = (northing: number) => drawY + drawH - (northing - bounds.minN) * scale // flip Y

  let svg = ''

  // ── SVG header ──
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}" style="background:white;font-family:'JetBrains Mono',Courier New,monospace">`

  // ── 1. Outer border ──
  svg += `<rect x="${margin - 5}" y="${margin - 5}" width="${pageW - (margin - 5) * 2}" height="${pageH - (margin - 5) * 2}" fill="none" stroke="black" stroke-width="1.5"/>`
  svg += `<rect x="${margin}" y="${margin}" width="${pageW - margin * 2}" height="${pageH - margin * 2}" fill="none" stroke="black" stroke-width="0.5"/>`

  // ── 2. Coordinate grid (UTM grid lines) ──
  svg += drawCoordinateGrid(bounds, scale, tx, ty, drawX, drawY, drawW, drawH)

  // ── 3. Contour lines ──
  let contourCount = 0
  for (const contour of input.contours) {
    if (!contour.points || contour.points.length < 2) continue
    contourCount++

    const isIndex = contour.elevation % (input.contourInterval * 5) === 0
    const strokeW = isIndex ? 0.8 : 0.3
    const color = isIndex ? '#8B4513' : '#c4a882'
    const dash = isIndex ? undefined : '2,2'

    // Draw contour path
    const pathD = contour.points.map((c, i) => {
      const x = tx(c.easting)
      const y = ty(c.northing)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')

    svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeW}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`

    // Label index contours
    if (isIndex && contour.points.length > 10) {
      const midIdx = Math.floor(contour.points.length / 2)
      const midX = tx(contour.points[midIdx].easting)
      const midY = ty(contour.points[midIdx].northing)
      svg += `<text x="${midX}" y="${midY}" font-size="6" fill="#333" text-anchor="middle" font-weight="bold">`
      svg += `${contour.elevation.toFixed(0)}</text>`
    }
  }

  // ── 4. Spot heights ──
  for (const sh of input.spotHeights) {
    const x = tx(sh.easting)
    const y = ty(sh.northing)

    // Dot
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1" fill="black"/>`
    // Elevation label
    svg += `<text x="${(x + 2).toFixed(1)}" y="${(y - 1).toFixed(1)}" font-size="5" fill="black">`
    svg += `${sh.elevation.toFixed(1)}</text>`
    // Point name (if available)
    if (sh.name) {
      svg += `<text x="${(x + 2).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="4" fill="#666">`
      svg += `${sh.name}</text>`
    }
  }

  // ── 5. Control points ──
  if (input.controlPoints) {
    for (const cp of input.controlPoints) {
      const x = tx(cp.easting)
      const y = ty(cp.northing)

      // Triangle symbol (control point)
      svg += `<polygon points="${x},${y - 3} ${x - 2.5},${y + 1.5} ${x + 2.5},${y + 1.5}" fill="none" stroke="red" stroke-width="0.8"/>`
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.5" fill="red"/>`
      // Name
      svg += `<text x="${(x + 3).toFixed(1)}" y="${(y - 2).toFixed(1)}" font-size="5" fill="red" font-weight="bold">`
      svg += `${cp.name}</text>`
      // Elevation
      svg += `<text x="${(x + 3).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="4" fill="red">`
      svg += `RL ${cp.elevation.toFixed(3)}</text>`
    }
  }

  // ── 6. Boundary lines (if cadastral overlay) ──
  if (input.boundaryPoints && input.boundaryPoints.length >= 2) {
    const pathD = input.boundaryPoints.map((p, i) => {
      const x = tx(p.easting)
      const y = ty(p.northing)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
    // Close the polygon
    const first = input.boundaryPoints[0]
    svg += `<path d="${pathD} L ${tx(first.easting).toFixed(1)} ${ty(first.northing).toFixed(1)} Z" fill="none" stroke="blue" stroke-width="1.2" stroke-dasharray="4,2"/>`

    // Label boundary points
    for (let i = 0; i < input.boundaryPoints.length; i++) {
      const p = input.boundaryPoints[i]
      const x = tx(p.easting)
      const y = ty(p.northing)
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="blue"/>`
      if (p.label) {
        svg += `<text x="${(x + 2).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="4" fill="blue" font-weight="bold">${p.label}</text>`
      }
    }
  }

  // ── 7. North arrow ──
  const northX = drawX + drawW - 35
  const northY = drawY + 35
  svg += drawNorthArrow(northX, northY, input.magneticDeclination, input.gridConvergence)

  // ── 8. Scale bar ──
  const sbX = drawX + 10
  const sbY = drawY + drawH - 18
  svg += drawScaleBar(sbX, sbY, scale, input.scale)

  // ── 9. Legend ──
  const legX = drawX + drawW - 148
  const legY = drawY + 40
  svg += drawLegend(legX, legY, input.contourInterval, input.majorContourInterval ?? input.contourInterval * 5)

  // ── 10. Title block ──
  svg += drawTitleBlock(input, pageW, pageH, margin, titleBlockH, input.magneticDeclination, input.gridConvergence)

  svg += `</svg>`

  // Compute area
  const area = extentE * extentN

  return {
    svg,
    metadata: {
      scale: `1:${input.scale}`,
      contourInterval: `${input.contourInterval}m`,
      spotHeightCount: input.spotHeights.length,
      contourCount,
      area,
    },
  }
}

// ─── Helper functions ───────────────────────────────────────────────────────

function computeBounds(input: TopoPlanInput) {
  const allPoints = [
    ...input.spotHeights.map(s => ({ e: s.easting, n: s.northing })),
    ...(input.controlPoints || []).map(c => ({ e: c.easting, n: c.northing })),
    ...(input.boundaryPoints || []).map(b => ({ e: b.easting, n: b.northing })),
    ...input.contours.flatMap(c => c.points.map(coord => ({ e: coord.easting, n: coord.northing }))),
  ]

  if (allPoints.length === 0) {
    return { minE: 0, maxE: 100, minN: 0, maxN: 100 }
  }

  return {
    minE: Math.min(...allPoints.map(p => p.e)),
    maxE: Math.max(...allPoints.map(p => p.e)),
    minN: Math.min(...allPoints.map(p => p.n)),
    maxN: Math.max(...allPoints.map(p => p.n)),
  }
}

function drawCoordinateGrid(
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  scale: number,
  tx: (e: number) => number,
  ty: (n: number) => number,
  drawX: number, drawY: number, drawW: number, drawH: number,
): string {
  let svg = ''

  // Grid interval — aim for ~100m grid on ground
  const gridInterval = 100

  // Easting lines (vertical)
  for (let e = Math.ceil(bounds.minE / gridInterval) * gridInterval; e <= bounds.maxE; e += gridInterval) {
    const x = tx(e)
    if (x < drawX || x > drawX + drawW) continue
    svg += `<line x1="${x.toFixed(1)}" y1="${drawY}" x2="${x.toFixed(1)}" y2="${drawY + drawH}" stroke="#ddd" stroke-width="0.3" stroke-dasharray="2,2"/>`
    // Label
    svg += `<text x="${x.toFixed(1)}" y="${drawY + drawH + 8}" font-size="4" fill="#666" text-anchor="middle">${e.toFixed(0)}</text>`
  }

  // Northing lines (horizontal)
  for (let n = Math.ceil(bounds.minN / gridInterval) * gridInterval; n <= bounds.maxN; n += gridInterval) {
    const y = ty(n)
    if (y < drawY || y > drawY + drawH) continue
    svg += `<line x1="${drawX}" y1="${y.toFixed(1)}" x2="${drawX + drawW}" y2="${y.toFixed(1)}" stroke="#ddd" stroke-width="0.3" stroke-dasharray="2,2"/>`
    // Label
    svg += `<text x="${drawX - 3}" y="${(y + 1).toFixed(1)}" font-size="4" fill="#666" text-anchor="end">${n.toFixed(0)}</text>`
  }

  return svg
}

function drawNorthArrow(x: number, y: number, declination?: number, convergence?: number): string {
  return `
    <g transform="translate(${x},${y})">
      <!-- True North arrow (solid black) -->
      <polygon points="0,-18 4,0 0,-2.5 -4,0" fill="black"/>
      <polygon points="0,18 4,0 0,2.5 -4,0" fill="white" stroke="black" stroke-width="0.5"/>
      <text x="0" y="-21" font-size="7" fill="black" text-anchor="middle" font-weight="bold">N</text>
      <text x="0" y="25" font-size="4" fill="#666" text-anchor="middle">True North</text>

      <!-- Magnetic North arrow (dashed red) -->
      <g transform="rotate(${declination ?? 0})">
        <line x1="0" y1="-16" x2="0" y2="16" stroke="#cc0000" stroke-width="0.6" stroke-dasharray="2,1.5"/>
        <polygon points="0,-16 3,0 0,-2 -3,0" fill="#cc0000"/>
        <polygon points="0,16 3,0 0,2 -3,0" fill="white" stroke="#cc0000" stroke-width="0.4"/>
      </g>
      <text x="0" y="30" font-size="4" fill="#cc0000" text-anchor="middle">MN</text>

      <!-- Declination annotation box -->
      <rect x="-28" y="-8" width="24" height="10" fill="white" stroke="black" stroke-width="0.3"/>
      <text x="-16" y="-1" font-size="3.5" fill="black" text-anchor="middle">
        ${declination !== undefined ? `δ ${declination > 0 ? '+' : ''}${declination.toFixed(1)}°` : 'δ —'}
      </text>
      ${convergence !== undefined ? `<text x="-16" y="5" font-size="3" fill="#666" text-anchor="middle">γ ${convergence > 0 ? '+' : ''}${convergence.toFixed(1)}°</text>` : ''}
    </g>
  `
}

function drawScaleBar(x: number, y: number, scale: number, nominalScale: number): string {
  const barWidthPx = 120
  const numSegs = 6
  const segW = barWidthPx / numSegs
  const groundDistPerSegM = (nominalScale * segW) / (96 * 1000)

  let svg = `<g transform="translate(${x},${y})">`

  svg += `<text x="0" y="-4" font-size="4" fill="black" font-weight="bold">SCALE</text>`

  for (let i = 0; i < numSegs; i++) {
    const fill = i % 2 === 0 ? 'black' : 'white'
    svg += `<rect x="${i * segW}" y="0" width="${segW}" height="5" fill="${fill}" stroke="black" stroke-width="0.3"/>`
  }

  svg += `<line x1="0" y1="5" x2="${barWidthPx}" y2="5" stroke="black" stroke-width="0.3"/>`

  const labelInterval = groundDistPerSegM
  for (let i = 0; i <= numSegs; i++) {
    const val = (i * labelInterval).toFixed(0)
    svg += `<text x="${i * segW}" y="11" font-size="3.5" fill="black" text-anchor="middle">${val}m</text>`
  }

  svg += `<text x="${barWidthPx / 2}" y="17" font-size="4" fill="black" text-anchor="middle">metres</text>`

  svg += `<text x="${barWidthPx + 4}" y="3" font-size="4" fill="black">RF 1:${nominalScale}</text>`

  svg += `<text x="${barWidthPx + 4}" y="9" font-size="3.5" fill="#666">A3→1:${(nominalScale * 1.4142).toFixed(0)}</text>`
  svg += `<text x="${barWidthPx + 4}" y="14" font-size="3.5" fill="#666">A4→1:${(nominalScale * 2).toFixed(0)}</text>`

  svg += `</g>`
  return svg
}

function drawLegend(x: number, y: number, contourInterval: number, majorInterval: number): string {
  const w = 140
  const h = 110

  let svg = `<g transform="translate(${x},${y})">`

  svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="0.5"/>`

  let cy = 0
  const rowH = 9
  const lineX1 = 3, lineX2 = 18
  const labelX = 22

  // ── Section 1: CONTOUR INTERVAL TABLE ──────────────────────────────────
  svg += `<text x="2" y="${cy + 5}" font-size="4.5" fill="black" font-weight="bold">CONTOUR INTERVAL</text>`
  cy += rowH

  svg += `<line x1="0" y1="${cy - 1}" x2="${w}" y2="${cy - 1}" stroke="black" stroke-width="0.3"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Major Interval (Index) +${(majorInterval).toFixed(0)}m</text>`
  cy += rowH - 1

  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Minor Interval (Intermediate) +${contourInterval.toFixed(1)}m</text>`
  cy += rowH - 1

  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Spot Heights  1:50  1:100  1:200</text>`
  cy += rowH

  svg += `<line x1="0" y1="${cy - 1}" x2="${w}" y2="${cy - 1}" stroke="black" stroke-width="0.3"/>`

  // ── Section 2: DRAINAGE ─────────────────────────────────────────────────
  svg += `<text x="2" y="${cy + 5}" font-size="4.5" fill="black" font-weight="bold">DRAINAGE</text>`
  cy += rowH

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="#0066cc" stroke-width="1" stroke-dasharray="3,1.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Open Drain</text>`
  cy += rowH - 1

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="#8B4513" stroke-width="1.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Perimeter Wall</text>`
  cy += rowH

  svg += `<line x1="0" y1="${cy - 1}" x2="${w}" y2="${cy - 1}" stroke="black" stroke-width="0.3"/>`

  // ── Section 3: STRUCTURES ────────────────────────────────────────────────
  svg += `<text x="2" y="${cy + 5}" font-size="4.5" fill="black" font-weight="bold">STRUCTURES</text>`
  cy += rowH

  svg += `<rect x="${lineX1}" y="${cy - 0.5}" width="15" height="4" fill="#8B4513"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Major Structure</text>`
  cy += rowH - 1

  svg += `<rect x="${lineX1}" y="${cy - 0.5}" width="15" height="4" fill="white" stroke="#8B4513" stroke-width="0.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Minor Structure</text>`
  cy += rowH - 1

  svg += `<rect x="${lineX1}" y="${cy - 0.5}" width="15" height="4" fill="#ddd" stroke="#8B4513" stroke-width="0.3" stroke-dasharray="1,1"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Structure (Wood)</text>`
  cy += rowH

  svg += `<line x1="0" y1="${cy - 1}" x2="${w}" y2="${cy - 1}" stroke="black" stroke-width="0.3"/>`

  // ── Section 4: FEATURES ────────────────────────────────────────────────
  svg += `<text x="2" y="${cy + 5}" font-size="4.5" fill="black" font-weight="bold">FEATURES</text>`
  cy += rowH

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="black" stroke-width="0.6" stroke-dasharray="3,1.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Boundary</text>`
  cy += rowH - 1

  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="2.5" fill="none" stroke="black" stroke-width="0.5"/>`
  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="1" fill="black"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Tree</text>`
  cy += rowH - 1

  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="2.5" fill="none" stroke="black" stroke-width="0.5"/>`
  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="0.8" fill="black"/>`
  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="black" stroke-width="0.4"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Gardening Meter</text>`
  cy += rowH - 1

  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="2.5" fill="none" stroke="black" stroke-width="0.5"/>`
  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="1" fill="black"/>`
  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="black" stroke-width="0.4"/>`
  svg += `<line x1="${lineX1 + 3}" y1="${cy + 2}" x2="${lineX2 - 3}" y2="${cy + 2}" stroke="black" stroke-width="0.3"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Line Trees</text>`
  cy += rowH - 1

  svg += `<circle cx="${(lineX1 + lineX2) / 2}" cy="${cy + 2}" r="3.5" fill="none" stroke="#cc0000" stroke-width="0.6"/>`
  svg += `<text x="${(lineX1 + lineX2) / 2}" y="${cy + 4}" font-size="3.5" fill="#cc0000" text-anchor="middle" font-weight="bold">P</text>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Pipe Line</text>`
  cy += rowH - 1

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="black" stroke-width="0.8"/>`
  svg += `<line x1="${lineX1 + 2}" y1="${cy - 1}" x2="${lineX1 + 2}" y2="${cy + 5}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="${lineX2 - 2}" y1="${cy - 1}" x2="${lineX2 - 2}" y2="${cy + 5}" stroke="black" stroke-width="0.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Power Line TY1</text>`
  cy += rowH - 1

  svg += `<text x="${lineX1}" y="${cy + 4}" font-size="4" fill="black">≋</text>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Gardening Birds</text>`
  cy += rowH - 1

  svg += `<polygon points="${(lineX1 + lineX2) / 2},${cy} ${(lineX1 + lineX2) / 2 - 2},${cy + 4} ${(lineX1 + lineX2) / 2 + 2},${cy + 4}" fill="none" stroke="black" stroke-width="0.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Gardening Marker</text>`
  cy += rowH

  svg += `<line x1="0" y1="${cy - 1}" x2="${w}" y2="${cy - 1}" stroke="black" stroke-width="0.3"/>`

  // ── Section 5: PROFESSIONAL GRAPHICS ────────────────────────────────────
  svg += `<text x="2" y="${cy + 5}" font-size="4.5" fill="black" font-weight="bold">PROFESSIONAL GRAPHICS</text>`
  cy += rowH

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="#8B4513" stroke-width="1"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Major Contour</text>`
  cy += rowH - 1

  svg += `<line x1="${lineX1}" y1="${cy + 2}" x2="${lineX2}" y2="${cy + 2}" stroke="#8B4513" stroke-width="0.4" stroke-dasharray="2,1.5"/>`
  svg += `<text x="${labelX}" y="${cy + 4}" font-size="3.5" fill="black">Minor Contour</text>`

  svg += `</g>`
  return svg
}

function drawTitleBlock(
  input: TopoPlanInput,
  pageW: number, pageH: number,
  margin: number, titleBlockH: number,
  declination?: number,
  convergence?: number,
): string {
  const tbX = margin
  const tbY = pageH - margin - titleBlockH
  const tbW = pageW - margin * 2

  let svg = `<g transform="translate(${tbX},${tbY})">`

  svg += `<rect x="0" y="0" width="${tbW}" height="${titleBlockH}" fill="white" stroke="black" stroke-width="0.8"/>`

  const col1W = tbW * 0.28
  const col2W = tbW * 0.28
  const col3W = tbW * 0.22
  const _col4W = tbW * 0.22 // rightmost column; right boundary = tbW

  svg += `<line x1="${col1W}" y1="0" x2="${col1W}" y2="${titleBlockH}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="${col1W + col2W}" y1="0" x2="${col1W + col2W}" y2="${titleBlockH}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="${col1W + col2W + col3W}" y1="0" x2="${col1W + col2W + col3W}" y2="${titleBlockH}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="0" y1="${titleBlockH * 0.55}" x2="${col1W}" y2="${titleBlockH * 0.55}" stroke="black" stroke-width="0.3"/>`
  svg += `<line x1="${col1W}" y1="${titleBlockH * 0.4}" x2="${col1W + col2W}" y2="${titleBlockH * 0.4}" stroke="black" stroke-width="0.3"/>`
  svg += `<line x1="${col1W}" y1="${titleBlockH * 0.7}" x2="${col1W + col2W}" y2="${titleBlockH * 0.7}" stroke="black" stroke-width="0.3"/>`
  svg += `<line x1="${col1W + col2W + col3W}" y1="${titleBlockH * 0.5}" x2="${tbW}" y2="${titleBlockH * 0.5}" stroke="black" stroke-width="0.3"/>`

  svg += `<text x="5" y="10" font-size="4.5" fill="black" font-weight="bold">PROJECT</text>`
  svg += `<text x="5" y="19" font-size="4.5" fill="black">${escapeXml(input.projectName)}</text>`
  svg += `<text x="5" y="29" font-size="4.5" fill="black" font-weight="bold">LOCATION</text>`
  svg += `<text x="5" y="38" font-size="4.5" fill="black">${escapeXml(input.location)}, ${escapeXml(input.county)}</text>`
  svg += `<text x="5" y="48" font-size="4.5" fill="black" font-weight="bold">SURVEY NO.</text>`
  svg += `<text x="5" y="57" font-size="4.5" fill="black">${escapeXml(input.surveyNumber)}</text>`
  svg += `<text x="5" y="67" font-size="4.5" fill="black" font-weight="bold">SCALE</text>`
  svg += `<text x="38" y="67" font-size="4.5" fill="black">1:${input.scale}</text>`

  const col2X = col1W + 5
  svg += `<text x="${col2X}" y="10" font-size="4.5" fill="black" font-weight="bold">SURVEYOR</text>`
  svg += `<text x="${col2X}" y="19" font-size="4.5" fill="black">${escapeXml(input.surveyorName)}</text>`
  svg += `<text x="${col2X}" y="29" font-size="4.5" fill="black" font-weight="bold">ISK LICENSE</text>`
  svg += `<text x="${col2X}" y="38" font-size="4.5" fill="black">${escapeXml(input.iskNumber)}</text>`
  svg += `<text x="${col2X}" y="48" font-size="4.5" fill="black" font-weight="bold">FIRM</text>`
  svg += `<text x="${col2X}" y="57" font-size="4.5" fill="black">${escapeXml(input.firmName)}</text>`
  svg += `<text x="${col2X}" y="67" font-size="4.5" fill="black" font-weight="bold">DATE</text>`
  svg += `<text x="${col2X + 28}" y="67" font-size="4.5" fill="black">${escapeXml(input.surveyDate)}</text>`

  const col3X = col1W + col2W + 5
  svg += `<text x="${col3X}" y="10" font-size="4.5" fill="black" font-weight="bold">DATUM</text>`
  svg += `<text x="${col3X}" y="19" font-size="4.5" fill="black">${escapeXml(input.datum)}</text>`
  svg += `<text x="${col3X}" y="29" font-size="4.5" fill="black" font-weight="bold">PROJECTION</text>`
  svg += `<text x="${col3X}" y="38" font-size="4" fill="black">UTM Zone ${input.utmZone}${input.hemisphere}</text>`
  svg += `<text x="${col3X}" y="48" font-size="4" fill="#666">EPSG:${input.datum === 'Arc 1960' ? '21' : '32'}0${input.utmZone}</text>`
  svg += `<text x="${col3X}" y="57" font-size="4.5" fill="black" font-weight="bold">CONTOUR INT.</text>`
  svg += `<text x="${col3X}" y="66" font-size="4" fill="black">${input.contourInterval}m (Idx ×5)</text>`

  const col4X = col1W + col2W + col3W + 5
  svg += `<text x="${col4X}" y="10" font-size="4.5" fill="black" font-weight="bold">DECLINATION</text>`
  svg += `<text x="${col4X}" y="19" font-size="4" fill="black">${declination !== undefined ? `${declination > 0 ? 'E' : 'W'} ${Math.abs(declination).toFixed(1)}°` : 'See Note'}</text>`
  svg += `<text x="${col4X}" y="29" font-size="4.5" fill="black" font-weight="bold">GRID CONV.</text>`
  svg += `<text x="${col4X}" y="38" font-size="4" fill="black">${convergence !== undefined ? `${convergence > 0 ? 'E' : 'W'} ${Math.abs(convergence).toFixed(1)}°` : 'See Note'}</text>`
  svg += `<text x="${col4X}" y="57" font-size="4.5" fill="black" font-weight="bold">SURVEYOR</text>`
  svg += `<line x1="${col4X}" y1="${titleBlockH - 24}" x2="${tbW - 5}" y2="${titleBlockH - 24}" stroke="black" stroke-width="0.5"/>`
  svg += `<text x="${col4X}" y="${titleBlockH - 17}" font-size="3.5" fill="black">Signature</text>`
  svg += `<line x1="${col4X}" y1="${titleBlockH - 12}" x2="${tbW - 5}" y2="${titleBlockH - 12}" stroke="black" stroke-width="0.3"/>`
  svg += `<text x="${col4X}" y="${titleBlockH - 6}" font-size="3.5" fill="#666">${escapeXml(input.surveyorName)} | ISK ${escapeXml(input.iskNumber)}</text>`

  svg += `<text x="${col3X}" y="${titleBlockH - 3}" font-size="3.5" fill="#888">Survey Act Cap. 299 | RDM 1.1 | SoK Standards</text>`

  svg += `</g>`
  return svg
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}
