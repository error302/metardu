import { heightOfCollimation, riseAndFall } from '@/lib/engine/leveling'
import type { LevelingResult } from '@/lib/engine/types'

export type LevelBookComputation = { ok: false; errors: string[] } | { ok: true; calc: LevelingResult }
type Row = { station: string; bs: string; is: string; fs: string }

function number(text: string): number | undefined {
  const trimmed = text.trim()
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** Validate a working copy without coercing or changing its retained observation strings. */
export function computeLevelBook(input: { openingRL: string; closingRL: string; distanceKm: string;
  method: 'rise_and_fall' | 'height_of_collimation'; rows: Row[] }): LevelBookComputation {
  const errors: string[] = []
  const openingRL = number(input.openingRL)
  const closingRL = input.closingRL.trim() ? number(input.closingRL) : undefined
  const distanceKm = input.distanceKm.trim() ? number(input.distanceKm) : undefined
  if (openingRL === undefined) errors.push('Opening RL is required and must be a finite number.')
  if (input.closingRL.trim() && closingRL === undefined) errors.push('Closing RL must be a finite number.')
  if (input.distanceKm.trim() && (distanceKm === undefined || distanceKm <= 0)) errors.push('Run length must be a positive number, or blank if unknown.')
  if (!input.rows.length) errors.push('Add a leveling observation before calculation.')
  const names = new Set<string>()
  const readings = input.rows.map((row, index) => {
    const station = row.station.trim()
    if (!station) errors.push(`Row ${index + 1}: station name is required.`)
    const key = station.toUpperCase()
    if (station && names.has(key)) errors.push(`Duplicate station: ${station}`)
    names.add(key)
    const bs = number(row.bs), intermediate = number(row.is), fs = number(row.fs)
    for (const [label, text, value] of [['BS', row.bs, bs], ['IS', row.is, intermediate], ['FS', row.fs, fs]] as const) {
      if (text.trim() && value === undefined) errors.push(`${station || `Row ${index + 1}`}: ${label} must be a finite number.`)
    }
    if (![row.bs, row.is, row.fs].some(text => text.trim())) errors.push(`${station || `Row ${index + 1}`}: enter a BS, IS or FS reading.`)
    if (index === 0 && (bs === undefined || row.is.trim() || row.fs.trim())) errors.push('The first observation must be a backsight on the opening benchmark.')
    return { station, bs, is: intermediate, fs }
  })
  if (errors.length || openingRL === undefined) return { ok: false, errors }
  const calc = input.method === 'rise_and_fall'
    ? riseAndFall({ readings, openingRL, closingRL, distanceKm, method: input.method })
    : heightOfCollimation({ readings, openingRL, closingRL, distanceKm, method: input.method })
  if (calc.readings.some(reading => Object.values(reading).some(value => typeof value === 'number' && !Number.isFinite(value)))
    || !Number.isFinite(calc.misclosure) || calc.allowableMisclosure !== undefined && !Number.isFinite(calc.allowableMisclosure)) {
    return { ok: false, errors: ['The leveling calculation produced a non-finite result. Review the observation magnitudes.'] }
  }
  return { ok: true, calc }
}
