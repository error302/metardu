import { crossSectionVolume as computeCrossSectionVolume } from './compute'

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

export interface SuperelevationInput {
  R: number
  V: number
  eMax: number
}

export interface SuperelevationResult {
  eRequired: number
  eRequiredPercent: number
  minTransitionLength: number
  tangentialRunout: number
  totalTransition: number
}

export interface SuperelevationCalcResult extends SuperelevationResult {
  A: number
  L1: number
  L2: number
  BVC: number
  EVC: number
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

export function calculateSuperelevation(input: SuperelevationInput): SuperelevationCalcResult {
  const { R, V, eMax } = input

  const eRequired = (V * V) / (225 * R) - 0.01
  const eRequiredPercent = eRequired * 100

  const minTransitionLength = Math.max(0.6 * (V * V) / R, 30)
  const tangentialRunout = (eMax * V * 1000) / (47 * 3.6)
  const totalTransition = minTransitionLength + tangentialRunout

  const L1 = minTransitionLength
  const L2 = minTransitionLength
  const A = Math.sqrt(minTransitionLength * R)
  const BVC = 0
  const EVC = L1 + L2

  return {
    eRequired,
    eRequiredPercent,
    minTransitionLength,
    tangentialRunout,
    totalTransition,
    A,
    L1,
    L2,
    BVC,
    EVC
  }
}

export function superelevationCalc(input: SuperelevationInput): SuperelevationCalcResult {
  return calculateSuperelevation(input)
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
