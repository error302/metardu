/**
 * API: POST /api/survey/robust-adjustment
 *
 * Run a robust LSA (Huber/IGG3/Tukey IRLS) adjustment.
 *
 * Body:
 *   {
 *     "stations": [{ id, name, easting, northing, elevation, isFixed }],
 *     "observations": [{ type, from, to, deltaE, deltaN, deltaH, ... }],
 *     "options": { "weightFunction": "huber", ... }
 *   }
 *
 * Response:
 *   {
 *     "adjustedStations": [...],
 *     "sigmaZero": 0.005,
 *     "iterations": 8,
 *     "converged": true,
 *     "finalWeights": [1, 0.005, 1, ...],
 *     "blunders": [{ "index": 1, "type": "coordinate_diff", ... }],
 *     "blunderCount": 1,
 *     "method": "huber",
 *     "summary": "Robust LSA (HUBER) converged in 8 iterations. σ₀=0.0050, dof=2. 1 blunder(s) detected and down-weighted."
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adjustNetworkRobust, type WeightFunction } from '@/lib/survey/robustEstimation'
import type { NetworkStation, GenericObservation } from '@/lib/survey/lsaIterative'

const StationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  easting: z.number(),
  northing: z.number(),
  elevation: z.number(),
  isFixed: z.boolean(),
})

const ObservationSchema = z.object({
  type: z.enum(['coordinate_diff', 'slope_distance', 'horizontal_direction', 'zenith_angle', 'height_difference']),
  from: z.string().optional(),
  to: z.string().optional(),
  deltaE: z.number().optional(),
  deltaN: z.number().optional(),
  deltaH: z.number().optional(),
  distance: z.number().optional(),
  direction: z.number().optional(),
  zenith: z.number().optional(),
  stdDevE: z.number().positive().optional(),
  stdDevN: z.number().positive().optional(),
  stdDevH: z.number().positive().optional(),
  stdDevDistance: z.number().positive().optional(),
  stdDevDirection: z.number().positive().optional(),
  stdDevZenith: z.number().positive().optional(),
})

const RequestSchema = z.object({
  stations: z.array(StationSchema).min(2),
  observations: z.array(ObservationSchema).min(1),
  options: z.object({
    weightFunction: z.enum(['huber', 'igg3', 'tukey']).optional(),
    huberC: z.number().positive().optional(),
    igg3K0: z.number().positive().optional(),
    igg3K1: z.number().positive().optional(),
    tukeyC: z.number().positive().optional(),
    maxIterations: z.number().positive().optional(),
    convergenceThreshold: z.number().positive().optional(),
    alpha: z.number().positive().optional(),
  }).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { stations, observations, options } = parsed.data

    const result = adjustNetworkRobust(
      stations as NetworkStation[],
      observations as GenericObservation[],
      options ? {
        weightFunction: options.weightFunction as WeightFunction,
        huberC: options.huberC,
        igg3K0: options.igg3K0,
        igg3K1: options.igg3K1,
        tukeyC: options.tukeyC,
        maxIterations: options.maxIterations,
        convergenceThreshold: options.convergenceThreshold,
        alpha: options.alpha,
      } : undefined,
    )

    return NextResponse.json(result)
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error)
    const isSingular = /singular|rank|determinant|invertible/i.test(rawMsg)
    const isConvergence = /converge|iteration/i.test(rawMsg)
    const isObs = /observation|insufficient|degree of freedom/i.test(rawMsg)

    let code = 'ROBUST_ADJUSTMENT_FAILED'
    let remedy = 'Review network geometry, check for gross observation blunders, or fix additional control stations.'
    const status = 422

    if (isSingular) {
      code = 'MATRIX_SINGULARITY'
      remedy = 'Normal equations matrix is singular. The network has unconstrained degrees of freedom. Ensure at least one known control point has fixed coordinates and network orientation is constrained.'
    } else if (isConvergence) {
      code = 'CONVERGENCE_FAILURE'
      remedy = 'Iteratively Reweighted Least Squares (IRLS) failed to converge within maximum iterations. Check for large blunder outliers in distance or angle observations.'
    } else if (isObs) {
      code = 'INSUFFICIENT_OBSERVATIONS'
      remedy = 'Insufficient redundant observations to form a least squares adjustment. Ensure the number of observations exceeds the number of unknown station coordinates (r = n - u > 0).'
    }

    return NextResponse.json(
      {
        error: isSingular
          ? 'Network normal equations matrix is rank deficient (singular)'
          : isConvergence
          ? 'Robust adjustment did not converge'
          : isObs
          ? 'Insufficient redundant observations for adjustment'
          : 'Robust survey adjustment failed',
        code,
        message: rawMsg,
        remedy,
      },
      { status },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/survey/robust-adjustment',
    method: 'POST',
    description: 'Robust LSA (Huber/IGG3/Tukey IRLS) for blunder-resistant adjustment',
    weightFunctions: ['huber', 'igg3', 'tukey'],
  })
}
