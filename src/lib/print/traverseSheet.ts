/**
 * METARDU — Traverse Computation Sheet Print Generator
 *
 * Produces an unapproved numerical draft for independent review.
 *
 * Includes:
 *   - Table 1: Reduced Observations (station, HCL, HCR, mean angle, SD, HD, VA, ΔH)
 *   - Table 2: Traverse Computation (WCB, departure, latitude, Bowditch corrections, adjusted)
 *   - Table 3: Final Coordinates Schedule (station, adjusted E, N, RL)
 *   - Closure Summary and comparison to a caller-supplied job limit
 *   - Draft review block without a prewritten certification assertion
 *
 * References:
 *   N.N. Basak — Surveying and Levelling, Chapters 10-11
 *   Ghilani & Wolf — Elementary Surveying 16th Ed., Chapters 10, 12
 */

import { buildPrintDocument, openPrint } from './buildPrintDocument'
import type { PrintMeta } from './buildPrintDocument'
import type { TraverseComputationResult } from '@/lib/computations/traverseEngine'
import { formatTraverseAngleDMS } from '@/lib/computations/traverseEngine'
import { escapeXml } from '@/lib/xml/escape'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraverseSheetInput {
  result: TraverseComputationResult
  meta: PrintMeta
  /** Supplied reference labels, not independently verified by this renderer. */
  coordinateReference?: string
  verticalDatum?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtN(n: number | null, dp: number = 3): string {
  return n === null ? 'Unknown' : n.toFixed(dp)
}

function fmtSign(n: number | null, dp: number = 3): string {
  return n === null ? 'Unknown' : (n >= 0 ? '+' : '') + n.toFixed(dp)
}

/**
 * Convert decimal degrees to DMS string.
 * Uses the same display rounding/carry as the engine and field-book preview.
 *
 * e.g. 45.5355 → "045°32'07.8""
 */
function decToDMS(decDeg: number): string {
  return formatTraverseAngleDMS(decDeg)
}

// ── Body builder ──────────────────────────────────────────────────────────────

function buildBody(inp: TraverseSheetInput): string {
  const r = inp.result

  // ── Table 1: Reduced Observations ───────────────────────
  // HCL and HCR must be displayed in DMS — not decimal degrees.
  // Source: Basak, Chapter 10 — circle readings recorded in DMS as read from instrument.
  // DoLS rejects computation sheets showing decimal degrees for circle readings.
  const obsRows = r.observations.map((o, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="bold mono">${escapeXml(o.station)}</td>
  <td class="right mono">${decToDMS(o.hcl)}</td>
  <td class="right mono">${decToDMS(o.hcr)}</td>
  <td class="mono">${o.meanAngleDMS}</td>
  <td class="right mono">${fmtN(o.slopeDist)}</td>
  <td class="right mono">${fmtN(o.verticalAngle, 4)}</td>
  <td class="right mono">${fmtN(o.horizontalDist)}</td>
  <td class="right mono">${fmtSign(o.deltaH)}</td>
  <td class="right mono">${fmtN(o.ih)}</td>
  <td class="right mono">${fmtN(o.th)}</td>
</tr>`).join('')

  const obsTable = `
<h2>1. Reduced Observations</h2>
<table>
  <thead>
    <tr>
      <th style="width:4%">No.</th>
      <th style="width:8%">Station</th>
      <th class="right" style="width:9%">HCL (D&deg;M&prime;S&Prime;)</th>
      <th class="right" style="width:9%">HCR (D&deg;M&prime;S&Prime;)</th>
      <th style="width:12%">Mean Angle</th>
      <th class="right" style="width:8%">SD (m)</th>
      <th class="right" style="width:7%">VA (&deg;)</th>
      <th class="right" style="width:8%">HD (m)</th>
      <th class="right" style="width:7%">&Delta;H (m)</th>
      <th class="right" style="width:5%">IH (m)</th>
      <th class="right" style="width:5%">TH (m)</th>
    </tr>
  </thead>
  <tbody>
    ${obsRows || '<tr><td colspan="11" class="center" style="color:#999;">No observations</td></tr>'}
  </tbody>
</table>
<p style="font-size:7.5pt;color:#666;margin-top:3px;">
  HCL = Face Left (FL) horizontal circle reading &nbsp;|&nbsp;
  HCR = Face Right (FR) circle reading &nbsp;|&nbsp;
  Mean = (HCL + HCR + 180&deg;) / 2 &nbsp;|&nbsp;
  HD = SD &times; cos(VA) &nbsp;|&nbsp;
  &Delta;H = SD &times; sin(VA) + IH &minus; TH
</p>`

  // ── Table 2: Traverse Computation ───────────────────────
  const legRows = r.legs.map((l, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="mono">${escapeXml(l.from)}</td>
  <td class="mono">${escapeXml(l.to)}</td>
  <td class="mono">${l.meanAngleDMS}</td>
  <td class="mono">${l.wcbDMS}</td>
  <td class="right mono">${fmtN(l.hd)}</td>
  <td class="right mono">${fmtSign(l.departure)}</td>
  <td class="right mono">${fmtSign(l.latitude)}</td>
  <td class="right mono" style="font-size:7pt">${fmtSign(l.depCorrection, 4)}</td>
  <td class="right mono" style="font-size:7pt">${fmtSign(l.latCorrection, 4)}</td>
  <td class="right mono bold">${fmtSign(l.adjDep)}</td>
  <td class="right mono bold">${fmtSign(l.adjLat)}</td>
</tr>`).join('')

  const sumDep    = r.legs.reduce((s, l) => s + l.departure, 0)
  const sumLat    = r.legs.reduce((s, l) => s + l.latitude, 0)
  const sumAdjDep = r.legs.reduce((s, l) => s + l.adjDep, 0)
  const sumAdjLat = r.legs.reduce((s, l) => s + l.adjLat, 0)
  const sumHD     = r.legs.reduce((s, l) => s + l.hd, 0)

  const legTable = `
<h2>2. Traverse Computation &mdash; Bowditch Adjustment</h2>
<table>
  <thead>
    <tr>
      <th style="width:3%">No.</th>
      <th style="width:6%">From</th>
      <th style="width:6%">To</th>
      <th style="width:10%">Angle</th>
      <th style="width:10%">WCB</th>
      <th class="right" style="width:7%">HD (m)</th>
      <th class="right" style="width:8%">Dep (m)</th>
      <th class="right" style="width:8%">Lat (m)</th>
      <th class="right" style="width:7%">&delta; Dep</th>
      <th class="right" style="width:7%">&delta; Lat</th>
      <th class="right" style="width:9%">Adj Dep</th>
      <th class="right" style="width:9%">Adj Lat</th>
    </tr>
  </thead>
  <tbody>
    ${legRows}
    <tr style="font-weight:bold;background:#e8e8e8;">
      <td colspan="5" class="bold">TOTALS</td>
      <td class="right mono">${fmtN(sumHD)}</td>
      <td class="right mono">${fmtSign(sumDep)}</td>
      <td class="right mono">${fmtSign(sumLat)}</td>
      <td class="right mono" style="font-size:7pt">&mdash;</td>
      <td class="right mono" style="font-size:7pt">&mdash;</td>
      <td class="right mono">${fmtSign(sumAdjDep)}</td>
      <td class="right mono">${fmtSign(sumAdjLat)}</td>
    </tr>
  </tbody>
</table>
<p style="font-size:7.5pt;color:#666;margin-top:3px;">
  Dep = HD &times; sin(WCB) &nbsp;|&nbsp; Lat = HD &times; cos(WCB) &nbsp;|&nbsp;
  Bowditch: &delta;Dep = &minus;(&Sigma;Dep &minus; target &Delta;E) &times; (HD/&Sigma;HD), &delta;Lat = &minus;(&Sigma;Lat &minus; target &Delta;N) &times; (HD/&Sigma;HD), where target offsets are closing minus opening coordinates.
</p>`

  // ── Table 3: Final Coordinate Schedule ──────────────────
  const coordRows = r.coordinates.map((c, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="bold mono">${escapeXml(c.station)}</td>
  <td class="right mono">${fmtN(c.easting)}</td>
  <td class="right mono">${fmtN(c.northing)}</td>
  <td class="right mono">${c.rl !== undefined ? fmtN(c.rl) : 'Unknown'}</td>
</tr>`).join('')

  const coordTable = `
<h2>3. Computed Coordinate Schedule &mdash; Draft</h2>
<p>Coordinate reference (as supplied): ${escapeXml(inp.coordinateReference || 'Unknown')}. Vertical datum (as supplied): ${escapeXml(inp.verticalDatum || 'Unknown')}.</p>
<table>
  <thead>
    <tr>
      <th style="width:8%">No.</th>
      <th style="width:15%">Station</th>
      <th class="right" style="width:25%">Easting (m)</th>
      <th class="right" style="width:25%">Northing (m)</th>
      <th class="right" style="width:22%">R.L. (m)</th>
    </tr>
  </thead>
  <tbody>
    ${coordRows || '<tr><td colspan="5" class="center" style="color:#999;">No coordinates</td></tr>'}
  </tbody>
</table>`

  // ── 4. Closure Summary ──────────────────────────────────
  const closureBox = `
<h2>4. Closure Summary</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Traverse Type</span><span class="summary-value">${r.isClosed ? 'CLOSED' : 'OPEN'}</span></div>
  <div class="summary-row"><span class="summary-label">Number of Legs</span><span class="summary-value">${r.legs.length}</span></div>
  <div class="summary-row"><span class="summary-label">Total Perimeter</span><span class="summary-value">${fmtN(r.totalPerimeter)} m (${r.K_km.toFixed(3)} km)</span></div>
  <div class="summary-row"><span class="summary-label">&Sigma;Departures (raw)</span><span class="summary-value">${fmtSign(r.sumDepartures, 4)} m</span></div>
  <div class="summary-row"><span class="summary-label">&Sigma;Latitudes (raw)</span><span class="summary-value">${fmtSign(r.sumLatitudes, 4)} m</span></div>
  <div class="summary-row"><span class="summary-label">Linear Closing Error (Linear Misclosure)</span><span class="summary-value">${fmtN(r.linearError, 4)} m (${fmtN(r.C_mm, 2)} mm)</span></div>
  <div class="summary-row"><span class="summary-label">Precision Ratio</span><span class="summary-value bold">${r.precisionRatio !== null ? `1 : ${Math.round(r.precisionRatio).toLocaleString()}` : r.linearError === 0 ? 'No finite ratio (zero computed misclosure)' : 'Unknown'}</span></div>
  <div class="summary-row"><span class="summary-label">Linear Closure Comparison</span><span class="summary-value ${r.assessment.status === 'not_assessed' ? 'warn' : r.assessment.status} bold">${escapeXml(r.accuracyOrder)}</span></div>
  <div class="summary-row"><span class="summary-label">Stated Allowable Misclosure</span><span class="summary-value">${fmtN(r.allowable, 3)} mm</span></div>
  <div class="summary-row"><span class="summary-label">Comparison Basis</span><span class="summary-value">${escapeXml(r.formula)}</span></div>
  ${r.closingPoint ? `
  <div class="summary-row"><span class="summary-label">Opening Coordinates</span><span class="summary-value mono">${fmtN(r.openingPoint.easting)}, ${fmtN(r.openingPoint.northing)}</span></div>
  <div class="summary-row"><span class="summary-label">Closing Coordinates (given)</span><span class="summary-value mono">${fmtN(r.closingPoint.easting)}, ${fmtN(r.closingPoint.northing)}</span></div>
  ` : ''}
</div>`

  // ── Notes ───────────────────────────────────────────────
  const notes = `
<h3>Notes</h3>
<ol style="font-size:8pt;color:#555;line-height:1.6;padding-left:16px;">
  <li>Face-right readings are reduced by 180 degrees, then averaged with face-left readings along the shorter circular arc. Supplied angles must use the declared clockwise backsight-to-foresight convention.</li>
  <li>${r.isClosed ? 'Bowditch corrections are proportional to horizontal leg length. Adjusted endpoint agreement is a mathematical constraint, not independent field verification.' : 'Open traverse: no closing control or Bowditch adjustment; closure is unknown.'}</li>
  <li>Only a supplied job limit and reference enable a linear-closure comparison. No accuracy order, jurisdictional acceptance or professional approval is inferred.</li>
  <li>Zenith convention: 90 degrees is horizontal. Unknown instrument/target heights or opening level leave subsequent reduced levels unknown.</li>
  <li>Original field records, control, reference systems and this draft require independent professional review.</li>
</ol>`

  return `
${obsTable}
${legTable}
${coordTable}
${closureBox}
${notes}
`
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateTraverseSheet(inp: TraverseSheetInput): string {
  const meta: PrintMeta = {
    ...inp.meta,
    title: inp.meta.title || 'Traverse Computation Sheet',
    reviewOnly: true,
    reference: 'Numerical draft | Supplied job criterion only | Basak Ch.10-11 | Ghilani & Wolf Ch.12',
  }
  return buildPrintDocument(buildBody(inp), meta)
}

export function printTraverseSheet(inp: TraverseSheetInput): void {
  openPrint(generateTraverseSheet(inp))
}
