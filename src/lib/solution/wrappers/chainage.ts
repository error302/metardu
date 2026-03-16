import { distanceBearing } from '@/lib/engine/distance'
import type { Solution } from '@/lib/solution/schema'
import { fullNumber } from '@/lib/solution/format'

export type AlignmentPoint = { name: string; easting: number; northing: number }

export type ChainageRow = {
  pointName: string
  easting: number
  northing: number
  chainage: number
  distance: number
}

export function computeChainageTable(input: {
  start: { easting: number; northing: number }
  startChainage: number
  alignment: AlignmentPoint[]
}): ChainageRow[] {
  const rows: ChainageRow[] = []
  let total = input.startChainage
  let prev = { easting: input.start.easting, northing: input.start.northing }

  rows.push({
    pointName: 'START',
    easting: prev.easting,
    northing: prev.northing,
    chainage: total,
    distance: 0,
  })

  for (const p of input.alignment) {
    const dist = distanceBearing(prev, { easting: p.easting, northing: p.northing }).distance
    total += dist
    rows.push({
      pointName: p.name,
      easting: p.easting,
      northing: p.northing,
      chainage: total,
      distance: dist,
    })
    prev = { easting: p.easting, northing: p.northing }
  }

  return rows
}

export function reverseChainageSolution(input: {
  targetChainage: number
  table: ChainageRow[]
}): { point: { easting: number; northing: number } | null; solution: Solution } {
  const rows = input.table
  if (rows.length < 2) {
    return {
      point: null,
      solution: {
        version: 1,
        title: 'Reverse Chainage',
        given: [{ label: 'Target chainage', value: `${fullNumber(input.targetChainage)} m` }],
        toFind: ['Easting, Northing'],
        solution: [{ formula: 'Insufficient alignment points', computation: 'Need at least 2 points.' }],
        result: [{ label: 'Coordinates', value: '—' }],
      },
    }
  }

  const target = input.targetChainage
  const startCh = rows[0].chainage

  // Find segment containing target
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (target < Math.min(a.chainage, b.chainage) || target > Math.max(a.chainage, b.chainage)) continue

    const segLen = b.chainage - a.chainage
    const t = segLen !== 0 ? (target - a.chainage) / segLen : 0

    const e = a.easting + t * (b.easting - a.easting)
    const n = a.northing + t * (b.northing - a.northing)

    return {
      point: { easting: e, northing: n },
      solution: {
        version: 1,
        title: 'Reverse Chainage (Linear Interpolation)',
        given: [
          { label: 'Target chainage', value: `${fullNumber(target)} m` },
          { label: 'Segment start', value: `${a.pointName} @ ${fullNumber(a.chainage)} m` },
          { label: 'Segment end', value: `${b.pointName} @ ${fullNumber(b.chainage)} m` },
        ],
        toFind: ['Easting, Northing at target chainage'],
        solution: [
          {
            title: 'Interpolation ratio',
            formula: 't = (Ch − Ch₁) / (Ch₂ − Ch₁)',
            substitution: `t = (${fullNumber(target)} − ${fullNumber(a.chainage)}) / (${fullNumber(b.chainage)} − ${fullNumber(a.chainage)})`,
            computation: `t = ${fullNumber(t)}`,
          },
          {
            title: 'Coordinates',
            formula: 'E = E₁ + t(E₂ − E₁),  N = N₁ + t(N₂ − N₁)',
            substitution: `E = ${fullNumber(a.easting)} + t(${fullNumber(b.easting)} − ${fullNumber(a.easting)}), N = ${fullNumber(a.northing)} + t(${fullNumber(b.northing)} − ${fullNumber(a.northing)})`,
            computation: `E = ${fullNumber(e)} m, N = ${fullNumber(n)} m`,
            result: `E ${e.toFixed(4)} m; N ${n.toFixed(4)} m`,
          },
        ],
        check: [
          {
            label: 'Target within alignment',
            value: target >= startCh && target <= rows[rows.length - 1].chainage ? 'Yes' : 'No',
            ok: target >= startCh && target <= rows[rows.length - 1].chainage,
          },
        ],
        result: [
          { label: 'Easting', value: `${e.toFixed(4)} m` },
          { label: 'Northing', value: `${n.toFixed(4)} m` },
        ],
      },
    }
  }

  return {
    point: null,
    solution: {
      version: 1,
      title: 'Reverse Chainage',
      given: [{ label: 'Target chainage', value: `${fullNumber(target)} m` }],
      toFind: ['Easting, Northing'],
      solution: [{ formula: 'Target not within alignment chainage range', computation: 'No segment found.' }],
      result: [{ label: 'Coordinates', value: '—' }],
    },
  }
}

export function chainageTableSolution(input: {
  startChainage: number
  start: { easting: number; northing: number }
  alignmentCount: number
  table: ChainageRow[]
}): Solution {
  const end = input.table[input.table.length - 1]
  return {
    version: 1,
    title: 'Chainage Computation',
    given: [
      { label: 'Start (E, N)', value: `(${fullNumber(input.start.easting)}, ${fullNumber(input.start.northing)}) m` },
      { label: 'Start chainage', value: `${fullNumber(input.startChainage)} m` },
      { label: 'Alignment points', value: `${input.alignmentCount}` },
    ],
    toFind: ['Cumulative chainage at each point'],
    solution: [
      {
        title: 'Incremental chainage',
        formula: 'Chᵢ = Chᵢ₋₁ + Dᵢ₋₁→ᵢ',
        substitution: 'Distance D computed from consecutive coordinates',
        computation: `End chainage = ${fullNumber(end.chainage)} m`,
        result: `${end.chainage.toFixed(3)} m`,
      },
    ],
    check: [{ label: 'Rows computed', value: `${input.table.length} row(s)`, ok: input.table.length >= 2 }],
    result: [
      { label: 'End chainage', value: `${end.chainage.toFixed(3)} m` },
      { label: 'End point', value: end.pointName },
    ],
  }
}

