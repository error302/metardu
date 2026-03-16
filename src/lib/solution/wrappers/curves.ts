import { curveElements, curveStakeout } from '@/lib/engine/curves'
import type { Solution } from '@/lib/solution/schema'
import { formatDistanceMeters, fullNumber } from '@/lib/solution/format'

export function simpleCurveSolution(input: {
  radius: number
  deflectionDeg: number
  piChainage: number
  interval: number
}): { solution: Solution; stakeout: ReturnType<typeof curveStakeout> } {
  const stakeout = curveStakeout(input.piChainage, 0, input.radius, input.deflectionDeg, input.interval)
  const el = stakeout.elements

  return {
    stakeout,
    solution: {
      version: 1,
      title: 'Simple Circular Curve',
      given: [
        { label: 'Radius (R)', value: `${fullNumber(input.radius)} m` },
        { label: 'Deflection angle (Δ)', value: `${fullNumber(input.deflectionDeg)}°` },
        { label: 'PI chainage', value: `${fullNumber(input.piChainage)} m` },
        { label: 'Stake interval', value: `${fullNumber(input.interval)} m` },
      ],
      toFind: ['T, L, C, E, M', 'PC chainage', 'PT chainage', 'Stakeout table'],
      solution: [
        {
          title: 'Curve elements',
          formula: 'T = R·tan(Δ/2),  L = R·Δ (radians),  C = 2R·sin(Δ/2)',
          substitution: `R=${fullNumber(input.radius)}, Δ=${fullNumber(input.deflectionDeg)}°`,
          computation: `T=${fullNumber(el.tangentLength)} m, L=${fullNumber(el.arcLength)} m, C=${fullNumber(el.longChord)} m`,
        },
        {
          title: 'Mid-ordinate & external distance',
          formula: 'M = R·(1 − cos(Δ/2)),  E = R·(sec(Δ/2) − 1)',
          computation: `M=${fullNumber(el.midOrdinate)} m, E=${fullNumber(el.externalDistance)} m`,
        },
        {
          title: 'Key chainages',
          formula: 'PC = PI − T,  PT = PC + L',
          substitution: `PC = ${fullNumber(input.piChainage)} − ${fullNumber(el.tangentLength)},  PT = PC + ${fullNumber(el.arcLength)}`,
          computation: `PC=${fullNumber(stakeout.pcChainage)} m, PT=${fullNumber(stakeout.ptChainage)} m`,
          result: `PC ${stakeout.pcChainage.toFixed(3)} m; PT ${stakeout.ptChainage.toFixed(3)} m`,
        },
      ],
      check: [
        { label: 'Stake points', value: `${stakeout.points.length} point(s) generated (including PC/PT).` },
      ],
      result: [
        { label: 'Tangent (T)', value: formatDistanceMeters(el.tangentLength) },
        { label: 'Curve length (L)', value: formatDistanceMeters(el.arcLength) },
        { label: 'Long chord (C)', value: formatDistanceMeters(el.longChord) },
        { label: 'External (E)', value: formatDistanceMeters(el.externalDistance) },
        { label: 'Mid-ordinate (M)', value: formatDistanceMeters(el.midOrdinate) },
        { label: 'PC chainage', value: `${stakeout.pcChainage.toFixed(3)} m` },
        { label: 'PT chainage', value: `${stakeout.ptChainage.toFixed(3)} m` },
      ],
    },
  }
}

export function compoundCurveSolution(input: {
  R1: number
  R2: number
  delta1Deg: number
  delta2Deg: number
  junctionChainage: number
}): Solution {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const t1 = input.R1 * Math.tan(toRad(input.delta1Deg) / 2)
  const t2 = input.R2 * Math.tan(toRad(input.delta2Deg) / 2)
  const l1 = input.R1 * toRad(input.delta1Deg)
  const l2 = input.R2 * toRad(input.delta2Deg)

  const chainT1 = input.junctionChainage - t1
  const chainT2 = input.junctionChainage + t2

  return {
    version: 1,
    title: 'Compound Curve (Elements)',
    given: [
      { label: 'R1', value: `${fullNumber(input.R1)} m` },
      { label: 'R2', value: `${fullNumber(input.R2)} m` },
      { label: 'Δ1', value: `${fullNumber(input.delta1Deg)}°` },
      { label: 'Δ2', value: `${fullNumber(input.delta2Deg)}°` },
      { label: 'Junction chainage (J)', value: `${fullNumber(input.junctionChainage)} m` },
    ],
    toFind: ['t1, t2', 'l1, l2', 'T1, T2 chainages'],
    solution: [
      {
        title: 'Tangents',
        formula: 't = R·tan(Δ/2)',
        computation: `t1=${fullNumber(t1)} m, t2=${fullNumber(t2)} m`,
      },
      {
        title: 'Arc lengths',
        formula: 'l = R·Δ (radians)',
        computation: `l1=${fullNumber(l1)} m, l2=${fullNumber(l2)} m`,
      },
      {
        title: 'Key chainages',
        formula: 'T1 = J − t1,  T2 = J + t2',
        computation: `T1=${fullNumber(chainT1)} m, T2=${fullNumber(chainT2)} m`,
      },
    ],
    result: [
      { label: 't1', value: `${t1.toFixed(4)} m` },
      { label: 't2', value: `${t2.toFixed(4)} m` },
      { label: 'l1', value: `${l1.toFixed(4)} m` },
      { label: 'l2', value: `${l2.toFixed(4)} m` },
      { label: 'Total curve length', value: `${(l1 + l2).toFixed(4)} m` },
      { label: 'T1 chainage', value: `${chainT1.toFixed(3)} m` },
      { label: 'T2 chainage', value: `${chainT2.toFixed(3)} m` },
    ],
  }
}

export function reverseCurveSolution(input: { R1: number; R2: number; AB: number }): Solution {
  const diff = input.R2 - input.R1
  const commonTangent = Math.sqrt(Math.max(0, input.AB * input.AB - diff * diff))
  const totalLength = Math.PI * input.R1 + Math.PI * input.R2

  return {
    version: 1,
    title: 'Reverse Curve (Approx. Elements)',
    given: [
      { label: 'R1', value: `${fullNumber(input.R1)} m` },
      { label: 'R2', value: `${fullNumber(input.R2)} m` },
      { label: 'AB', value: `${fullNumber(input.AB)} m` },
    ],
    toFind: ['Common tangent length', 'Total length (approx.)'],
    solution: [
      {
        title: 'Common Tangent',
        formula: 'T = √(AB² − (R2 − R1)²)',
        substitution: `T = √(${fullNumber(input.AB)}² − (${fullNumber(input.R2)} − ${fullNumber(input.R1)})²)`,
        computation: `T = ${fullNumber(commonTangent)} m`,
      },
      {
        title: 'Total length (approx.)',
        formula: 'L ≈ πR1 + πR2',
        computation: `L = ${fullNumber(totalLength)} m`,
        result: `${totalLength.toFixed(4)} m`,
      },
    ],
    result: [
      { label: 'Common tangent', value: `${commonTangent.toFixed(4)} m` },
      { label: 'Total length', value: `${totalLength.toFixed(4)} m` },
    ],
  }
}

