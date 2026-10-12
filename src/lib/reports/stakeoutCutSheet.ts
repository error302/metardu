/**
 * METARDU — Construction Staking Cut Sheet & Variance Report Generator
 * ====================================================================
 * Generates formatted PDF cut sheets showing design coordinates vs. actual
 * staked coordinates, deltas (ΔE, ΔN, ΔZ), horizontal/vertical offsets,
 * and checks against explicitly entered project criteria.
 *
 * These reports are printed and handed to contractors on-site — a standard
 * deliverable that all competitors provide:
 *   - Trimble Access: Stakeout reports
 *   - Carlson SurvPC: Cut sheets
 *   - Topcon MAGNET: Stakeout variance reports
 *   - Leica Captivate: Setting-out reports
 *
 * No regulatory tolerance, survey identity, CRS, or missing measurement is
 * inferred. Report results do not constitute construction acceptance.
 */
import { evaluateSetoutShot, type SetoutShotResult } from '@/lib/engineering/verticality'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'

export interface StakeoutPoint {
  /** Point ID / beacon name */
  pointId: string
  /** Design coordinates */
  design: {
    easting: number
    northing: number
    elevation?: number
  }
  /** As-staked (actual measured) coordinates */
  staked: {
    easting: number
    northing: number
    elevation?: number
  }
  /** ISO timestamp of when the point was staked */
  timestamp: string
  timestampSource?: 'observation' | 'device_capture'
  /** Optional notes (e.g., "offset from fence", "re-staked") */
  notes?: string
  accuracyM?: number
  /** Known source gaps supplied by project evidence readers, never inferred measurements. */
  evidenceIssues?: string[]
  /** Keep submitted decimal values for immutable project captures. */
  displayOriginalCoordinates?: boolean
}

export interface StakeoutReportInput {
  /** Project name */
  projectName: string
  /** Land Reference (e.g., "L.R. No. 209/12345") */
  landReference?: string
  /** Surveyor name */
  surveyorName: string
  /** Surveyor license number */
  surveyorLicense?: string
  /** Report date */
  reportDate: string
  /** Instrument used */
  instrument?: string
  /** Instrument serial number */
  instrumentSerial?: string
  /** Survey method */
  method?: 'GNSS RTK' | 'Total Station' | 'GNSS PPK' | 'GNSS Static'
  /** Stakeout tolerance configuration */
  tolerance: {
    /** Horizontal position tolerance in metres */
    horizontalM: number
    /** Vertical position tolerance in metres (optional) */
    verticalM?: number
    /** Issued drawing/specification identifying the entered limits. */
    reference: string
  }
  /** Staked points */
  points: StakeoutPoint[]
  /** Coordinate reference system */
  crs?: string
  verticalDatum?: string
  designRevision?: string
  synthetic?: boolean
}

export interface StakeoutPointResult extends StakeoutPoint {
  /** Delta Easting (staked - design) */
  deltaE: number
  /** Delta Northing (staked - design) */
  deltaN: number
  /** Delta Elevation (staked - design), if both elevations exist */
  deltaH?: number
  /** Horizontal offset (2D distance between design and staked) */
  horizontalOffset: number
  /** Vertical offset (absolute difference in elevation) */
  verticalOffset?: number
  /** Whether point passes horizontal tolerance */
  horizontalPass: boolean
  /** Null when a vertical comparison is not assessed. */
  verticalPass: boolean | null
  status: SetoutShotResult['result']
  statusReason: string
  /** Overall pass/fail */
  pass: boolean
}

export interface StakeoutReportResult {
  /** All point results with computed deltas and pass/fail */
  points: StakeoutPointResult[]
  /** Summary statistics */
  summary: {
    totalPoints: number
    passedPoints: number
    failedPoints: number
    warningPoints: number
    unassessedPoints: number
    status: SetoutShotResult['result']
    passRate: number
    maxHorizontalOffset: number
    avgHorizontalOffset: number
    rmsHorizontalOffset: number
    maxVerticalOffset?: number
    avgVerticalOffset?: number
    overallPass: boolean
  }
  /** Report metadata */
  metadata: StakeoutReportInput
}

/**
 * Compute stakeout variance analysis for all points.
 *
 * For each staked point, computes:
 *   - ΔE = staked.easting - design.easting
 *   - ΔN = staked.northing - design.northing
 *   - ΔH = staked.elevation - design.elevation (if both exist)
 *   - Horizontal offset = √(ΔE² + ΔN²)
 *   - Pass/Fail against configured tolerances
 *
 * Judgements use the same engine as project field set-out. Missing evidence
 * remains unassessed and rounding is confined to presentation.
 */
