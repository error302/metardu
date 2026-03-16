import type { Solution } from '@/lib/solution/schema'
import { fullNumber } from '@/lib/solution/format'

export function twoPegTestSolution(input: {
  A1: number
  B1: number
  A2: number
  B2: number
  baselineMeters?: number
  allowableMmPer100m?: number
}): Solution {
  const baseline = input.baselineMeters ?? 100
  const allowable = input.allowableMmPer100m ?? 10

  const obsDiff1 = input.A1 - input.B1
  const obsDiff2 = input.A2 - input.B2
  const trueDiff = (obsDiff1 + obsDiff2) / 2
  const collimationError = (obsDiff1 - obsDiff2) / 2
  const collimationPer100m = collimationError * (100 / baseline)
  const pass = Math.abs(collimationPer100m * 1000) <= allowable

  return {
    version: 1,
    title: 'Two Peg Test (Collimation Error)',
    given: [
      { label: 'A1 (Pos. 1)', value: `${fullNumber(input.A1)} m` },
      { label: 'B1 (Pos. 1)', value: `${fullNumber(input.B1)} m` },
      { label: 'A2 (Pos. 2)', value: `${fullNumber(input.A2)} m` },
      { label: 'B2 (Pos. 2)', value: `${fullNumber(input.B2)} m` },
      { label: 'Baseline', value: `${fullNumber(baseline)} m` },
    ],
    toFind: ['True difference in level (A−B)', 'Collimation error', 'Error per 100 m', 'Pass/Fail'],
    solution: [
      {
        title: 'Observed Differences',
        formula: '(A − B) for each setup',
        computation: `Obs₁ = ${fullNumber(obsDiff1)} m,  Obs₂ = ${fullNumber(obsDiff2)} m`,
      },
      {
        title: 'True Difference (Average)',
        formula: 'True diff = (Obs₁ + Obs₂) / 2',
        substitution: `= (${fullNumber(obsDiff1)} + ${fullNumber(obsDiff2)}) / 2`,
        computation: `= ${fullNumber(trueDiff)} m`,
      },
      {
        title: 'Collimation Error',
        formula: 'Error = (Obs₁ − Obs₂) / 2',
        substitution: `= (${fullNumber(obsDiff1)} − ${fullNumber(obsDiff2)}) / 2`,
        computation: `= ${fullNumber(collimationError)} m`,
      },
      {
        title: 'Error per 100 m',
        formula: 'Error₁₀₀ = Error × (100 / baseline)',
        substitution: `= ${fullNumber(collimationError)} × (100 / ${fullNumber(baseline)})`,
        computation: `= ${fullNumber(collimationPer100m)} m per 100 m`,
        result: `${(collimationPer100m * 1000).toFixed(2)} mm/100m`,
      },
    ],
    check: [
      { label: 'Allowable (typical)', value: `±${allowable.toFixed(1)} mm per 100 m`, ok: pass },
      { label: 'Status', value: pass ? 'PASS' : 'FAIL', ok: pass },
    ],
    result: [
      { label: 'True difference (A−B)', value: `${trueDiff.toFixed(4)} m` },
      { label: 'Collimation error', value: `${(collimationError * 1000).toFixed(2)} mm` },
      { label: 'Error per 100 m', value: `${(collimationPer100m * 1000).toFixed(2)} mm/100m` },
      { label: 'Instrument status', value: pass ? 'PASS' : 'FAIL' },
    ],
  }
}

