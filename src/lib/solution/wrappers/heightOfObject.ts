import { dmsToDecimal } from '@/lib/engine/angles'
import type { DMS } from '@/lib/engine/types'
import type { Solution } from '@/lib/solution/schema'
import { fullNumber } from '@/lib/solution/format'

export function heightOfObjectSolution(input: {
  horizontalDistance: number
  angleTop: DMS
  angleBase: DMS
  instrumentHeight: number
}): Solution {
  const alpha = dmsToDecimal(input.angleTop)
  const beta = dmsToDecimal(input.angleBase)
  const alphaRad = (alpha * Math.PI) / 180
  const betaRad = (beta * Math.PI) / 180

  const heightFromHI = input.horizontalDistance * (Math.tan(alphaRad) - Math.tan(betaRad))
  const totalHeight = heightFromHI + input.instrumentHeight

  return {
    version: 1,
    title: 'Height of Object (Trigonometric Leveling)',
    given: [
      { label: 'Horizontal distance (D)', value: `${fullNumber(input.horizontalDistance)} m` },
      { label: 'Angle to top (α)', value: `${fullNumber(alpha)}°` },
      { label: 'Angle to base (β)', value: `${fullNumber(beta)}°` },
      { label: 'Instrument height (HI)', value: `${fullNumber(input.instrumentHeight)} m` },
    ],
    toFind: ['Height above instrument line', 'Total object height'],
    solution: [
      {
        title: 'Height from HI',
        formula: 'h = D × (tan(α) − tan(β))',
        substitution: `h = ${fullNumber(input.horizontalDistance)} × (tan(${fullNumber(alpha)}°) − tan(${fullNumber(beta)}°))`,
        computation: `h = ${fullNumber(heightFromHI)} m`,
      },
      {
        title: 'Total Height',
        formula: 'H = h + HI',
        substitution: `H = ${fullNumber(heightFromHI)} + ${fullNumber(input.instrumentHeight)}`,
        computation: `H = ${fullNumber(totalHeight)} m`,
        result: `${totalHeight.toFixed(4)} m`,
      },
    ],
    check: [{ label: 'Field check', value: 'Ensure D is horizontal distance (not slope distance).' }],
    result: [
      { label: 'Height above HI', value: `${heightFromHI.toFixed(4)} m` },
      { label: 'Total height', value: `${totalHeight.toFixed(4)} m` },
    ],
  }
}