export function computeStakeoutReport(input: StakeoutReportInput): StakeoutReportResult {
  if (!input.crs?.trim()) throw new RangeError('Enter the project CRS before comparing coordinates.')
  const crs = assertProjectedCrs(input.crs)
  if (crs.units !== 'metres') throw new RangeError('Stakeout comparison requires a projected metre CRS.')
  if (!Number.isFinite(input.tolerance.horizontalM) || input.tolerance.horizontalM <= 0
    || (input.tolerance.verticalM !== undefined && (!Number.isFinite(input.tolerance.verticalM) || input.tolerance.verticalM <= 0))) {
    throw new RangeError('Enter finite positive project tolerances.')
  }
  if (!input.tolerance.reference?.trim()) throw new RangeError('Enter the drawing or specification reference for the tolerances.')
  if (!Array.isArray(input.points) || input.points.length > 10000) throw new RangeError('A cut sheet supports at most 10,000 points; split the work into separate sheets.')
  const labels = new Set<string>()
  const pointResults: StakeoutPointResult[] = input.points.map((point) => {
    const label = point.pointId.trim()
    if (!label || labels.has(label)) throw new RangeError('Each cut-sheet point needs a unique non-empty identifier.')
    labels.add(label)
    const evaluated = evaluateSetoutShot({
      designE: point.design.easting, designN: point.design.northing, designZ: point.design.elevation,
      observedE: point.staked.easting, observedN: point.staked.northing, observedZ: point.staked.elevation,
    }, { horizontalM: input.tolerance.horizontalM, verticalM: input.tolerance.verticalM ?? input.tolerance.horizontalM, accuracyM: point.accuracyM })
    for (const coordinates of [point.design, point.staked]) {
      const checked = validateCoordinateRange(coordinates.easting, coordinates.northing, crs.code)
      if (!checked.valid) throw new RangeError(`${label}: ${checked.errors.join('; ')}`)
    }
    const hasVerticalCriterion = input.tolerance.verticalM !== undefined
    const levelsPresent = point.design.elevation !== undefined && point.staked.elevation !== undefined
    const partialVerticalEvidence = point.design.elevation !== undefined || point.staked.elevation !== undefined
    let status = evaluated.result
    let statusReason = evaluated.message
    if (hasVerticalCriterion && !levelsPresent) {
      status = 'INFO'
      statusReason = 'Both design and observed RLs are required for the entered vertical criterion.'
    } else if (hasVerticalCriterion && !input.verticalDatum?.trim()) {
      status = 'INFO'
      statusReason = 'Record the common vertical datum or site benchmark before assessing level differences.'
    } else if (!hasVerticalCriterion && partialVerticalEvidence) {
      status = 'INFO'
      statusReason = 'Levels were supplied but no vertical criterion was entered; the level comparison is not assessed.'
    }
    if (point.evidenceIssues?.length) {
      status = 'INFO'
      statusReason = point.evidenceIssues.join('; ')
    }
    const verticalOffset = evaluated.verticalErrorM ?? undefined
    return {
      ...point, pointId: label,
      design: { ...point.design }, staked: { ...point.staked },
      deltaE: evaluated.dE, deltaN: evaluated.dN, deltaH: evaluated.dZ ?? undefined,
      horizontalOffset: evaluated.horizontalErrorM, verticalOffset,
      horizontalPass: evaluated.horizontalErrorM <= input.tolerance.horizontalM,
      verticalPass: status !== 'INFO' && input.tolerance.verticalM !== undefined && verticalOffset !== undefined ? verticalOffset <= input.tolerance.verticalM : null,
      status, statusReason, pass: status === 'PASS',
    }
  })

  // Compute summary statistics
  const totalPoints = pointResults.length
  const passedPoints = pointResults.filter((p) => p.pass).length
  const failedPoints = pointResults.filter((point) => point.status === 'FAIL').length
  const warningPoints = pointResults.filter((point) => point.status === 'WARN').length
  const unassessedPoints = pointResults.filter((point) => point.status === 'INFO').length
  const status = failedPoints ? 'FAIL' : warningPoints ? 'WARN' : unassessedPoints || totalPoints === 0 ? 'INFO' : 'PASS'

  const horizontalOffsets = pointResults.map((p) => p.horizontalOffset)
  const maxHorizontalOffset = horizontalOffsets.reduce((max, value) => Math.max(max, value), 0)
  const avgHorizontalOffset = totalPoints > 0
    ? horizontalOffsets.reduce((a, b) => a + b, 0) / totalPoints
    : 0
  const rmsHorizontalOffset = totalPoints > 0
    ? Math.sqrt(horizontalOffsets.reduce((a, b) => a + b * b, 0) / totalPoints)
    : 0

  const verticalOffsets = pointResults.map((p) => p.verticalOffset)
    .filter((offset): offset is number => offset !== undefined)
  const maxVerticalOffset = verticalOffsets.length > 0 ? verticalOffsets.reduce((max, value) => Math.max(max, value), 0) : undefined
  const avgVerticalOffset = verticalOffsets.length > 0
    ? verticalOffsets.reduce((a, b) => a + b, 0) / verticalOffsets.length
    : undefined

  return {
    points: pointResults,
    summary: {
      totalPoints,
      passedPoints,
      failedPoints,
      warningPoints, unassessedPoints, status,
      passRate: totalPoints > 0 ? (passedPoints / totalPoints) * 100 : 0,
      maxHorizontalOffset,
      avgHorizontalOffset,
      rmsHorizontalOffset,
      maxVerticalOffset,
      avgVerticalOffset,
      overallPass: status === 'PASS',
    },
    metadata: { ...input, crs: crs.code, tolerance: { ...input.tolerance }, points: pointResults },
  }
}

