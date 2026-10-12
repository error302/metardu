export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { callPythonCompute } from '@/lib/compute/pythonService'

/**
 * POST /api/gnss/baseline-process
 *
 * AUDIT FIX (C9, 2026-07-02): Real GNSS baseline processing via RTKLIB.
 * Previously the GNSS baseline tool was a regex parser that searched for
 * "REFERENCE POINT" strings in pre-processed files. This endpoint accepts
 * raw RINEX observation + navigation files and dispatches them to the
 * Python worker, which runs RTKLIB's rnx2rtkp and returns the baseline
 * solution (rover position, sigmas, quality, ratio).
 *
 * Request body:
 *   baseRinex:   string — Base station RINEX observation file content
 *   roverRinex:  string — Rover station RINEX observation file content
 *   navRinex:    string — RINEX navigation file content (broadcast ephemeris)
 *   basePosition: known geographic latitude/longitude and ellipsoidal height
 *   options?: {
 *     mode?: 'static' | 'kinematic'         (default 'static')
 *     frequency?: 'l1' | 'l1+l2' | 'l1+l2+l5' (default 'l1+l2')
 *     elevationMask?: number                 (default 15, degrees)
 *     ambiguityResolution?: 'off' | 'continuous' | 'instantaneous' | 'fix-and-hold'
 *   }
 *
 * Response:
 *   {
 *     rover_latitude, rover_longitude, rover_height,
 *     sigma_north, sigma_east, sigma_up,
 *     quality: 'FIX' | 'FLOAT' | 'SINGLE' | ...,
 *     sat_count, ratio,
 *     raw_output (last 2KB for debugging)
 *   }
 *
 * Note: RTKLIB must be installed in the Python worker container.
 * The worker Dockerfile installs it via apt-get install rtklib.
 */

const BaselineProcessSchema = z.object({
  baseRinex: z.string().min(100, 'Base RINEX file content is too short — check the file was uploaded correctly').max(25 * 1024 * 1024, 'Each RINEX file must be 25 MiB or smaller'),
  roverRinex: z.string().min(100, 'Rover RINEX file content is too short — check the file was uploaded correctly').max(25 * 1024 * 1024, 'Each RINEX file must be 25 MiB or smaller'),
  navRinex: z.string().min(100, 'Navigation RINEX file content is too short — check the file was uploaded correctly').max(25 * 1024 * 1024, 'Each RINEX file must be 25 MiB or smaller'),
  basePosition: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    ellipsoidalHeight: z.number().min(-12000).max(100000),
  }),
  options: z.object({
    mode: z.enum(['static', 'kinematic']).default('static'),
    frequency: z.enum(['l1', 'l1+l2', 'l1+l2+l5']).default('l1+l2'),
    elevationMask: z.number().min(0).max(90).default(15),
    ambiguityResolution: z.enum(['off', 'continuous', 'instantaneous', 'fix-and-hold']).default('continuous'),
  }).default({}),
})

export const POST = apiHandler(
  {
    auth: true,
    schema: BaselineProcessSchema,
    rateLimit: { max: 5, windowMs: 60000 }, // 5/min — GNSS processing is CPU-intensive
  },
  async (_req, ctx) => {
    const { baseRinex, roverRinex, navRinex, basePosition, options } = ctx.body as z.infer<
      typeof BaselineProcessSchema
    >

    // Dispatch to Python worker (RTKLIB subprocess)
    // 5-minute timeout for RTKLIB processing
    const result = await callPythonCompute<{
      rover_latitude: number
      rover_longitude: number
      rover_height: number
      sigma_north: number
      sigma_east: number
      sigma_up: number
      quality: string
      sat_count: number
      ratio: number
      raw_output: string
    }>(
      '/compute',
      {
        task: 'gnss_baseline_process',
        params: {
          base_rinex: baseRinex,
          rover_rinex: roverRinex,
          nav_rinex: navRinex,
          base_position: {
            latitude: basePosition.latitude,
            longitude: basePosition.longitude,
            ellipsoidal_height: basePosition.ellipsoidalHeight,
          },
          options: {
            mode: options.mode,
            frequency: options.frequency,
            elevation_mask: options.elevationMask,
            ambiguity_resolution: options.ambiguityResolution,
          },
        },
      },
      { timeoutMs: 330_000 } // 5.5 min (RTKLIB has 5min timeout + 30s overhead)
    )

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || 'GNSS baseline processing failed',
          code: 'WORKER_ERROR',
          details: result.details,
        },
        { status: result.status }
      )
    }

    return NextResponse.json({
      baseline: result.value,
      meta: {
        processedBy: 'RTKLIB (rnx2rtkp)',
        mode: options.mode,
        frequency: options.frequency,
        elevationMask: options.elevationMask,
        ambiguityResolution: options.ambiguityResolution,
        basePosition,
        processedAt: new Date().toISOString(),
      },
    })
  }
)
