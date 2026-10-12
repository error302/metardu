import Papa from 'papaparse'
import type { StakeoutPoint } from './stakeoutCutSheet'

export const STAKEOUT_CSV_HEADER = 'point_id,design_e,design_n,design_z,staked_e,staked_n,staked_z,observed_at,notes,accuracy_m'

/** Preserve missing optional evidence and reject incomplete measured coordinates. */
export function parseStakeoutCsv(text: string): StakeoutPoint[] {
  if (text.length > 2_000_000) throw new RangeError('CSV exceeds the 2 MB cut-sheet import limit.')
  const first = Papa.parse<string[]>(text, { preview: 1 })
  const headers = (first.data[0] ?? []).map(field => field.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) throw new RangeError('CSV contains duplicate column names.')
  const required = ['point_id', 'design_e', 'design_n', 'design_z', 'staked_e', 'staked_n', 'staked_z']
  if (required.some(field => !headers.includes(field))) throw new RangeError(`CSV requires columns: ${required.join(', ')}.`)
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: 'greedy', transformHeader: field => field.trim().toLowerCase(),
  })
  if (parsed.errors.length) throw new RangeError(`CSV could not be read: ${parsed.errors[0].message}`)
  if (!parsed.data.length || parsed.data.length > 10000) throw new RangeError('CSV must contain 1 to 10,000 observation rows.')
  const labels = new Set<string>()
  return parsed.data.map((row, index) => {
    const line = index + 2
    const pointId = row.point_id.trim()
    if (!pointId) throw new RangeError(`CSV row ${line}: point_id is required.`)
    if (labels.has(pointId)) throw new RangeError(`CSV row ${line}: duplicate point_id ${pointId}.`)
    labels.add(pointId)
    function number(field: string, required: boolean): number | undefined {
      const value = row[field]?.trim() ?? ''
      if (!value && !required) return undefined
      const parsedValue = Number(value)
      if (!value || !Number.isFinite(parsedValue)) throw new RangeError(`CSV row ${line}: ${field} must be a finite number.`)
      return parsedValue
    }
    const accuracyM = number('accuracy_m', false)
    if (accuracyM !== undefined && accuracyM < 0) throw new RangeError(`CSV row ${line}: accuracy_m cannot be negative.`)
    const timestamp = row.observed_at?.trim() ?? ''
    if (timestamp && !Number.isFinite(Date.parse(timestamp))) throw new RangeError(`CSV row ${line}: observed_at must be a valid date/time.`)
    return {
      pointId,
      design: { easting: number('design_e', true)!, northing: number('design_n', true)!, elevation: number('design_z', false) },
      staked: { easting: number('staked_e', true)!, northing: number('staked_n', true)!, elevation: number('staked_z', false) },
      timestamp, notes: row.notes?.trim() || undefined, accuracyM,
    }
  })
}
