import Papa from 'papaparse'
import { engineeringScheduleCsv } from './engineeringScheduleCsv'
import { MAX_PIPELINE_POINTS, analyzePipelineAsBuilt, type PipelinePoint, type PipelineAnalysisResult } from './pipelineAsBuilt'
import { fieldPointNumber } from '@/lib/field/pointEntry'

const HEADERS = ['point_id', 'chainage_m', 'invert_rl_m', 'ground_rl_m', 'internal_diameter_mm', 'outside_diameter_mm', 'joint_type', 'remarks']
const REPORT_HEADERS = [
  ...HEADERS, 'outside_crown_rl_m', 'cover_m', 'next_segment_length_m', 'next_segment_grade_percent', 'cover_assessment', 'assessment_note',
  'minimum_cover_m', 'criterion_reference', 'criterion_revision', 'route', 'design_reference', 'vertical_reference', 'observer', 'instrument', 'algorithm_version', 'escaped_text_fields',
]
const dangerousText = (value: unknown): boolean => typeof value === 'string' && /^[\s]*[=+\-@]/.test(value)
export function pipelineAsBuiltTemplate(): string { return `\uFEFF${HEADERS.join(',')}\r\n` }
export function parsePipelineAsBuiltCsv(csv: string): PipelinePoint[] {
  if (new TextEncoder().encode(csv).length > 1_000_000) throw new Error('CSV exceeds the 1 MB import limit.')
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', dynamicTyping: false })
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`)
  const [rawHeaders, ...rows] = parsed.data
  if (!rawHeaders) throw new Error('Supply the template header and measured observations.')
  const headers = rawHeaders.map(header => header.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.')
  const report = headers.some(header => !HEADERS.includes(header))
  if (report && (headers.length !== REPORT_HEADERS.length || REPORT_HEADERS.some(header => !headers.includes(header)))) throw new Error(`Supply either the observation template or the complete METARDU report CSV. Supported observation headers: ${HEADERS.join(', ')}`)
  if (HEADERS.slice(0, 3).some(header => !headers.includes(header))) throw new Error('CSV needs point_id, chainage_m and invert_rl_m headers.')
  if (!rows.length) throw new Error('CSV has no observations.')
  if (rows.length > MAX_PIPELINE_POINTS) throw new Error(`Import at most ${MAX_PIPELINE_POINTS} observations; split the job explicitly instead of truncating it.`)
  const points = rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Data row ${index + 1}: column count differs from the header.`)
    const get = (header: string) => row[headers.indexOf(header)] ?? ''
    let escaped: string[] = []
    if (report) {
      const marker: unknown = JSON.parse(get('escaped_text_fields'))
      if (!Array.isArray(marker) || marker.some((field: unknown) => typeof field !== 'string' || !HEADERS.includes(field))) throw new Error(`Data row ${index + 1}: invalid text escape record.`)
      escaped = marker as string[]
    }
    const text = (header: string) => {
      const raw = get(header)
      if (!escaped.includes(header)) return raw
      if (!raw.startsWith("'") || !dangerousText(raw.slice(1))) throw new Error(`Data row ${index + 1}: text escape record does not match ${header}.`)
      return raw.slice(1)
    }
    const required = (header: string) => fieldPointNumber(get(header), `Data row ${index + 1}: ${header}`)
    const optional = (header: string) => get(header).trim() ? required(header) : null
    const id = text('point_id').trim()
    if (!id || id.length > 100) throw new Error(`Data row ${index + 1}: point_id must contain 1–100 characters.`)
    return { id, chainage: required('chainage_m'), invertElevation: required('invert_rl_m'), groundElevation: optional('ground_rl_m'), pipeDiameter: optional('internal_diameter_mm'), outsideDiameter: optional('outside_diameter_mm'), jointType: text('joint_type'), remarks: text('remarks') }
  })
  // Validate the complete profile before returning any imported observations.
  analyzePipelineAsBuilt(points)
  return points
}
export interface PipelineReportMetadata {
  route: string
  designReference: string
  verticalReference: string
  observer: string
  instrument: string
}
export function pipelineCoverLabel(value: boolean | null): string {
  return value === null ? 'NOT ASSESSED' : value ? 'MEETS ENTERED MINIMUM' : 'BELOW ENTERED MINIMUM'
}
export function pipelineAsBuiltReportCsv(result: PipelineAnalysisResult, metadata: PipelineReportMetadata): string {
  return `\uFEFF${engineeringScheduleCsv(REPORT_HEADERS, result.points.map(point => [
    point.id, point.chainage, point.invertElevation, point.groundElevation, point.pipeDiameter, point.outsideDiameter, point.jointType, point.remarks,
    point.outsideCrownRl, point.coverDepth, point.segmentLengthM, point.grade, pipelineCoverLabel(point.coverAdequate), point.assessmentNote,
    result.criterion?.minimumCoverM, result.criterion?.source, result.criterion?.revision, metadata.route, metadata.designReference, metadata.verticalReference, metadata.observer, metadata.instrument, result.algorithmVersion,
    JSON.stringify([['point_id', point.id], ['joint_type', point.jointType], ['remarks', point.remarks]].filter(([, value]) => dangerousText(value)).map(([field]) => field)),
  ]))}\r\n`
}
const escape = (value: unknown): string => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const display = (value: number | null): string => value === null ? 'Not recorded' : value.toFixed(3)
export function pipelineAsBuiltReportHtml(result: PipelineAnalysisResult, metadata: PipelineReportMetadata, logoDataUrl?: string): string {
  const logo = logoDataUrl?.startsWith('data:image/png;base64,') ? `<img alt="METARDU" width="40" height="40" src="${escape(logoDataUrl)}">` : ''
  const meta = Object.entries(metadata).map(([label, value]) => `<div><dt>${escape(label.replace(/([A-Z])/g, ' $1'))}</dt><dd>${escape(value || 'Not recorded')}</dd></div>`).join('')
  const criteria = result.criterion ? `Minimum cover ${result.criterion.minimumCoverM} m · ${escape(result.criterion.source)} · revision ${escape(result.criterion.revision)}` : 'No referenced project criterion supplied: cover comparisons NOT ASSESSED.'
  const rows = result.points.map(point => `<tbody><tr><td>${escape(point.id || 'Not recorded')}</td><td>${display(point.chainage)}</td><td>${display(point.invertElevation)}</td><td>${display(point.groundElevation)}</td><td>${display(point.pipeDiameter)} / ${display(point.outsideDiameter)}</td><td>${display(point.outsideCrownRl)}</td><td>${display(point.coverDepth)}</td><td>${display(point.grade)}</td><td>${pipelineCoverLabel(point.coverAdequate)}</td></tr><tr><td colspan="9">Joint: ${escape(point.jointType || 'Not recorded')} · Remarks: ${escape(point.remarks || 'Not recorded')}<br>${escape(point.assessmentNote)}</td></tr></tbody>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>METARDU — measured pipe profile</title><style>
@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{margin:24px;color:#16202a;background:white;font:12px/1.5 Arial,sans-serif}header{display:flex;gap:12px;align-items:center;border-bottom:2px solid #243b44;padding-bottom:12px}h1{font-size:20px;margin:0}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}dt{font-size:10px;text-transform:uppercase;color:#53606c}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #c6cdd2;padding:6px;text-align:right;overflow-wrap:anywhere}th{background:#edf2f4}td:first-child,td[colspan]{text-align:left}tbody{break-inside:avoid}thead{display:table-header-group}.note{border-left:3px solid #a76c17;padding:8px;background:#fcf5e7}footer{margin-top:16px;border-top:1px solid #c6cdd2;padding-top:8px}@media print{body{margin:0}.print{display:none}}
</style></head><body><header>${logo}<div><h1>Measured pipeline as-built profile</h1><strong>DRAFT — numerical screening, not certified or issued</strong></div></header><dl>${meta}</dl><p>${criteria}</p><p>${escape(result.summary)}</p><p class="note">Internal invert means the bottom INSIDE the pipe. Outside crown = internal invert + (actual ID + actual OD) / 2000. Cover = surveyed ground − outside crown; negative cover is exposure. Next-segment grade = (current invert − next invert) / chainage span × 100; positive is fall downstream. Rows do not prove ground/cover between surveyed points, positional accuracy, uncertainty, utilities or approved design compliance.</p><table><thead><tr><th>Observation</th><th>Chainage m</th><th>Internal invert RL m</th><th>Ground RL m</th><th>ID / OD mm</th><th>Outside crown RL m</th><th>Signed cover m</th><th>Next grade %</th><th>Cover comparison</th></tr></thead>${rows}</table>${result.issues.map(issue => `<p class="note">${escape(issue)}</p>`).join('')}<footer>METARDU · Algorithm ${escape(result.algorithmVersion)} · ${result.points.length} observations. Display rounds to 0.001; CSV and JSON retain numeric precision. Independently verify observations, reference, dimensions and applicable design/specification before field reliance.</footer></body></html>`
}
