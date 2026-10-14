import { parseVerticalityCapture, type VerticalityCaptureSnapshot } from '@/lib/field/verticalityCapture'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'

export const MAX_PLUMB_HISTORY_ROWS = 1000
export interface SavedPlumbRow {
  id: string; project_id: string; project_name: string; definition_id: string | null; label: string; level: string | null
  base_easting: number | string; base_northing: number | string; base_rl: number | string | null
  top_easting: number | string; top_northing: number | string; top_rl: number | string | null
  offset_h: number | string | null; tilt_ratio: string | null; tolerance_ratio: string | null; result: string
  instrument: string | null; observed_by: string | null; observed_at: string | Date; notes: string | null
  capture_snapshot: unknown; client_reading_id: string | null
}
function numeric(value: number | string | null): number | null {
  if (value === null) return null
  if (typeof value === 'string' && !value.trim() || !Number.isFinite(Number(value))) throw new Error('Stored plumb measurement is invalid; review the evidence before export.')
  return Number(value)
}
function sameRounded(original: number | null, stored: number | string | null, resolution: number): boolean {
  const number = numeric(stored)
  return original === null ? number === null : number !== null && Math.abs(original - number) <= resolution / 2 + 0.000000001
}
function validatedCapture(row: SavedPlumbRow): VerticalityCaptureSnapshot | null {
  if (row.capture_snapshot === null || row.capture_snapshot === undefined) return null
  const s = parseVerticalityCapture(row.capture_snapshot)
  if (!s || s.projectId !== row.project_id || s.definitionId !== row.definition_id || s.label !== row.label || s.level !== row.level
    || s.instrument !== row.instrument || s.notes !== row.notes || s.assessment.result !== row.result
    || !sameRounded(s.base.easting, row.base_easting, 0.001) || !sameRounded(s.base.northing, row.base_northing, 0.001) || !sameRounded(s.base.rl, row.base_rl, 0.001)
    || !sameRounded(s.top.easting, row.top_easting, 0.001) || !sameRounded(s.top.northing, row.top_northing, 0.001) || !sameRounded(s.top.rl, row.top_rl, 0.001)
    || !sameRounded(s.assessment.offsetM, row.offset_h, 0.0001)
    || row.tilt_ratio !== (s.assessment.tiltRatioKind === 'infinite' ? '1:inf' : s.assessment.tiltRatio === null ? null : `1:${Math.round(s.assessment.tiltRatio)}`)
    || row.tolerance_ratio !== (s.criteria ? `1:${s.criteria.minTiltRatio}` : null)) throw new Error('Saved plumb capture evidence is inconsistent or unsupported; review the observation before exporting.')
  return s
}
export function preparePlumbHistory(rows: SavedPlumbRow[]) {
  if (!rows.length || rows.length > MAX_PLUMB_HISTORY_ROWS) throw new RangeError('A plumb report requires 1-1,000 saved readings; filter the column or server-recording dates.')
  const first = rows[0]
  const items = rows.map(row => {
    if (row.project_id !== first.project_id) throw new RangeError('A plumb report must belong to one project.')
    const recordedAt = new Date(row.observed_at)
    if (!Number.isFinite(recordedAt.getTime()) || !['PASS', 'WARN', 'FAIL', 'INFO'].includes(row.result)) throw new Error('Saved plumb evidence has an invalid result or timestamp.')
    const snapshot = validatedCapture(row)
    const base = snapshot?.base ?? { easting: numeric(row.base_easting), northing: numeric(row.base_northing), rl: numeric(row.base_rl) }
    const top = snapshot?.top ?? { easting: numeric(row.top_easting), northing: numeric(row.top_northing), rl: numeric(row.top_rl) }
    if (base.easting === null || base.northing === null || top.easting === null || top.northing === null) throw new Error('Saved centre coordinates are incomplete.')
    return { row, snapshot, base, top, recordedAt: recordedAt.toISOString(), recordedResult: row.result,
      exportAssessment: snapshot && snapshot.assessment.result !== 'INFO' ? snapshot.assessment.result : 'NOT ASSESSED',
      crs: snapshot?.horizontalCrs ?? null, verticalDatum: snapshot?.verticalDatum ?? null,
      units: snapshot ? 'metres' : 'Not recorded',
      offset: snapshot?.assessment.offsetM ?? numeric(row.offset_h), height: snapshot?.assessment.heightM ?? null,
      ratio: snapshot ? snapshot.assessment.tiltRatioKind === 'infinite' ? 'Infinite (zero measured offset)' : snapshot.assessment.tiltRatio === null ? 'Unknown' : `1:${snapshot.assessment.tiltRatio}` : row.tilt_ratio ?? 'Unknown',
      explanation: snapshot?.assessment.message ?? 'Historical recorded result only. Capture reference, criteria and uncertainty evidence were not stored; current acceptance is not reconstructed.' }
  })
  return { first, items, summary: { total: items.length, passed: items.filter(item => item.exportAssessment === 'PASS').length, failed: items.filter(item => item.exportAssessment === 'FAIL').length, unassessed: items.filter(item => item.exportAssessment === 'NOT ASSESSED').length } }
}
export type PreparedPlumbItem = ReturnType<typeof preparePlumbHistory>['items'][number]
export interface PlumbReportOptions { synthetic?: boolean; logoDataUrl?: string }
export function generatePlumbHistoryCsv(rows: SavedPlumbRow[]): string {
  const { items } = preparePlumbHistory(rows)
  const headers = ['Project_ID', 'Project_name', 'Observation_ID', 'Definition_ID', 'Column', 'Level', 'Base_E_m', 'Base_N_m', 'Base_RL_m', 'Top_E_m', 'Top_N_m', 'Top_RL_m', 'Recorded_result', 'Export_assessment', 'Capture_CRS', 'Captured_CRS', 'Declared_height_reference', 'Captured_height_reference', 'Height_m', 'Offset_m', 'Ratio', 'Recorded_ratio', 'Recorded_tolerance_ratio', 'Displacement_uncertainty_m', 'Height_uncertainty_m', 'Device_capture_UTC', 'Server_recorded_UTC', 'Recorded_by_account', 'Device_reading_ID', 'Criteria_name', 'Criteria_reference', 'Criteria_revision', 'Max_offset_m', 'Min_tilt_ratio', 'Transcribed_approver', 'Algorithm', 'Algorithm_version', 'Capture_schema_version', 'Evidence_issues', 'Instrument', 'Notes']
  headers.push('Capture_coordinate_units')
  return '\uFEFF' + engineeringScheduleCsv(headers, items.map(item => {
    const r = item.row, s = item.snapshot, c = s?.criteria
    return [r.project_id, r.project_name, r.id, r.definition_id, r.label, r.level, item.base.easting, item.base.northing, item.base.rl, item.top.easting, item.top.northing, item.top.rl, item.recordedResult, item.exportAssessment, item.crs, s?.capturedCrs, item.verticalDatum, s?.capturedVerticalDatum, item.height, item.offset, item.ratio, r.tilt_ratio, r.tolerance_ratio, s?.horizontalUncertaintyM, s?.heightUncertaintyM, s?.capturedAt, item.recordedAt, r.observed_by, r.client_reading_id, c?.name, c?.reference, c?.version, c?.maxOffsetM, c?.minTiltRatio, c?.approvedBy, s?.algorithm.id, s?.algorithm.version, s?.schemaVersion, s?.assessment.issues.join('; ') ?? 'Historical evidence missing', r.instrument, r.notes, item.units]
  }))
}
const escape = (value: unknown) => String(value ?? 'Not recorded').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
export function generatePlumbHistoryHtml(rows: SavedPlumbRow[], options: PlumbReportOptions = {}): string {
  const { first, items, summary } = preparePlumbHistory(rows)
  const logo = options.logoDataUrl?.startsWith('data:image/png;base64,') ? `<img src="${escape(options.logoDataUrl)}" width="36" height="36" alt="METARDU">` : ''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Draft saved plumb history</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial;color:#181818}header{border-bottom:2px solid #92713b;padding-bottom:12px}header img{float:left;margin-right:12px}h1{font-size:20px}h2{font-size:14px}article{margin-top:20px;border-top:1px solid #aaa;padding-top:10px}table{width:100%;border-collapse:collapse;break-inside:avoid}th,td{text-align:left;padding:7px;border:1px solid #bbb}th{background:#eee}.details{line-height:1.6;overflow-wrap:anywhere}footer{margin-top:16px;font-size:11px}</style></head><body><header>${logo}<h1>DRAFT - SAVED COLUMN-PLUMB HISTORY</h1><p>${escape(first.project_name)} · Project ${escape(first.project_id)}${options.synthetic ? ' · SYNTHETIC VERIFICATION ONLY' : ''}</p><p>${summary.total} saved readings, including repeated observations. Numerical PASS ${summary.passed}; FAIL ${summary.failed}; NOT ASSESSED ${summary.unassessed}.</p><p>Entered grid-coordinate comparisons. Survey control, calibration, source approval and construction acceptance require independent review. No current project reference or limits are assigned to historical records.</p></header>${items.map(item => {
    const r = item.row, s = item.snapshot, c = s?.criteria
    return `<article><h2>${escape(r.label)} / ${escape(r.level)} - ${escape(item.exportAssessment)}</h2><p>Observation ${escape(r.id)} · Recorded result ${escape(item.recordedResult)} · ${s ? 'Versioned numerical capture' : 'Historical record - NOT ASSESSED'}</p><table><thead><tr><th>Centre</th><th>Easting${s ? " (m)" : ""}</th><th>Northing${s ? " (m)" : ""}</th><th>RL${s ? " (m)" : ""}</th></tr></thead><tbody><tr><td>Base</td><td>${escape(item.base.easting)}</td><td>${escape(item.base.northing)}</td><td>${escape(item.base.rl)}</td></tr><tr><td>Top</td><td>${escape(item.top.easting)}</td><td>${escape(item.top.northing)}</td><td>${escape(item.top.rl)}</td></tr></tbody></table><div class="details">${s ? "" : "<p>Capture coordinate/level units were not recorded; values are shown as stored.</p>"}<p>${s ? 'Captured numerical' : 'Historical recorded'} offset ${escape(item.offset)}${s ? " m" : ""}; height ${escape(item.height)}${s ? " m" : ""}; ratio ${escape(item.ratio)}.<br>${escape(item.explanation)}</p><p>Capture CRS ${escape(item.crs)}; observed CRS ${escape(s?.capturedCrs)}. Declared/observed height reference ${escape(item.verticalDatum)} / ${escape(s?.capturedVerticalDatum)}.<br>Reported displacement/height uncertainty ${escape(s?.horizontalUncertaintyM)} / ${escape(s?.heightUncertaintyM)} m.<br>Criteria ${escape(c?.name)}; ${escape(c?.reference)} / ${escape(c?.version)}. Maximum offset ${escape(c?.maxOffsetM)} m; minimum ratio ${escape(c?.minTiltRatio)}; named approver (transcription) ${escape(c?.approvedBy)}.</p><p>Device capture UTC ${escape(s?.capturedAt)} (device reported). Server recorded UTC ${escape(item.recordedAt)}.<br>Account ${escape(r.observed_by)}; instrument ${escape(r.instrument)}; device ID ${escape(r.client_reading_id)}; algorithm ${escape(s?.algorithm.id)} / ${escape(s?.algorithm.version)}.</p><p>Notes: ${escape(r.notes)}</p></div></article>`
  }).join('')}<footer>Saved server history only; device-only drafts are excluded. PASS means within entered numerical limits; FAIL means limits exceeded; NOT ASSESSED means missing capture evidence. This draft is not construction acceptance.</footer></body></html>`
}
