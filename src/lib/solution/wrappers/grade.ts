import { gradient } from '@/lib/engine/distance'
import type { Solution } from '@/lib/solution/schema'
import { fullNumber } from '@/lib/solution/format'

export function gradeSolution(input: { elev1: number; elev2: number; horizontalDistance: number }): Solution {
  const riseFall = input.elev2 - input.elev1
  const g = gradient(riseFall, input.horizontalDistance)
  const ratio = riseFall === 0 ? Infinity : Math.abs(input.horizontalDistance / riseFall)

  return {
    version: 1,
    title: 'Grade / Slope',
    given: [
      { label: 'Elevation 1', value: `${fullNumber(input.elev1)} m` },
      { label: 'Elevation 2', value: `${fullNumber(input.elev2)} m` },
      { label: 'Horizontal distance (D)', value: `${fullNumber(input.horizontalDistance)} m` },
    ],
    toFind: ['Rise/Fall (ΔH)', 'Gradient (%)', 'Slope angle (θ)', 'Gradient ratio (1 : R)'],
    solution: [
      {
        title: 'Rise/Fall',
        formula: 'ΔH = H₂ − H₁',
        substitution: `ΔH = ${fullNumber(input.elev2)} − ${fullNumber(input.elev1)}`,
        computation: `ΔH = ${fullNumber(riseFall)} m`,
      },
      {
        title: 'Gradient (%)',
        formula: 'G% = (ΔH / D) × 100',
        substitution: `G% = (${fullNumber(riseFall)} / ${fullNumber(input.horizontalDistance)}) × 100`,
        computation: `G% = ${fullNumber(g.percentage)} %`,
        result: `${g.percentage.toFixed(2)} %`,
      },
      {
        title: 'Slope Angle',
        formula: 'θ = arctan(ΔH / D)',
        substitution: `θ = arctan(${fullNumber(riseFall)} / ${fullNumber(input.horizontalDistance)})`,
        computation: `θ = ${fullNumber(g.degrees)}°`,
        result: `${g.degrees.toFixed(2)}°`,
      },
      {
        title: 'Gradient Ratio',
        formula: 'R = D / |ΔH|  ⇒  Gradient ratio = 1 : R',
        substitution: `R = ${fullNumber(input.horizontalDistance)} / |${fullNumber(riseFall)}|`,
        computation: `R = ${isFinite(ratio) ? fullNumber(ratio) : '∞'}`,
        result: `1 : ${isFinite(ratio) ? ratio.toFixed(2) : '∞'}`,
      },
    ],
    check: [{ label: 'Sign convention', value: 'Positive ΔH = rising; negative ΔH = falling.' }],
    result: [
      { label: 'Rise/Fall (ΔH)', value: `${riseFall >= 0 ? '+' : ''}${riseFall.toFixed(4)} m` },
      { label: 'Gradient (%)', value: `${g.percentage.toFixed(2)} %` },
      { label: 'Slope angle', value: `${g.degrees.toFixed(2)}°` },
      { label: 'Gradient ratio', value: `1 : ${isFinite(ratio) ? ratio.toFixed(2) : '∞'}` },
    ],
  }
}

