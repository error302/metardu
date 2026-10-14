import type { RoadDesignData } from '@/types/engineering'
import { buildRoadVerticalSchedules, resolveRoadDesignStations } from './roadVerticalAlignment'

export function buildRoadLongSection(data: RoadDesignData | null) {
  const vertical = buildRoadVerticalSchedules(data), resolved = resolveRoadDesignStations(data)
  try {
    const ground = [...(data?.stations ?? [])].sort((a, b) => a.chainage - b.chainage)
    if (ground.length > 20000 || ground.some((s, i) => ![s.chainage, s.groundLevel].every(Number.isFinite) || i > 0 && s.chainage === ground[i - 1].chainage)) throw new RangeError('Long-section ground needs finite observations at unique chainages, up to 20,000 stations.')
    const rows = resolved.stations.map(station => {
      const target = Number.isFinite(station.designLevel) ? station.designLevel as number : null
      const depth = data?.crossSectionTemplate?.subgradeDepth
      const formation = target != null && depth != null && Number.isFinite(depth) && depth >= 0 ? target - depth : null
      return { chainage: station.chainage, ground: station.groundLevel, target, formation,
        difference: formation == null ? null : station.groundLevel - formation, source: station.designLevelSource ?? 'manual' }
    })
    return { ground, design: vertical.drawing, curves: vertical.curves, rows,
      issues: [...new Set([...vertical.issues, ...resolved.issues])] }
  } catch (error) { return { ground: [], design: [], curves: [], rows: [], issues: [error instanceof Error ? error.message : 'Review the long-section observations.'] } }
}
