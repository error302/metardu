/**
 * Seabed / Hydrographic Survey Processing — Pure TypeScript implementation.
 * Processes sounding observations for hydrographic surveys along the Kenya coast.
 * All depths referenced to Mean Lower Low Water (MLLW) for Kenya coast.
 */

import { z } from 'zod'

export const SeabedObservationSchema = z.object({
  point_id: z.string().max(50),
  easting: z.number(),
  northing: z.number(),
  depth_m: z.number().min(0).max(11000), // Deepest point on Earth ~11km
  sounding_method: z.enum(['single_beam', 'multi_beam', 'lead_line']),
  tide_correction_m: z.number().optional(),
  recorded_at: z.string().datetime().or(z.string()),
})

export type SeabedObservation = z.infer<typeof SeabedObservationSchema>

export interface ReducedSeabedObservation extends SeabedObservation {
  corrected_depth_m: number
  rl_m: number // Reduced level from chart datum
}

export interface SeabedSurveyResult {
  project_id: string
  observation_count: number
  min_depth_m: number
  max_depth_m: number
  mean_depth_m: number
  chart_datum_offset_m: number
  reduced_levels: ReducedSeabedObservation[]
  computed_at: string
}

/**
 * Apply tide correction to raw sounding depths.
 * corrected_depth = raw_depth - tide_correction
 */
export function applyTideCorrection(
  observations: SeabedObservation[]
): SeabedObservation[] {
  return observations.map(obs => ({
    ...obs,
    depth_m: obs.depth_m - (obs.tide_correction_m ?? 0),
  }))
}

/**
 * Compute reduced levels from chart datum.
 * All depths referenced to Mean Lower Low Water (MLLW) for Kenya coast.
 * RL = chart_datum_offset - corrected_depth
 */
export function reduceToChartDatum(
  observations: SeabedObservation[],
  chartDatumOffset: number
): ReducedSeabedObservation[] {
  return observations.map(obs => ({
    ...obs,
    corrected_depth_m: obs.depth_m - (obs.tide_correction_m ?? 0),
    rl_m: chartDatumOffset - obs.depth_m,
  }))
}

/**
 * Detect underwater hazards: sudden depth changes that may indicate
 * rocks, shoals, or other navigation hazards.
 */
export function detectHazards(
  observations: ReducedSeabedObservation[],
  depthChangeThreshold: number = 2.0, // metres — sudden drop threshold
  minShoalDepth: number = 1.5, // metres — minimum safe depth for small vessels
): Array<{
  type: 'shoal' | 'drop-off'
  point_id: string
  depth_m: number
  description: string
}> {
  const hazards: Array<{
    type: 'shoal' | 'drop-off'
    point_id: string
    depth_m: number
    description: string
  }> = []

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i]

    // Shoal detection — depth shallower than minimum safe navigation depth
    if (obs.corrected_depth_m < minShoalDepth) {
      hazards.push({
        type: 'shoal',
        point_id: obs.point_id,
        depth_m: obs.corrected_depth_m,
        description: `Shallow water at ${obs.point_id}: ${obs.corrected_depth_m.toFixed(2)}m (below ${minShoalDepth}m safe depth)`,
      })
    }

    // Drop-off detection — compare with adjacent points
    if (i > 0) {
      const prev = observations[i - 1]
      const depthDiff = Math.abs(obs.corrected_depth_m - prev.corrected_depth_m)
      if (depthDiff > depthChangeThreshold) {
        hazards.push({
          type: 'drop-off',
          point_id: obs.point_id,
          depth_m: obs.corrected_depth_m,
          description: `Sudden depth change at ${obs.point_id}: ${depthDiff.toFixed(2)}m difference from previous sounding`,
        })
      }
    }
  }

  return hazards
}

/**
 * Full seabed survey processing pipeline.
 */
export async function processSeabedSurvey(
  projectId: string,
  observations: SeabedObservation[],
  chartDatumOffset: number
): Promise<SeabedSurveyResult> {
  const reduced = reduceToChartDatum(observations, chartDatumOffset)

  const depths = reduced.map(o => o.corrected_depth_m)
  const minDepth = Math.min(...depths)
  const maxDepth = Math.max(...depths)
  const meanDepth = depths.reduce((a, b) => a + b, 0) / depths.length

  return {
    project_id: projectId,
    observation_count: reduced.length,
    min_depth_m: minDepth,
    max_depth_m: maxDepth,
    mean_depth_m: meanDepth,
    chart_datum_offset_m: chartDatumOffset,
    reduced_levels: reduced,
    computed_at: new Date().toISOString(),
  }
}
