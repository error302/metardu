import type { Solution } from '@/lib/solution/schema'
import { fullNumber } from '@/lib/solution/format'
import type { DMS } from '@/lib/engine/types'
import { dmsToDecimal } from '@/lib/engine/angles'

export function tacheometrySolution(input: {
  instrumentHeight: number
  upper: number
  middle: number
  lower: number
  verticalAngle: DMS
  K: number
  C: number
}): Solution {
  const verticalAngleDeg = dmsToDecimal(input.verticalAngle)
  const S = input.upper - input.lower
  const rad = (verticalAngleDeg * Math.PI) / 180
  const cos2 = Math.cos(rad) ** 2

  const horizontalDistance = input.K * S * cos2 + input.C
  const verticalDistance = 0.5 * input.K * S * Math.sin(2 * rad)
  const staffStationRL = input.instrumentHeight + verticalDistance - input.middle

  return {
    version: 1,
    title: 'Tacheometry Reduction',
    given: [
      { label: 'HI', value: `${fullNumber(input.instrumentHeight)} m` },
      { label: 'Upper staff', value: `${fullNumber(input.upper)} m` },
      { label: 'Middle staff', value: `${fullNumber(input.middle)} m` },
      { label: 'Lower staff', value: `${fullNumber(input.lower)} m` },
      { label: 'Vertical angle (θ)', value: `${fullNumber(verticalAngleDeg)}°` },
      { label: 'K', value: fullNumber(input.K) },
      { label: 'C', value: `${fullNumber(input.C)} m` },
    ],
    toFind: ['Staff intercept (S)', 'Horizontal distance (D)', 'Vertical component (V)', 'Staff station RL'],
    solution: [
      {
        title: 'Staff Intercept',
        formula: 'S = upper − lower',
        substitution: `S = ${fullNumber(input.upper)} − ${fullNumber(input.lower)}`,
        computation: `S = ${fullNumber(S)} m`,
      },
      {
        title: 'Horizontal Distance',
        formula: 'D = K×S×cos²(θ) + C',
        substitution: `D = ${fullNumber(input.K)}×${fullNumber(S)}×cos²(${fullNumber(verticalAngleDeg)}°) + ${fullNumber(input.C)}`,
        computation: `D = ${fullNumber(horizontalDistance)} m`,
        result: `${horizontalDistance.toFixed(4)} m`,
      },
      {
        title: 'Vertical Component',
        formula: 'V = (K×S×sin(2θ))/2',
        substitution: `V = ( ${fullNumber(input.K)}×${fullNumber(S)}×sin(2×${fullNumber(verticalAngleDeg)}°) ) / 2`,
        computation: `V = ${fullNumber(verticalDistance)} m`,
      },
      {
        title: 'Reduced Level (staff station)',
        formula: 'RL = HI + V − middle',
        substitution: `RL = ${fullNumber(input.instrumentHeight)} + ${fullNumber(verticalDistance)} − ${fullNumber(input.middle)}`,
        computation: `RL = ${fullNumber(staffStationRL)} m`,
        result: `${staffStationRL.toFixed(4)} m`,
      },
    ],
    check: [{ label: 'Cos²(θ)', value: fullNumber(cos2) }],
    result: [
      { label: 'Horizontal distance (D)', value: `${horizontalDistance.toFixed(4)} m` },
      { label: 'Vertical component (V)', value: `${verticalDistance.toFixed(4)} m` },
      { label: 'Staff station RL', value: `${staffStationRL.toFixed(4)} m` },
    ],
  }
}
