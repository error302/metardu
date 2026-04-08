/**
 * Bathymetric Surface Generator — Phase 19
 * Builds a regular depth grid from reduced soundings using IDW.
 * Inverts the IDW engine from Phase 15 (elevation → depth).
 */

import { runIDW, IDWGrid, SurveyPoint } from '@/lib/topo/idwEngine'
import type { ReducedSounding } from './types'

export interface BathymetricGrid {
  idwGrid:    IDWGrid
  minDepth:   number
  maxDepth:   number
  meanDepth:  number
}

export function buildBathymetricSurface(
  reducedSoundings: ReducedSounding[],
  resolution = 100
): BathymetricGrid {
  if (reducedSoundings.length < 3) {
    throw new Error('Minimum 3 reduced soundings required for surface generation.')
  }

  const points: SurveyPoint[] = reducedSoundings.map(s => ({
    x: s.x,
    y: s.y,
    z: s.reducedDepthM
  }))

  const idwGrid = runIDW(points, { resolution, power: 2 })

  const depths = reducedSoundings.map(s => s.reducedDepthM)
  const minDepth  = Math.min(...depths)
  const maxDepth  = Math.max(...depths)
  const meanDepth = depths.reduce((a, b) => a + b, 0) / depths.length

  return { idwGrid, minDepth, maxDepth, meanDepth }
}
