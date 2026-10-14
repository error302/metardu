import Papa from 'papaparse'

export interface FieldPointEntry {
  name: string
  easting: number
  northing: number
  elevation: number | null
  is_control: boolean
}
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
export function fieldPointNumber(value: string, label: string): number {
  const text = value.trim()
  if (!DECIMAL.test(text) || !Number.isFinite(Number(text))) throw new Error(`${label} must be a finite decimal number.`)
  return Number(text)
}
export function fieldPointEntry(name: string, easting: string, northing: string, elevation: string, isControl = false): FieldPointEntry {
  if (!name.trim() || name.trim().length > 100) throw new Error('Point name must contain 1–100 characters.')
  return { name: name.trim(), easting: fieldPointNumber(easting, 'Easting'), northing: fieldPointNumber(northing, 'Northing'), elevation: elevation.trim() ? fieldPointNumber(elevation, 'Elevation') : null, is_control: isControl }
}
/** Raw coordinates only: no inferred CRS, transformation, or geographic range. */
export function parseFieldPointCsv(csv: string): FieldPointEntry[] {
  if (!csv.trim()) throw new Error('Enter point CSV before parsing.')
  if (csv.length > 1_000_000) throw new Error('Point CSV exceeds the 1 MB text limit.')
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', dynamicTyping: false })
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`)
  if (parsed.data.length > 1000) throw new Error('Enter at most 1000 points per batch.')
  const names = new Set<string>()
  return parsed.data.map((row, index) => {
    try {
      if (row.length < 3 || row.length > 4) throw new Error('Expected Name, Easting, Northing and optional Elevation.')
      const point = fieldPointEntry(row[0], row[1], row[2], row[3] ?? '')
      if (names.has(point.name)) throw new Error(`Duplicate point name: ${point.name}`)
      names.add(point.name)
      return point
    } catch (error) { throw new Error(`Row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`) }
  })
}
