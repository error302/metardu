// Formatting helpers and example data for the Cassini ↔ UTM converter.
//
// Extracted from src/app/tools/cassini-utm/page.tsx — pure functions,
// no React, no hooks, so this file does not need 'use client'.

export function r3(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(3)
}

export function r1(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(1)
}

export function r4(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(4)
}

/** Cassini example data for batch load (in FEET) */
export const CASSINI_BATCH_EXAMPLE = `SKP209,-130490.6,-348685.6
149S3,22492.0,-533392.5
SKP208,-132480.9,-514849.9`

/** UTM example data for batch load (in METRES) */
export const UTM_BATCH_EXAMPLE = `P1,237730.756,9893875.453
P2,284419.1,9837592.78
P3,237160.304,9843205.245`
