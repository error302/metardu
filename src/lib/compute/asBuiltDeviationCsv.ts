import Papa from 'papaparse'
import type { AsBuiltPoint, DeviationReport, DesignStation } from './asBuiltDeviation'

export const MAX_AS_BUILT_CSV_ROWS = 20_000
export const MAX_AS_BUILT_CSV_BYTES = 10 * 1024 * 1024

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
type CsvRecord = Record<string, string>

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function parseTable(csv: string): { fields: string[]; rows: CsvRecord[] } {
  if (!csv.trim()) throw new Error('The CSV file is empty.')
  const parsed = Papa.parse<CsvRecord>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
    dynamicTyping: false,
  })
  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0]
    const row = typeof firstError.row === 'number' && Number.isInteger(firstError.row)
      ? ` near data row ${firstError.row + 1}`
      : ''
    throw new Error(`Could not parse CSV${row}: ${firstError.message}`)
  }
  if (parsed.data.length === 0) throw new Error('The CSV has a header but no data rows.')
  if (parsed.data.length > MAX_AS_BUILT_CSV_ROWS) {
    throw new Error(`The CSV has ${parsed.data.length.toLocaleString()} rows; the maximum for this page is ${MAX_AS_BUILT_CSV_ROWS.toLocaleString()}.`)
  }
  return { fields: parsed.meta.fields ?? [], rows: parsed.data }
}

function findField(fields: string[], aliases: string[]): string | undefined {
  return aliases.find(alias => fields.includes(alias))
}

function requiredNumber(row: CsvRecord, field: string, label: string, dataRow: number): number {
  const value = row[field]?.trim() ?? ''
  if (!DECIMAL.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`Data row ${dataRow}: ${label} must be a finite decimal number.`)
  }
  return Number(value)
}

export function parseDesignProfileCsv(csv: string): DesignStation[] {
  const { fields, rows } = parseTable(csv)
  const chainageField = findField(fields, ['chainage_m', 'chainage', 'station_m', 'station'])
  const levelField = findField(fields, ['design_rl_m', 'design_rl', 'design_elevation_m', 'design_elevation'])
  if (!chainageField || !levelField) {
    throw new Error('Design CSV needs chainage_m (or chainage) and design_rl_m (or design_rl) columns.')
  }
  return rows.map((row, index) => ({
    chainage: requiredNumber(row, chainageField, 'Chainage (m)', index + 1),
    elevation: requiredNumber(row, levelField, 'Design RL (m)', index + 1),
  }))
}

export function parseAsBuiltPointsCsv(csv: string): AsBuiltPoint[] {
  const { fields, rows } = parseTable(csv)
  const idField = findField(fields, ['point_id', 'point', 'id'])
  const chainageField = findField(fields, ['chainage_m', 'chainage', 'station_m', 'station'])
  const levelField = findField(fields, ['observed_rl_m', 'as_built_rl_m', 'surveyed_rl_m', 'observed_rl', 'surveyed_level'])
  const descriptionField = findField(fields, ['description', 'feature', 'code'])
  if (!idField || !chainageField || !levelField) {
    throw new Error('Observation CSV needs point_id, chainage_m, and observed_rl_m columns.')
  }

  const seenIds = new Set<string>()
  return rows.map((row, index) => {
    const id = row[idField]?.trim() ?? ''
    if (!id) throw new Error(`Data row ${index + 1}: point_id is required.`)
    if (seenIds.has(id)) throw new Error(`Data row ${index + 1}: point_id "${id}" is duplicated.`)
    seenIds.add(id)
    return {
      id,
      chainage: requiredNumber(row, chainageField, 'Chainage (m)', index + 1),
      elevation: requiredNumber(row, levelField, 'Observed RL (m)', index + 1),
      description: descriptionField ? row[descriptionField]?.trim() || undefined : undefined,
    }
  })
}

export function makeDesignProfileCsvTemplate(): string {
  return `\uFEFF${Papa.unparse([['chainage_m', 'design_rl_m']], { newline: '\r\n' })}\r\n`
}

export function makeAsBuiltPointsCsvTemplate(): string {
  return `\uFEFF${Papa.unparse([['point_id', 'chainage_m', 'observed_rl_m', 'description']], { newline: '\r\n' })}\r\n`
}

function safeText(value: string | undefined): string {
  const text = value ?? ''
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function csvNumber(value: number | null): number | string {
  return value !== null && Number.isFinite(value) ? value : ''
}

/** Export every observation, including unassessed points, without implying acceptance. */
export function deviationReportToCsv(
  report: DeviationReport,
  verticalReference: string,
  toleranceSource: string,
): string {
  const rows: Array<Array<string | number>> = [[
    'point_id', 'chainage_m', 'observed_rl_m', 'design_rl_m', 'signed_delta_z_m',
    'absolute_deviation_mm', 'screening_status', 'screening_band', 'within_band_limit_mm',
    'review_band_limit_mm', 'vertical_reference', 'tolerance_source', 'assessment_note',
  ]]
  for (const result of report.results) {
    rows.push([
      safeText(result.pointId),
      csvNumber(result.chainage),
      csvNumber(result.asBuiltElevation),
      csvNumber(result.designElevation),
      csvNumber(result.deltaZ),
      csvNumber(result.deviationMm),
      result.status === 'unassessed' ? 'NOT ASSESSED' : result.status.toUpperCase(),
      safeText(report.tolerance.label),
      report.tolerance.passLimit,
      report.tolerance.marginalLimit,
      safeText(verticalReference),
      safeText(toleranceSource),
      safeText(result.assessmentNote),
    ])
  }
  return `\uFEFF${Papa.unparse(rows, { newline: '\r\n' })}\r\n`
}
