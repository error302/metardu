export interface MiningSection {
  station: number
  leftOffset: number
  rightOffset: number
  depth: number
  area?: number
}

export interface GridPoint {
  easting: number
  northing: number
  groundElevation: number
  designElevation?: number
}

export interface VolumeResult {
  cutVolumeM3: number
  fillVolumeM3: number
  netVolumeM3: number
  cutTonnage: number
  fillTonnage: number
  netTonnage: number
  method: 'end-area' | 'grid'
  materialDensity: number
}

export interface EndAreaResult extends VolumeResult {
  sections: MiningSection[]
  cumulativeVolumes: number[]
}

export interface GridResult extends VolumeResult {
  gridPoints: GridPoint[]
  cutAreaM2: number
  fillAreaM2: number
}

export function calculateEndAreaVolumes(
  sections: MiningSection[],
  stationInterval: number,
  materialDensity: number = 1.8
): EndAreaResult {
  if (sections.length < 2) {
    throw new Error('At least 2 sections required for volume calculation')
  }

  const sortedSections = [...sections].sort((a, b) => a.station - b.station)
  
  const areas = sortedSections.map(sec => {
    const width = sec.rightOffset - sec.leftOffset
    sec.area = Math.abs(width * sec.depth)
    return sec.area
  })

  let cutVolume = 0
  let fillVolume = 0
  const cumulativeVolumes: number[] = []

  for (let i = 1; i < sortedSections.length; i++) {
    const a1 = areas[i - 1]
    const a2 = areas[i]
    const d = stationInterval

    const segmentVolume = ((a1 + a2) / 2) * d

    if (sortedSections[i].depth > sortedSections[i - 1].depth) {
      cutVolume += segmentVolume
    } else if (sortedSections[i].depth < sortedSections[i - 1].depth) {
      fillVolume += segmentVolume
    }

    cumulativeVolumes.push(cutVolume - fillVolume)
  }

  return {
    cutVolumeM3: cutVolume,
    fillVolumeM3: fillVolume,
    netVolumeM3: cutVolume - fillVolume,
    cutTonnage: cutVolume * materialDensity,
    fillTonnage: fillVolume * materialDensity,
    netTonnage: (cutVolume - fillVolume) * materialDensity,
    method: 'end-area',
    materialDensity,
    sections: sortedSections,
    cumulativeVolumes
  }
}

export function calculateGridVolumes(
  gridPoints: GridPoint[],
  gridSpacing: number,
  designElevation: number,
  materialDensity: number = 1.8
): GridResult {
  if (gridPoints.length === 0) {
    throw new Error('At least 1 grid point required')
  }

  let cutVolume = 0
  let fillVolume = 0
  let cutArea = 0
  let fillArea = 0

  for (const point of gridPoints) {
    const diff = designElevation - point.groundElevation
    const cellArea = gridSpacing * gridSpacing

    if (diff > 0) {
      cutVolume += diff * cellArea
      cutArea += cellArea
    } else if (diff < 0) {
      fillVolume += Math.abs(diff) * cellArea
      fillArea += cellArea
    }
  }

  return {
    cutVolumeM3: cutVolume,
    fillVolumeM3: fillVolume,
    netVolumeM3: cutVolume - fillVolume,
    cutTonnage: cutVolume * materialDensity,
    fillTonnage: fillVolume * materialDensity,
    netTonnage: (cutVolume - fillVolume) * materialDensity,
    method: 'grid',
    materialDensity,
    gridPoints,
    cutAreaM2: cutArea,
    fillAreaM2: fillArea
  }
}

export function generateMiningReport(
  result: VolumeResult,
  projectData?: {
    lrNumber?: string
    county?: string
    mineType?: string
  }
): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                    MINING VOLUME REPORT',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Project: ${projectData?.lrNumber || 'N/A'}`,
    `County: ${projectData?.county || 'N/A'}`,
    `Mine Type: ${projectData?.mineType || 'Open Pit'}`,
    `Calculation Method: ${result.method === 'end-area' ? 'End-Area' : 'Grid'}'`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                      VOLUME SUMMARY',
    '───────────────────────────────────────────────────────────────',
    `Cut Volume:     ${result.cutVolumeM3.toLocaleString()} m³`,
    `Fill Volume:    ${result.fillVolumeM3.toLocaleString()} m³`,
    `Net Volume:     ${result.netVolumeM3.toLocaleString()} m³`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                      TONNAGE SUMMARY',
    '───────────────────────────────────────────────────────────────',
    `Material Density: ${result.materialDensity} t/m³`,
    `Cut Tonnage:      ${result.cutTonnage.toLocaleString()} tonnes`,
    `Fill Tonnage:     ${result.fillTonnage.toLocaleString()} tonnes`,
    `Net Tonnage:      ${result.netTonnage.toLocaleString()} tonnes`,
    '',
    '═══════════════════════════════════════════════════════════════',
  ]

  return lines.join('\n')
}
