import Papa from 'papaparse'
import type { SettingOutPoint } from '@/lib/documents/templates/setting-out'

const MAX_CSV_CHARACTERS = 400_000
const MAX_POINTS = 1_000
const DECIMAL_NUMBER = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/

function isHeader(row: string[]): boolean {
  const [id = '', easting = '', northing = ''] = row.map(value => value.trim().toLowerCase())
  return /^(id|point|point id|point_id)$/.test(id)
    && /(easting|design\s*e|design e)/.test(easting)
    && /(northing|design\s*n|design n)/.test(northing)
}

function readRequiredNumber(value: string | undefined, rowNumber: number, label: string): number {
  const raw = value?.trim() ?? ''
  const parsed = Number(raw)
  if (!raw || !DECIMAL_NUMBER.test(raw) || !Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: ${label} must be a finite decimal number in metres.`)
  }
  return parsed
}

function readOptionalNumber(value: string | undefined, rowNumber: number, label: string): number | undefined {
  const raw = value?.trim() ?? ''
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!DECIMAL_NUMBER.test(raw) || !Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: ${label} must be a finite decimal number in metres when supplied.`)
  }
  return parsed
}

/** Parse spreadsheet CSV/TSV without calculating or transforming survey values. */
export function parseSettingOutSheetCsv(input: string): SettingOutPoint[] {
  if (!input.trim()) throw new Error('Paste at least one design point.')
  if (input.length > MAX_CSV_CHARACTERS) throw new Error('The point list is too large. Limit it to 400,000 characters.')

  const csv = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy', dynamicTyping: false })
  if (parsed.errors.length) {
    const issue = parsed.errors[0]
    throw new Error(`CSV could not be read near row ${(issue.row ?? 0) + 1}: ${issue.message}`)
  }

  const rows = [...parsed.data]
  const firstRow = rows[0] ?? []
  const hasHeader = isHeader(firstRow)
  if (hasHeader) rows.shift()
  if (!rows.length) throw new Error('The point list has a header but no design points.')
  if (rows.length > MAX_POINTS) throw new Error(`A setting-out sheet supports up to ${MAX_POINTS} points.`)

  const seen = new Set<string>()
  return rows.map((row, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1)
    if (row.length > 9) throw new Error(`Row ${rowNumber}: use no more than 9 columns.`)

    const pointId = (row[0] ?? '').trim()
    if (!pointId || pointId.length > 40 || /[\u0000-\u001f\u007f]/.test(pointId)) {
      throw new Error(`Row ${rowNumber}: enter a point ID of 1–40 printable characters.`)
    }
    const normalizedId = pointId.toLocaleLowerCase('en-US')
    if (seen.has(normalizedId)) throw new Error(`Row ${rowNumber}: point ID “${pointId}” is duplicated.`)
    seen.add(normalizedId)

    const bearing = (row[3] ?? '').trim()
    const distance = (row[4] ?? '').trim()
    const toleranceCheck = (row[7] ?? '').trim()
    const remarks = (row[8] ?? '').trim()
    if (bearing.length > 64 || distance.length > 32 || toleranceCheck.length > 40 || remarks.length > 200) {
      throw new Error(`Row ${rowNumber}: bearing, distance, entered check, or remarks exceed the allowed length.`)
    }
    if (distance && (!DECIMAL_NUMBER.test(distance) || !Number.isFinite(Number(distance)) || Number(distance) < 0)) {
      throw new Error(`Row ${rowNumber}: distance must be a non-negative number in metres when supplied.`)
    }
    const offsetE = readOptionalNumber(row[5], rowNumber, 'Offset easting')
    const offsetN = readOptionalNumber(row[6], rowNumber, 'Offset northing')

    return {
      pointId,
      designE: readRequiredNumber(row[1], rowNumber, 'Design easting'),
      designN: readRequiredNumber(row[2], rowNumber, 'Design northing'),
      ...(bearing ? { bearing } : {}),
      ...(distance ? { distance } : {}),
      ...(offsetE !== undefined ? { offsetE } : {}),
      ...(offsetN !== undefined ? { offsetN } : {}),
      ...(toleranceCheck ? { toleranceCheck } : {}),
      ...(remarks ? { remarks } : {}),
    }
  })
}
