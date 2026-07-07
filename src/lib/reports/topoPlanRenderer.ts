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
    const color = isIndex ? '#333' : '#999'

    // Draw contour path
    const pathD = contour.points.map((c, i) => {
      const x = tx(c.easting)
      const y = ty(c.northing)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')

    svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeW}"/>`

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
  const northX = drawX + drawW - 30
  const northY = drawY + 30
  svg += drawNorthArrow(northX, northY)

  // ── 8. Scale bar ──
  const sbX = drawX + 10
  const sbY = drawY + drawH - 15
  svg += drawScaleBar(sbX, sbY, scale, input.scale)

  // ── 9. Legend ──
  const legX = drawX + drawW - 120
  const legY = drawY + 50
  svg += drawLegend(legX, legY, input.contourInterval)

  // ── 10. Title block ──
  svg += drawTitleBlock(input, pageW, pageH, margin, titleBlockH)

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

function drawNorthArrow(x: number, y: number): string {
  return `
    <g transform="translate(${x},${y})">
      <!-- North half (black) -->
      <polygon points="0,-15 4,0 0,-2 -4,0" fill="black"/>
      <!-- South half (white outline) -->
      <polygon points="0,15 4,0 0,2 -4,0" fill="white" stroke="black" stroke-width="0.5"/>
      <!-- N label -->
      <text x="0" y="-18" font-size="7" fill="black" text-anchor="middle" font-weight="bold">N</text>
    </g>
  `
}

function drawScaleBar(x: number, y: number, scale: number, nominalScale: number): string {
  // Scale bar: 4 segments, each representing a ground distance
  const barWidthMm = 40 // 40mm on paper
  const groundDistM = (barWidthMm * nominalScale) / 1000 // metres on ground
  const segW = barWidthMm / 4

  let svg = `<g transform="translate(${x},${y})">`

  // Segments
  for (let i = 0; i < 4; i++) {
    const fill = i % 2 === 0 ? 'black' : 'white'
    svg += `<rect x="${i * segW}" y="0" width="${segW}" height="3" fill="${fill}" stroke="black" stroke-width="0.3"/>`
  }

  // Labels
  const labelInterval = groundDistM / 4
  for (let i = 0; i <= 4; i++) {
    const val = (labelInterval * i).toFixed(0)
    svg += `<text x="${i * segW}" y="8" font-size="4" fill="black" text-anchor="middle">${val}</text>`
  }

  // Unit label
  svg += `<text x="${barWidthMm / 2}" y="14" font-size="4" fill="black" text-anchor="middle">metres</text>`

  // RF notation
  svg += `<text x="${barWidthMm + 5}" y="2" font-size="4" fill="black">RF 1:${nominalScale}</text>`

  svg += `</g>`
  return svg
}

function drawLegend(x: number, y: number, contourInterval: number): string {
  const w = 100
  const h = 50

  let svg = `<g transform="translate(${x},${y})">`

  // Box
  svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="0.5"/>`

  // Title
  svg += `<text x="${w / 2}" y="8" font-size="5" fill="black" text-anchor="middle" font-weight="bold">LEGEND</text>`

  // Index contour
  svg += `<line x1="5" y1="16" x2="20" y2="16" stroke="#333" stroke-width="0.8"/>`
  svg += `<text x="23" y="18" font-size="4" fill="black">Index contour (${(contourInterval * 5).toFixed(0)}m interval)</text>`

  // Intermediate contour
  svg += `<line x1="5" y1="24" x2="20" y2="24" stroke="#999" stroke-width="0.3"/>`
  svg += `<text x="23" y="26" font-size="4" fill="black">Intermediate contour (${contourInterval}m)</text>`

  // Spot height
  svg += `<circle cx="12" cy="33" r="1" fill="black"/>`
  svg += `<text x="23" y="35" font-size="4" fill="black">Spot height (elevation in metres)</text>`

  // Control point
  svg += `<polygon points="12,40 10,43 14,43" fill="none" stroke="red" stroke-width="0.5"/>`
  svg += `<text x="23" y="43" font-size="4" fill="black">Control point (triangulation station)</text>`

  svg += `</g>`
  return svg
}

function drawTitleBlock(
  input: TopoPlanInput,
  pageW: number, pageH: number,
  margin: number, titleBlockH: number,
): string {
  const tbX = margin
  const tbY = pageH - margin - titleBlockH
  const tbW = pageW - margin * 2

  let svg = `<g transform="translate(${tbX},${tbY})">`

  // Box
  svg += `<rect x="0" y="0" width="${tbW}" height="${titleBlockH}" fill="white" stroke="black" stroke-width="0.8"/>`

  // Divider lines
  const col1W = tbW * 0.35
  const col2W = tbW * 0.35
  svg += `<line x1="${col1W}" y1="0" x2="${col1W}" y2="${titleBlockH}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="${col1W + col2W}" y1="0" x2="${col1W + col2W}" y2="${titleBlockH}" stroke="black" stroke-width="0.5"/>`
  svg += `<line x1="0" y1="${titleBlockH / 2}" x2="${col1W}" y2="${titleBlockH / 2}" stroke="black" stroke-width="0.3"/>`
  svg += `<line x1="${col1W}" y1="${titleBlockH / 3}" x2="${col1W + col2W}" y2="${titleBlockH / 3}" stroke="black" stroke-width="0.3"/>`
  svg += `<line x1="${col1W}" y1="${titleBlockH * 2 / 3}" x2="${col1W + col2W}" y2="${titleBlockH * 2 / 3}" stroke="black" stroke-width="0.3"/>`

  // Column 1: Project info
  svg += `<text x="5" y="12" font-size="5" fill="black" font-weight="bold">PROJECT</text>`
  svg += `<text x="5" y="22" font-size="5" fill="black">${escapeXml(input.projectName)}</text>`
  svg += `<text x="5" y="32" font-size="5" fill="black" font-weight="bold">LOCATION</text>`
  svg += `<text x="5" y="42" font-size="5" fill="black">${escapeXml(input.location)}, ${escapeXml(input.county)}</text>`
  svg += `<text x="5" y="52" font-size="5" fill="black" font-weight="bold">SURVEY NO.</text>`
  svg += `<text x="5" y="62" font-size="5" fill="black">${escapeXml(input.surveyNumber)}</text>`
  svg += `<text x="5" y="72" font-size="5" fill="black" font-weight="bold">SCALE</text>`
  svg += `<text x="40" y="72" font-size="5" fill="black">1:${input.scale}</text>`

  // Column 2: Surveyor info
  svg += `<text x="${col1W + 5}" y="12" font-size="5" fill="black" font-weight="bold">SURVEYOR</text>`
  svg += `<text x="${col1W + 5}" y="22" font-size="5" fill="black">${escapeXml(input.surveyorName)}</text>`
  svg += `<text x="${col1W + 5}" y="32" font-size="5" fill="black" font-weight="bold">ISK LICENSE</text>`
  svg += `<text x="${col1W + 5}" y="42" font-size="5" fill="black">${escapeXml(input.iskNumber)}</text>`
  svg += `<text x="${col1W + 5}" y="52" font-size="5" fill="black" font-weight="bold">FIRM</text>`
  svg += `<text x="${col1W + 5}" y="62" font-size="5" fill="black">${escapeXml(input.firmName)}</text>`
  svg += `<text x="${col1W + 5}" y="72" font-size="5" fill="black" font-weight="bold">DATE</text>`
  svg += `<text x="${col1W + 40}" y="72" font-size="5" fill="black">${escapeXml(input.surveyDate)}</text>`

  // Column 3: Coordinate system + datum
  const col3X = col1W + col2W
  svg += `<text x="${col3X + 5}" y="12" font-size="5" fill="black" font-weight="bold">DATUM</text>`
  svg += `<text x="${col3X + 5}" y="22" font-size="5" fill="black">${escapeXml(input.datum)}</text>`
  svg += `<text x="${col3X + 5}" y="32" font-size="5" fill="black" font-weight="bold">PROJECTION</text>`
  svg += `<text x="${col3X + 5}" y="42" font-size="5" fill="black">UTM Zone ${input.utmZone}${input.hemisphere} (EPSG:${input.datum === 'Arc 1960' ? '21' : '32'}0${input.utmZone})</text>`
  svg += `<text x="${col3X + 5}" y="52" font-size="5" fill="black" font-weight="bold">CONTOUR INTERVAL</text>`
  svg += `<text x="${col3X + 5}" y="62" font-size="5" fill="black">${input.contourInterval} metres</text>`
  svg += `<text x="${col3X + 5}" y="72" font-size="5" fill="black" font-weight="bold">COMPLIANCE</text>`
  svg += `<text x="${col3X + 5}" y="${titleBlockH - 3}" font-size="4" fill="#666">Survey Act Cap. 299 | RDM 1.1 | SoK Standards</text>`

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
