import { computeStakeoutReport, generateStakeoutCutSheetHTML, type StakeoutPoint, type StakeoutReportResult } from './stakeoutCutSheet'
import { captureForSavedShot } from './projectSetoutEvidence'
import type { SavedShotRow } from './projectSetoutCsv'
import type { CurrentSetoutCaptureSnapshot } from '@/lib/field/setoutCapture'

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export interface ProjectSetoutReportOptions { revision: number | null; logoDataUrl?: string; synthetic?: boolean }

function targetContext(row: SavedShotRow, revision: number): string {
  if (row.target_revision !== revision || !row.target_metadata || typeof row.target_metadata !== 'object' || Array.isArray(row.target_metadata)) return ''
  const target = row.target_metadata as Record<string, unknown>
  if (typeof target.pipeId !== 'string') return ''
  const numeric = (key: string) => {
    const value = target[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'not recorded'
    if (Number.isInteger(value)) return String(value)
    return Math.abs(value) < 0.000001 ? value.toExponential(6) : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  }
  const text = (key: string) => typeof target[key] === 'string' ? target[key] : 'not recorded'
  return `Saved target context R${revision} (separate from capture snapshot; context rounded to 6 decimals): Pipe ${target.pipeId}; ${text('stationRole')}; Chainage: ${numeric('runChainageM')} m; Pipe chainage: ${numeric('pipeChainageM')} m; ${text('horizontalTarget')}; ${text('verticalTarget')}; Pipe length: ${numeric('pipeLengthM')} m; Fall: ${numeric('pipeFallM')} m; gradient: ${numeric('pipeGradientPercent')}%; Crown RL: ${numeric('crownLevelM')} m; Cover: ${numeric('coverAboveCrownM')} m; ${text('coverAssessment')}`
}

/** Common evidence/assessment model for HTML and native PDF renderers. */
export function prepareProjectSetoutReport(rows: SavedShotRow[], options: ProjectSetoutReportOptions) {
  if (!rows.length || rows.length > 10000) throw new RangeError('A project cut sheet requires 1–10,000 saved observations.')
  const first = rows[0]
  const groups = new Map<string, { report: Omit<StakeoutReportResult['metadata'], 'points'>; points: StakeoutPoint[] }>()
  const legacy: SavedShotRow[] = []
  const unassessedCaptures:Array<{row:SavedShotRow;snapshot:CurrentSetoutCaptureSnapshot}>=[]
  rows.forEach((row, index) => {
    if (row.project_id !== first.project_id || row.definition_id !== first.definition_id) throw new RangeError('A cut sheet must belong to one project and definition.')
    const snapshot = captureForSavedShot(row)
    if (!snapshot) { legacy.push(row); return }
    if(snapshot.schemaVersion===2&&(snapshot.tolerance.horizontalM==null||snapshot.tolerance.verticalM==null)){unassessedCaptures.push({row,snapshot});return}
    const horizontalM=snapshot.tolerance.horizontalM,verticalM=snapshot.tolerance.verticalM
    if(horizontalM==null||verticalM==null)throw new RangeError('Saved capture criteria are incomplete.')
    const reference = (snapshot.tolerance.profile?.source ?? 'METARDU default numeric criteria — not issued project requirements') + ` / ${snapshot.tolerance.version}`
    const horizontalOnly = snapshot.design.rl === null && snapshot.observed.rl === null
    const key = JSON.stringify([snapshot.designRevision, snapshot.horizontalCrs, snapshot.verticalDatum, snapshot.tolerance, horizontalOnly])
    if (!groups.has(key)) groups.set(key, { report: {
      projectName: row.definition_name, surveyorName: '', reportDate: new Date().toISOString().slice(0, 10),
      crs: snapshot.horizontalCrs, verticalDatum: snapshot.verticalDatum ?? undefined,
      designRevision: `${row.definition_id} / R${snapshot.designRevision}`,
      tolerance: { horizontalM, verticalM: horizontalOnly ? undefined : verticalM, reference },
      synthetic: options.synthetic,
    }, points: [] })
    const evidenceIssues: string[] = []
    if(snapshot.schemaVersion===1)evidenceIssues.push('Historical v1 assessment; current capture prerequisites were not recorded')
    else evidenceIssues.push(...snapshot.acceptance.issues)
    if (snapshot.horizontalCrsEvidence !== 'device_and_definition') evidenceIssues.push('Capture CRS was not confirmed by both device and definition')
    if (!snapshot.capturedAt) evidenceIssues.push('Device capture time was not provided')
    const details = [
      targetContext(row, snapshot.designRevision),
      `Observation ID: ${row.id}`, `Server recorded: ${new Date(row.staked_at).toISOString()}`,
      row.operator_name ? `Operator: ${row.operator_name}` : '',
      row.instrument ? `Instrument: ${row.instrument}${row.instrument_serial ? '; serial: ' + row.instrument_serial : ''}` : '',
      evidenceIssues.length || !snapshot.verticalDatum ? `Recorded numerical result: ${snapshot.assessment.result}` : '',
      snapshot.schemaVersion===2?`Reported level uncertainty: ${snapshot.reportedVerticalAccuracyM??'not recorded'} m; observed height reference: ${snapshot.deviceVerticalDatum??'not recorded'}; captured criterion: ${snapshot.capturedToleranceProfileId??'not recorded'}`:'',row.notes ?? '',
    ].filter(Boolean).join(' · ')
    const group = groups.get(key)
    if (!group) throw new Error('The capture criteria group was not created.')
    group.points.push({
      pointId: `${row.label} (shot ${index + 1})`,
      design: { easting: snapshot.design.easting, northing: snapshot.design.northing, elevation: snapshot.design.rl ?? undefined },
      staked: { easting: snapshot.observed.easting, northing: snapshot.observed.northing, elevation: snapshot.observed.rl ?? undefined },
      timestamp: snapshot.capturedAt ?? '', timestampSource: 'device_capture', accuracyM: snapshot.reportedAccuracyM ?? undefined, notes: details, evidenceIssues, displayOriginalCoordinates: true,
    })
  })
  const reports = Array.from(groups.values(), (group) => computeStakeoutReport({ ...group.report, points: group.points }))
  return { first, reports, legacy,unassessedCaptures }
}

export function generateProjectSetoutHtml(rows: SavedShotRow[], options: ProjectSetoutReportOptions): string {
  const { first, reports, legacy,unassessedCaptures } = prepareProjectSetoutReport(rows, options)
  // Reuse the established print layout and engine for each immutable criteria
  // group. Values are escaped by its renderer; this extracts only our own HTML.
  const documents = reports.map((report) => generateStakeoutCutSheetHTML(report))
  const head = documents[0] ? documents[0].slice(0, documents[0].indexOf('<body>')) :
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Draft saved set-out history</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.info{background:#fff4dc}</style></head>'
  const sections = documents.map((html) => `<section class="capture-section">${html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))}</section>`).join('\n')
  const legacySection = legacy.length ? `<section class="capture-section"><h2>Legacy observations — NOT ASSESSED</h2><p>Original capture precision, reference, or time was not stored. These rows remain historical evidence; no acceptance is reconstructed.</p><table><thead><tr><th>Point / observation ID</th><th>Design E / N / RL (m)</th><th>Stored observed E / N / RL (m)</th><th>Historical result</th><th>Server recorded at</th></tr></thead><tbody>${legacy.map((row) => `<tr class="info"><td>${escape(row.label)}<br>${escape(row.id)}</td><td>${escape(row.design_easting)} / ${escape(row.design_northing)} / ${escape(row.design_rl ?? 'not provided')}</td><td>${escape(row.observed_easting)} / ${escape(row.observed_northing)} / ${escape(row.observed_rl ?? 'not provided')}</td><td>${escape(row.result)}<br>NOT ASSESSED in this report</td><td>${escape(new Date(row.staked_at).toISOString())}</td></tr>`).join('')}</tbody></table></section>` : ''
  const logo = options.logoDataUrl?.startsWith('data:image/png;base64,') ? `<img src="${escape(options.logoDataUrl)}" alt="METARDU" width="40" height="40">` : ''
  const unassessedSection=unassessedCaptures.length?`<section class="capture-section"><h2>Captured observations — NOT ASSESSED</h2><p>Adopted project criteria were not recorded. No thresholds or acceptance are inferred. Original captured coordinates and differences are retained.</p><table><thead><tr><th>Observation / revision</th><th>Design E / N / RL (m)</th><th>Observed E / N / RL (m)</th><th>Entered dE / dN / dRL (m)</th><th>Capture evidence</th></tr></thead><tbody>${unassessedCaptures.map(({row,snapshot:s})=>`<tr class="info"><td>${escape(row.label)} / ${escape(row.id)} / R${s.designRevision}</td><td>${escape(s.design.easting)} / ${escape(s.design.northing)} / ${escape(s.design.rl??'not recorded')}</td><td>${escape(s.observed.easting)} / ${escape(s.observed.northing)} / ${escape(s.observed.rl??'not recorded')}</td><td>${escape(s.assessment.dE)} / ${escape(s.assessment.dN)} / ${escape(s.assessment.dZ??'not recorded')}</td><td>NOT ASSESSED<br>${escape(s.assessment.message)}<br>Declared CRS ${escape(s.horizontalCrs)}; design height reference ${escape(s.verticalDatum??'not recorded')}; observed reference ${escape(s.deviceVerticalDatum??'not recorded')}; H/V uncertainty ${escape(s.reportedAccuracyM??'not recorded')} / ${escape(s.reportedVerticalAccuracyM??'not recorded')} m; device UTC ${escape(s.capturedAt??'not recorded')}<br>${escape(row.notes??'')}</td></tr>`).join('')}</tbody></table></section>`:''
  return head.replace('</head>', '<style>.capture-section + .capture-section { break-before: page; } .project-heading { margin-bottom: 12px; } .project-heading img { float: left; margin-right: 10px; } .project-heading h1 { font-size: 18px; } .project-heading p { margin-top: 4px; }</style></head>') + `<body><header class="project-heading">${logo}<h1>DRAFT — SAVED SET-OUT HISTORY</h1><p>${escape(first.definition_name)}${options.synthetic ? ' · SYNTHETIC VERIFICATION DATA — NOT FIELD EVIDENCE' : ''}</p><p>Project ${escape(first.project_id)} · Definition ${escape(first.definition_id)} · ${options.revision == null ? 'All saved design revisions' : 'Design revision ' + options.revision}</p><p>${rows.length} saved observation(s), including re-stakes. Device-only records are excluded. Numerical comparisons use immutable capture measurements and recorded criteria; professional review and design approval are required before construction acceptance. Survey control is not verified by this report.</p><p>Capture times are device-reported, not independently verified. Operator is missing in ${rows.filter(row => !row.operator_name).length} record(s); instrument is missing in ${rows.filter(row => !row.instrument).length}. Provided details appear beside the observation.</p></header>${sections}${unassessedSection}${legacySection}</body></html>`
}
