/**
 * METARDU — Traverse Computation Sheet Print Generator
 *
 * Produces a formal traverse computation sheet for submission.
 *
 * Includes:
 *   - Table 1: Reduced Observations (station, HCL, HCR, mean angle, SD, HD, VA, ΔH)
 *   - Table 2: Traverse Computation (WCB, departure, latitude, Bowditch corrections, adjusted)
 *   - Table 3: Final Coordinates Schedule (station, adjusted E, N, RL)
 *   - Closure Summary (linear error, precision ratio, accuracy order per RDM 1.1 Table 2.4)
 *   - Surveyor's Certificate
 *
 * References:
 *   Survey Act Cap 299, Survey Regulations 1994, Regulation 97
 *   RDM 1.1 Kenya (2025), Table 2.4 — Accuracy Classification
 *   N.N. Basak — Surveying and Levelling, Chapters 10-11
 *   Ghilani & Wolf — Elementary Surveying 16th Ed., Chapters 10, 12
 */

import { buildPrintDocument, openPrint } from './buildPrintDocument'
import type { PrintMeta } from './buildPrintDocument'
import type { TraverseComputationResult } from '@/lib/computations/traverseEngine'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraverseSheetInput {
  result: TraverseComputationResult
  meta: PrintMeta
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtN(n: number, dp: number = 3): string {
  return n.toFixed(dp)
}

function fmtSign(n: number, dp: number = 3): string {
  return (n >= 0 ? '+' : '') + n.toFixed(dp)
}

/**
 * Convert decimal degrees to DMS string.
 * Used for HCL, HCR circle readings — must be DMS on formal computation sheets.
 * DoLS will reject decimal-degree circle readings.
 *
 * e.g. 45.5355 → "045°32'07.8""
 */
function decToDMS(decDeg: number): string {
  const absVal = Math.abs(decDeg)
  const d = Math.floor(absVal)
  const mFloat = (absVal - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return `${String(d).padStart(3, '0')}\u00b0${String(m).padStart(2, '0')}\u2019${s.toFixed(1).padStart(4, '0')}\u201d`
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
  <td class="bold mono">${o.station}</td>
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
  <td class="mono">${l.from}</td>
  <td class="mono">${l.to}</td>
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
  Bowditch: &delta;Dep = &minus;&Sigma;Dep &times; (HD/&Sigma;HD), &delta;Lat = &minus;&Sigma;Lat &times; (HD/&Sigma;HD)
</p>`

  // ── Table 3: Final Coordinate Schedule ──────────────────
  const coordRows = r.coordinates.map((c, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="bold mono">${c.station}</td>
  <td class="right mono">${fmtN(c.easting)}</td>
  <td class="right mono">${fmtN(c.northing)}</td>
  <td class="right mono">${c.rl !== undefined ? fmtN(c.rl) : '&mdash;'}</td>
</tr>`).join('')

  const coordTable = `
<h2>3. Final Coordinate Schedule &mdash; Arc 1960 / UTM Zone 37S</h2>
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
  <div class="summary-row"><span class="summary-label">Precision Ratio</span><span class="summary-value bold">1 : ${r.precisionRatio > 0 ? Math.round(r.precisionRatio).toLocaleString() : '&infin;'}</span></div>
  <div class="summary-row"><span class="summary-label">Accuracy Order (RDM 1.1 Table 2.4)</span><span class="summary-value ${r.precisionRatio > 5000 ? 'pass' : r.precisionRatio > 1000 ? 'warn' : 'fail'} bold">${r.accuracyOrder}</span></div>
  <div class="summary-row"><span class="summary-label">Allowable Misclosure</span><span class="summary-value">${fmtN(r.allowable, 3)} m</span></div>
  <div class="summary-row"><span class="summary-label">Formula</span><span class="summary-value">${r.formula}</span></div>
  ${r.closingPoint ? `
  <div class="summary-row"><span class="summary-label">Opening Coordinates</span><span class="summary-value mono">${fmtN(r.openingPoint.easting)}, ${fmtN(r.openingPoint.northing)}</span></div>
  <div class="summary-row"><span class="summary-label">Closing Coordinates (given)</span><span class="summary-value mono">${fmtN(r.closingPoint.easting)}, ${fmtN(r.closingPoint.northing)}</span></div>
  ` : ''}
</div>`

  // ── Notes ───────────────────────────────────────────────
  const notes = `
<h3>Notes</h3>
<ol style="font-size:8pt;color:#555;line-height:1.6;padding-left:16px;">
  <li>Horizontal angles measured on both faces (Face Left &amp; Face Right). Mean = (HCL + HCR + 180&deg;) / 2 per Basak, Chapter 10.</li>
  <li>Bowditch (compass) rule applied &mdash; corrections proportional to leg length. Source: Ghilani &amp; Wolf, Ch.12.</li>
  <li>Accuracy classification per RDM 1.1 (2025) Table 2.4 and Survey Regulations 1994, Reg. 97.</li>
  <li>Coordinates computed in Arc 1960 / UTM Zone 37S (SRID 21037) unless otherwise stated.</li>
  <li>All heights are MSL (Nairobi Datum) unless otherwise stated.</li>
  <li>HCL and HCR shown as D&deg;M&prime;S&Prime; as read from instrument. Mean angle used for WCB propagation.</li>
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
    reference: 'Survey Regulations 1994 Reg. 97 | RDM 1.1 Table 2.4 | Basak Ch.10-11 | Ghilani &amp; Wolf Ch.12',
  }
  return buildPrintDocument(buildBody(inp), meta)
}

export function printTraverseSheet(inp: TraverseSheetInput): void {
  openPrint(generateTraverseSheet(inp))
}
