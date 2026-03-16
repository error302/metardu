import { backBearing, distanceBearing } from '@/lib/engine/distance'
import { bearingToString, wcbToQuadrant } from '@/lib/engine/angles'
import type { Solution } from '@/lib/solution/schema'
import { formatBearingWcbDms, formatDeltaMeters, fullNumber } from '@/lib/solution/format'

export function bearingSolutionFromCoords(input: { e1: number; n1: number; e2: number; n2: number }): Solution {
  const r = distanceBearing({ easting: input.e1, northing: input.n1 }, { easting: input.e2, northing: input.n2 })
  const back = backBearing(r.bearing)

  return {
    version: 1,
    title: 'Bearing (Whole Circle Bearing)',
    given: [
      { label: 'Point A (E, N)', value: `(${fullNumber(input.e1)}, ${fullNumber(input.n1)}) m` },
      { label: 'Point B (E, N)', value: `(${fullNumber(input.e2)}, ${fullNumber(input.n2)}) m` },
    ],
    toFind: ['Forward bearing θ_AB (WCB)', 'Back bearing θ_BA (WCB)', 'Quadrant'],
    solution: [
      {
        title: 'Coordinate Differences',
        formula: 'ΔE = E₂ − E₁,  ΔN = N₂ − N₁',
        substitution: `ΔE = ${fullNumber(input.e2)} − ${fullNumber(input.e1)},  ΔN = ${fullNumber(input.n2)} − ${fullNumber(input.n1)}`,
        computation: `ΔE = ${fullNumber(r.deltaE)} m,  ΔN = ${fullNumber(r.deltaN)} m`,
      },
      {
        title: 'Forward Bearing',
        formula: 'θ = atan2(ΔE, ΔN) (WCB from North, clockwise)',
        substitution: `θ = atan2(${fullNumber(r.deltaE)}, ${fullNumber(r.deltaN)})`,
        computation: `θ_AB = ${fullNumber(r.bearing)}°`,
        result: formatBearingWcbDms(r.bearing),
      },
      {
        title: 'Back Bearing',
        formula: 'θ_BA = θ_AB ± 180° (normalize 0–360)',
        substitution: `θ_BA = ${fullNumber(r.bearing)}° + 180°`,
        computation: `θ_BA = ${fullNumber(back)}°`,
        result: formatBearingWcbDms(back),
      },
    ],
    check: [{ label: 'Quadrant', value: r.quadrant }],
    result: [
      { label: 'Forward bearing (WCB)', value: r.bearingDMS },
      { label: 'Back bearing (WCB)', value: bearingToString(back) },
      { label: 'Quadrant', value: r.quadrant },
      { label: 'ΔE', value: formatDeltaMeters(r.deltaE) },
      { label: 'ΔN', value: formatDeltaMeters(r.deltaN) },
    ],
  }
}

export function backBearingSolution(input: { forwardBearingDeg: number }): Solution {
  const fb = input.forwardBearingDeg
  const back = backBearing(fb)

  return {
    version: 1,
    title: 'Back Bearing',
    given: [{ label: 'Forward bearing (WCB)', value: bearingToString(fb) }],
    toFind: ['Back bearing (WCB)'],
    solution: [
      {
        formula: 'θ_back = θ_forward ± 180° (normalize 0–360)',
        substitution: `θ_back = ${fullNumber(fb)}° + 180°`,
        computation: `θ_back = ${fullNumber(back)}°`,
        result: formatBearingWcbDms(back),
      },
    ],
    check: [{ label: 'Quadrant', value: wcbToQuadrant(fb) }],
    result: [
      { label: 'Forward bearing (WCB)', value: bearingToString(fb) },
      { label: 'Back bearing (WCB)', value: bearingToString(back) },
    ],
  }
}

