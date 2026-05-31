/**
 * METARDU — Setting Out Schedule / Stake Out Sheet
 *
 * Produces a contractor-ready setting out schedule listing all design points
 * with horizontal angles (from backsight), horizontal distances, slope distances,
 * vertical angles, and design RLs.
 *
 * References:
 *   Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 23
 *   Schofield & Breach, Engineering Surveying 7th Ed., Chapter 9
 *   RDM 1.1 Kenya (2025), Table 5.2 — Construction Tolerance
 *   Survey Act Cap 299 | Survey Regulations 1994
 */

import { buildPrintDocument, openPrint } from './buildPrintDocument'
import type { PrintMeta } from '@/components/shared/PrintMetaPanel'
import type { SettingOutResult, SettingOutRow } from '@/lib/computations/settingOutEngine'

// ── Input type ────────────────────────────────────────────────────────────────

export interface SettingOutScheduleInput {
  meta: PrintMeta
  result: SettingOutResult
  /** Optional job description / notes for the contractor */
  jobDescription?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt3(v: number): string {
  return v.toFixed(3)
}

function esc(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateSettingOutSchedule(input: SettingOutScheduleInput): string {
  const { meta, result, jobDescription } = input
  const { instrumentStation, backsight, bsBearing, rows } = result

  const totalPoints = rows.length
  const maxHD = rows.length ? Math.max(...rows.map((r: SettingOutRow) => r.HD)) : 0
  const minHD = rows.length ? Math.min(...rows.map((r: SettingOutRow) => r.HD)) : 0

  // ── Station summary box ────────────────────────────────────────────────────

  const stationBox = `
<h2>Instrument Setup</h2>
<div class="summary-box">
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;">
    <div style="padding:4px 8px;border-right:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Station Easting</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${fmt3(instrumentStation.e)} m</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Station Northing</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${fmt3(instrumentStation.n)} m</span>
    </div>
    <div style="padding:4px 8px;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Station RL</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${fmt3(instrumentStation.rl)} m</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Instrument Height (IH)</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${fmt3(instrumentStation.ih)} m</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Backsight E, N</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${fmt3(backsight.e)}, ${fmt3(backsight.n)}</span>
    </div>
    <div style="padding:4px 8px;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">BS Bearing (WCB)</span>
      <span style="font-weight:bold;font-size:9pt;font-family:'Courier New',monospace;">${bsBearing}</span>
    </div>
  </div>
</div>`

  // ── Stats bar ──────────────────────────────────────────────────────────────

  const statsBar = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #000;margin:6px 0 12px;">
  <div style="padding:6px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:16pt;font-weight:bold;color:#111;">${totalPoints}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Design Points</div>
  </div>
  <div style="padding:6px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:16pt;font-weight:bold;color:#111;">${fmt3(minHD)}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Min HD (m)</div>
  </div>
  <div style="padding:6px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:16pt;font-weight:bold;color:#111;">${fmt3(maxHD)}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Max HD (m)</div>
  </div>
  <div style="padding:6px 12px;text-align:center;">
    <div style="font-size:16pt;font-weight:bold;color:#111;">±25mm</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">H Tolerance (RDM 1.1)</div>
  </div>
</div>`

  // ── Design points table ────────────────────────────────────────────────────

  const tableRows = rows.map((row: SettingOutRow, i: number) => {
    return `
<tr style="page-break-inside:avoid;">
  <td class="bold" style="width:7%">${i + 1}</td>
  <td class="bold mono" style="width:8%">${esc(row.id)}</td>
  <td class="right mono" style="width:13%">${fmt3(row.designE)}</td>
  <td class="right mono" style="width:13%">${fmt3(row.designN)}</td>
  <td class="right mono" style="width:13%">${fmt3(row.designRL)}</td>
  <td class="right mono" style="width:12%;font-weight:bold;">${row.HzAngle}</td>
  <td class="right mono" style="width:9%">${fmt3(row.HD)}</td>
  <td class="right mono" style="width:8%">${fmt3(row.heightDiff)}</td>
  <td class="right mono" style="width:8%">${row.VA}</td>
  <td class="right mono" style="width:8%">${fmt3(row.SD)}</td>
  <td class="right mono" style="width:6%">${fmt3(row.TH)}</td>
</tr>`
  }).join('\n')

  const scheduleTable = `
<h2>Setting Out Schedule &mdash; ${totalPoints} Point${totalPoints !== 1 ? 's' : ''}</h2>
<table style="font-size:8pt;">
  <thead>
    <tr>
      <th style="width:7%">No.</th>
      <th style="width:8%">Point ID</th>
      <th class="right" style="width:13%">Design E (m)</th>
      <th class="right" style="width:13%">Design N (m)</th>
      <th class="right" style="width:13%">Design RL (m)</th>
      <th class="right" style="width:12%">Hz Angle from BS</th>
      <th class="right" style="width:9%">HD (m)</th>
      <th class="right" style="width:8%">VD (m)</th>
      <th class="right" style="width:8%">VA</th>
      <th class="right" style="width:8%">SD (m)</th>
      <th class="right" style="width:6%">TH (m)</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows || '<tr><td colspan="11" style="text-align:center;color:#999;font-style:italic;padding:12px;">No design points</td></tr>'}
  </tbody>
</table>`

  // ── Job description / notes ────────────────────────────────────────────────

  const jobDescBlock = jobDescription ? `
<div class="summary-box" style="margin-top:10px;">
  <div style="font-size:8pt;font-weight:bold;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Job Description / Instructions to Contractor</div>
  <div style="font-size:8.5pt;line-height:1.6;white-space:pre-wrap;">${esc(jobDescription)}</div>
</div>` : ''

  // ── Notes box ─────────────────────────────────────────────────────────────

  const notesBox = `
<div class="summary-box" style="margin-top:12px;">
  <div style="font-size:8pt;font-weight:bold;margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;">Field Notes — RDM 1.1 (2025) Table 5.2</div>
  <div style="font-size:8pt;line-height:1.7;color:#333;">
    1. <strong>Hz Angle from BS</strong>: Clockwise horizontal angle from the backsight direction to the design point. Set instrument to 0°00'00&quot; on the BS before turning angles.<br>
    2. <strong>HD</strong>: Horizontal distance from instrument station to design point.<br>
    3. <strong>VD</strong>: Vertical difference from the instrument line of sight to the target centre, computed as (Design RL + TH) - (Station RL + IH). This is not earthworks cut/fill.<br>
    4. <strong>VA</strong>: Vertical angle (positive = up, negative = down). Used to compute slope distance on total station.<br>
    5. <strong>SD</strong>: Slope distance. Instrument must be set to HDist mode for direct HD measurement, or compute HD from SD &times; cos(VA).<br>
    6. <strong>TH</strong>: Target height — measure from peg top to prism centre. Set TH in instrument before observation.<br>
    7. <strong>Construction tolerance</strong>: &plusmn;25 mm horizontal, &plusmn;15 mm vertical (RDM 1.1 Table 5.2). Re-establish any peg outside tolerance.<br>
    8. <strong>Re-observation check</strong>: After each setup, re-observe at least one previously set peg to verify orientation has not shifted.<br>
    9. <strong>Coordinate system</strong>: UTM Arc 1960 / Zone 37S (SRID 21037) unless otherwise stated.<br>
    10. This schedule must be retained as a field record and submitted with the survey computation workbook.
  </div>
</div>`

  // ── Assemble body ──────────────────────────────────────────────────────────

  const bodyHtml = stationBox + statsBar + scheduleTable + jobDescBlock + notesBox

  return buildPrintDocument(bodyHtml, {
    title:        'Setting Out Schedule',
    projectName:  meta.projectName,
    clientName:   meta.clientName,
    surveyorName: meta.surveyorName,
    regNo:        meta.regNo,
    iskNo:        meta.iskNo,
    date:         meta.date,
    instrument:   meta.instrument,
    weather:      meta.weather,
    observer:     meta.observer,
    submissionNo: meta.submissionNo,
    reference:    'Ghilani &amp; Wolf Ch.23 &nbsp;|&nbsp; RDM 1.1 (2025) Table 5.2 &nbsp;|&nbsp; Survey Act Cap 299',
  })
}

export function printSettingOutSchedule(input: SettingOutScheduleInput): void {
  openPrint(generateSettingOutSchedule(input))
}
