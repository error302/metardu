import type { ForwardTraverseResult } from '@/lib/engine/traverse'
import type { Point3D, TraverseResult } from '@/lib/engine/types'
import type { LevelBookComputation } from './computeLevelBook'

type Invalid = { ok: false; errors: string[] }
export type BookQualityInput =
  | { type: 'leveling'; computed: LevelBookComputation }
  | { type: 'traverse'; computed: Invalid | { ok: true; mode: 'open'; raw: ForwardTraverseResult } | { ok: true; mode: 'closed' | 'link'; adjusted: TraverseResult } }
  | { type: 'control'; computed: Invalid | { ok: true; rows: Array<{ computed: Point3D | null }> } }

export type BookQualitySummary = { type: BookQualityInput['type']; metrics: Array<{ label: string; value: string }>;
  messages: string[]; needsInput: boolean }

const meters = (value: number) => Number.isFinite(value) ? `${value.toFixed(4)} m` : 'Not evaluated'

/** Present the active engine result only; no second closure computation or inferred project acceptance. */
export function summarizeBookQuality(input: BookQualityInput): BookQualitySummary {
  const result = input.computed
  const summary: BookQualitySummary = { type: input.type, metrics: [], messages: [], needsInput: false }
  if (!result.ok) return { ...summary, needsInput: true, messages: result.errors }
  if (input.type === 'leveling' && input.computed.ok) {
    const calc = input.computed.calc
    const hasForwardSight = calc.readings.slice(1).some(row => row.is !== undefined || row.fs !== undefined)
    summary.metrics = [
      { label: 'Arithmetic identity', value: hasForwardSight ? calc.arithmeticCheck ? 'Consistent' : 'Inconsistent' : 'Forward sight required' },
      { label: 'Misclosure', value: !hasForwardSight ? 'Forward sight required' : calc.closingRLProvided ? meters(calc.misclosure) : 'Closing RL required' },
      { label: 'Engine tolerance (10√K mm)', value: calc.allowableMisclosure === undefined ? 'Run length required' : `±${meters(calc.allowableMisclosure)}` },
    ]
    summary.needsInput = !hasForwardSight || !calc.closingRLProvided || calc.allowableMisclosure === undefined
    summary.messages = ['Engine tolerance is a calculation reference. Confirm the adopted project criterion before acceptance.']
  } else if (input.type === 'traverse' && input.computed.ok) {
    if (input.computed.mode === 'open') {
      summary.metrics = [{ label: 'Measured length', value: meters(input.computed.raw.totalDistance) }]
      summary.messages = ['Open traverse · closure not assessed. Supply a declared closing target to assess closure.']
      summary.needsInput = true
    } else {
      const adjusted = input.computed.adjusted
      const hasData = adjusted.legs.length > 0 && adjusted.totalDistance > 0
        && [adjusted.totalDistance, adjusted.linearError, adjusted.closingErrorE, adjusted.closingErrorN].every(Number.isFinite)
      if (!hasData) return { ...summary, needsInput: true, messages: ['Complete finite traverse observations and the closing target before assessing closure.'] }
      summary.metrics = [
        { label: 'Linear misclosure', value: meters(adjusted.linearError) },
        { label: 'Precision ratio', value: Number.isFinite(adjusted.precisionRatio) && adjusted.precisionRatio > 0 ? `1:${Math.round(adjusted.precisionRatio).toLocaleString()}` : adjusted.linearError === 0 ? 'Zero computed closure' : 'Not evaluated' },
        { label: 'Closing error E', value: meters(adjusted.closingErrorE) },
        { label: 'Closing error N', value: meters(adjusted.closingErrorN) },
      ]
      summary.messages = ['Closure compares the entered observations with the declared target. Project tolerance adoption and independent field checks remain required.']
    }
  } else if (input.type === 'control' && input.computed.ok) {
    const rows = input.computed.rows
    const complete = rows.length > 0 && rows.every(row => row.computed !== null
      && [row.computed.easting, row.computed.northing, row.computed.elevation].every(Number.isFinite))
    summary.needsInput = !complete
    summary.metrics = complete ? [{ label: 'Calculated points (active setup)', value: String(rows.length) }] : []
    summary.messages = [complete ? 'Polar coordinates calculated. Independent check observations and project tolerances are required for acceptance.' : 'Complete the control setup and observations before calculation.']
  }
  return summary
}
