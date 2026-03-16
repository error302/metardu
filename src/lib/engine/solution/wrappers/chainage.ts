import { computeChainageTable, reverseChainageLinear, type ChainageRow } from '@/lib/engine/chainage'
import { createSolutionV1, type Solution } from '@/lib/engine/solution/solutionBuilder'
import { fullNumber } from '@/lib/solution/format'

export type AlignmentPoint = { name: string; easting: number; northing: number }

export { computeChainageTable }
export type { ChainageRow }

export function chainageTableSolution(input: {
  startChainage: number
  start: { easting: number; northing: number }
  alignmentCount: number
  table: ChainageRow[]
}): Solution {
  const end = input.table[input.table.length - 1]
  return createSolutionV1({
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
  })
}

export function reverseChainageSolution(input: {
  targetChainage: number
  table: ChainageRow[]
}): { point: { easting: number; northing: number } | null; solution: Solution } {
  const point = reverseChainageLinear({ targetChainage: input.targetChainage, table: input.table })
  if (!point) {
    return {
      point: null,
      solution: createSolutionV1({
        title: 'Reverse Chainage',
        given: [{ label: 'Target chainage', value: `${fullNumber(input.targetChainage)} m` }],
        toFind: ['Easting, Northing'],
        solution: [{ formula: 'Target not within alignment chainage range', computation: 'No segment found.' }],
        result: [{ label: 'Coordinates', value: '—' }],
      }),
    }
  }

  return {
    point,
    solution: createSolutionV1({
      title: 'Reverse Chainage (Linear Interpolation)',
      given: [{ label: 'Target chainage', value: `${fullNumber(input.targetChainage)} m` }],
      toFind: ['Easting, Northing at target chainage'],
      solution: [
        {
          formula: 'Interpolate within the chainage segment containing the target chainage',
          computation: `E = ${fullNumber(point.easting)} m, N = ${fullNumber(point.northing)} m`,
          result: `E ${point.easting.toFixed(4)} m; N ${point.northing.toFixed(4)} m`,
        },
      ],
      result: [
        { label: 'Easting', value: `${point.easting.toFixed(4)} m` },
        { label: 'Northing', value: `${point.northing.toFixed(4)} m` },
      ],
    }),
  }
}

