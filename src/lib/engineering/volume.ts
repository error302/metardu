import { crossSectionVolume as computeCrossSectionVolume, superelevationCalc as computeSuperelevation,
  type SuperelevationInput, type SuperelevationResult } from './compute'

export type { SuperelevationInput, SuperelevationResult } from './compute'
export type SuperelevationCalcResult = SuperelevationResult

export interface CrossSection {
  station: number
  offsetLeft: number
  offsetRight: number
  cutDepth: number
  fillDepth: number
  area?: number
}

export interface VolumeInput {
  areas: number[]
  stationInterval: number
  method: 'prismoidal' | 'end-area'
}

export interface VolumeResult {
  totalCutVolume: number
  totalFillVolume: number
  netVolume: number
  volumesByStation: number[]
  method: string
}

export function calculateVolumes(input: VolumeInput): VolumeResult {
  const result = computeCrossSectionVolume(input)
  return {
    totalCutVolume: result.totalCut,
    totalFillVolume: result.totalFill,
    netVolume: result.netVolume,
    volumesByStation: result.volumeTable.slice(1).map(row => row.cutVolume - row.fillVolume),
    method: result.method,
  }
}

export function crossSectionVolume(input: {
  areas: number[]
  stationInterval: number
  method: 'prismoidal' | 'end-area'
}): VolumeResult {
  return calculateVolumes(input)
}

/** Historical entry points share the strict declared-criteria contract.
 * No BVC/EVC, spiral lengths or absolute station origin can be inferred here.
 */
export function calculateSuperelevation(input: SuperelevationInput): SuperelevationCalcResult {
  return computeSuperelevation(input)
}

export function superelevationCalc(input: SuperelevationInput): SuperelevationCalcResult {
  return computeSuperelevation(input)
}

export function massHaulDiagram(input: {
  cumulativeVolumes: number[]
  stationInterval: number
}): {
  stations: number[]
  cumulativeVolumes: number[]
  balancePoints: number[]
  hauls: Array<{ from: number; to: number; volume: number }>
} {
  const { cumulativeVolumes, stationInterval } = input

  const stations = cumulativeVolumes.map((_, i) => i * stationInterval)
  const balancePoints: number[] = []
  const hauls: Array<{ from: number; to: number; volume: number }> = []

  for (let i = 1; i < cumulativeVolumes.length; i++) {
    if (cumulativeVolumes[i - 1] <= 0 && cumulativeVolumes[i] > 0) {
      balancePoints.push(stations[i])
    }
  }

  let currentHaul: { from: number; to: number; volume: number } | null = null

  for (let i = 0; i < cumulativeVolumes.length; i++) {
    const vol = cumulativeVolumes[i]

    if (vol < 0 && !currentHaul) {
      currentHaul = { from: stations[i], to: 0, volume: Math.abs(vol) }
    } else if (currentHaul && vol >= 0) {
      currentHaul.to = stations[i]
      hauls.push(currentHaul)
      currentHaul = null
    }
  }

  if (currentHaul) {
    hauls.push(currentHaul)
  }

  return {
    stations,
    cumulativeVolumes,
    balancePoints,
    hauls
  }
}

export function massHaulDiagramWrapper(input: {
  cumulativeVolumes: number[]
  stationInterval: number
}) {
  return massHaulDiagram(input)
}