/**
 * Generate HTML string for a printable stakeout cut sheet.
 *
 * The HTML is styled for A4 landscape printing with:
 *   - Project header with surveyor details
 *   - Tolerance specification
 *   - Point-by-point variance table with color-coded pass/fail
 *   - Summary statistics footer
 *   - CSS print styles for clean paper output
 */
export function generateStakeoutCutSheetHTML(report: StakeoutReportResult): string {
  const { points, summary, metadata } = report

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const offsetText = (value: number) => value !== 0 && Math.abs(value) < 0.0001 ? value.toExponential(4) : value.toFixed(4)

  const pointRows = points.map((p) => {
    const coordinateText = (value: number | undefined) => value === undefined ? '—' : p.displayOriginalCoordinates ? String(value) : value.toFixed(3)
    const passClass = p.status === 'PASS' ? 'pass' : p.status === 'FAIL' ? 'fail' : 'info'
    const passText = p.status === 'INFO' ? 'NOT ASSESSED' : p.status
    return `
      <tbody class="point-group"><tr class="${passClass}">
        <td>${escapeHtml(p.pointId)}</td>
        <td class="num">${coordinateText(p.design.easting)}</td>
        <td class="num">${coordinateText(p.design.northing)}</td>
        <td class="num">${coordinateText(p.design.elevation)}</td>
        <td class="num">${coordinateText(p.staked.easting)}</td>
        <td class="num">${coordinateText(p.staked.northing)}</td>
        <td class="num">${coordinateText(p.staked.elevation)}</td>
        <td class="num delta">${p.deltaE >= 0 ? '+' : ''}${offsetText(p.deltaE)}</td>
        <td class="num delta">${p.deltaN >= 0 ? '+' : ''}${offsetText(p.deltaN)}</td>
        <td class="num delta">${p.deltaH !== undefined ? ((p.deltaH >= 0 ? '+' : '') + offsetText(p.deltaH)) : '—'}</td>
        <td class="num offset">${offsetText(p.horizontalOffset)}</td>
        <td class="verdict ${passClass}">${passText}</td>
      </tr>
      <tr class="${passClass}"><td colspan="12">${escapeHtml(p.statusReason)} · Reported horizontal precision: ${p.accuracyM === undefined ? 'Not provided' : p.accuracyM + ' m'} · ${p.timestampSource === 'device_capture' ? 'Device capture at (reported)' : 'Observed at'}: ${escapeHtml(p.timestamp || 'Not provided')}${p.notes ? ' · Notes: ' + escapeHtml(p.notes) : ''}</td></tr></tbody>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Stakeout Cut Sheet — ${escapeHtml(metadata.projectName)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
    .header h1 { font-size: 16px; font-weight: bold; text-transform: uppercase; }
    .header h2 { font-size: 11px; font-weight: normal; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 8px; font-size: 11px; }
    .meta-grid span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #333; color: #fff; padding: 3px 4px; text-align: center; font-weight: bold; border: 1px solid #000; }
    td { padding: 2px 4px; border: 1px solid #999; }
    td.num { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; overflow-wrap: normal; }
    td.delta { color: #333; }
    tr.fail { background: #ffe0e0; }
    tr.pass { background: #e8ffe8; }
    tr.info { background: #fff4dc; }
    td.verdict { font-weight: bold; text-align: center; }
    td.verdict.pass { color: #006600; }
    td.verdict.fail { color: #cc0000; }
    .summary { margin-top: 8px; border-top: 2px solid #000; padding-top: 4px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 9px; }
    .summary-grid .value { font-weight: bold; font-size: 11px; }
    .overall { text-align: center; font-size: 16px; font-weight: bold; margin-top: 8px; padding: 4px; }
    .overall.pass { background: #006600; color: #fff; }
    .overall.fail { background: #cc0000; color: #fff; }
    .overall.info { background: #fff4dc; color: #684400; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    tbody.point-group { break-inside: avoid; }
    td { overflow-wrap: anywhere; }
    .footer { margin-top: 12px; font-size: 8px; color: #666; text-align: center; }
    @media print {
      tr.fail { background: #ffe0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr.pass { background: #e8ffe8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>DRAFT — STAKEOUT CUT SHEET</h1>
    <p>Comparison of entered measurements and criteria; professional review required.${metadata.synthetic ? ' SYNTHETIC EXAMPLE — NOT FIELD EVIDENCE.' : ''}</p>
    <h2>${escapeHtml(metadata.projectName)}</h2>
  </div>

  <div class="meta-grid">
    <div>Project: <span>${escapeHtml(metadata.projectName)}</span></div>
    <div>L.R. No: <span>${escapeHtml(metadata.landReference ?? '—')}</span></div>
    <div>Date: <span>${escapeHtml(metadata.reportDate)}</span></div>
    <div>Surveyor: <span>${escapeHtml(metadata.surveyorName || 'Not provided')}</span></div>
    <div>License: <span>${escapeHtml(metadata.surveyorLicense ?? '—')}</span></div>
    <div>Method: <span>${escapeHtml(metadata.method ?? '—')}</span></div>
    <div>Instrument: <span>${escapeHtml(metadata.instrument ?? '—')}</span></div>
    <div>Serial No: <span>${escapeHtml(metadata.instrumentSerial ?? '—')}</span></div>
    <div>Entered CRS: <span>${escapeHtml(metadata.crs || 'Not provided')}</span></div>
    <div>Vertical datum / benchmark: <span>${escapeHtml(metadata.verticalDatum || 'Not provided')}</span></div>
    <div>Design revision: <span>${escapeHtml(metadata.designRevision || 'Not provided')}</span></div>
    <div>Tolerance reference: <span>${escapeHtml(metadata.tolerance.reference)}</span></div>
    <div>Assessment scope: <span>${metadata.tolerance.verticalM === undefined ? 'Horizontal only; levels are not assessed' : 'Horizontal and vertical criteria'}</span></div>
    <div>H Tolerance: <span>± ${metadata.tolerance.horizontalM} m</span></div>
    <div>V Tolerance: <span>${metadata.tolerance.verticalM !== undefined ? ('± ' + metadata.tolerance.verticalM + ' m') : '—'}</span></div>
    <div>Total Points: <span>${summary.totalPoints}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2">Point ID</th>
        <th colspan="3">DESIGN COORDINATES (m)</th>
        <th colspan="3">AS-STAKED COORDINATES (m)</th>
        <th colspan="3">DELTA (Staked − Design)</th>
        <th rowspan="2">H Offset (m)</th>
        <th rowspan="2">Verdict</th>
      </tr>
      <tr>
        <th>Easting</th><th>Northing</th><th>Elevation</th>
        <th>Easting</th><th>Northing</th><th>Elevation</th>
        <th>ΔE</th><th>ΔN</th><th>ΔH</th>
      </tr>
    </thead>
      ${pointRows}
  </table>

  <div class="summary">
    <div class="summary-grid">
      <div>Passed: <span class="value">${summary.passedPoints}/${summary.totalPoints}</span> (${summary.passRate.toFixed(1)}%)</div>
      <div>Max H Offset: <span class="value">${summary.maxHorizontalOffset.toFixed(3)} m</span></div>
      <div>Avg H Offset: <span class="value">${summary.avgHorizontalOffset.toFixed(3)} m</span></div>
      <div>RMS H Offset: <span class="value">${summary.rmsHorizontalOffset.toFixed(3)} m</span></div>
    </div>
    <p>${summary.warningPoints} warning(s); ${summary.failedPoints} failure(s); ${summary.unassessedPoints} not assessed.</p>
    <div class="overall ${summary.status === 'PASS' ? 'pass' : summary.status === 'FAIL' ? 'fail' : 'info'}">
      ${summary.overallPass ? 'WITHIN ENTERED LIMITS — REVIEW REQUIRED' : summary.failedPoints || summary.warningPoints ? 'ENTERED LIMITS EXCEEDED — REVIEW OBSERVATIONS' : 'ASSESSMENT INCOMPLETE — NO ACCEPTANCE VERDICT'}
    </div>
  </div>

  <div class="footer">
    Generated by METARDU | metardu.space | ${new Date().toISOString()} · ${points.some(point => point.displayOriginalCoordinates) ? 'Coordinates preserve submitted decimal values; decimal places do not establish measurement accuracy' : 'Grid coordinates shown to 0.001 m'}; offsets to 0.0001 m or scientific notation. Judgements use unrounded values. Source measurements, reference systems, instrument uncertainty and design approval require independent verification before construction acceptance.
  </div>
</body>
</html>`
}
