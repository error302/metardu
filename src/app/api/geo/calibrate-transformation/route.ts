/**
 * API: POST /api/geo/calibrate-transformation
 *
 * Derive a site-specific 7-parameter Bursa-Wolf transformation from common points.
 *
 * Body:
 *   {
 *     "commonPoints": [{ id, source: {x,y,z}, target: {x,y,z} }],
 *     "options": {
 *       "removeOutliers": true,
 *       "outlierThreshold": 3.0,
 *       "registerInRegistry": true,
 *       "provenance": { "surveyorName": "...", "projectName": "...", "area": "..." }
 *     }
 *   }
 *
 * Response:
 *   {
 *     "parameters": { tx, ty, tz, rx, ry, rz, scale },
 *     "parameterStdDevs": { tx, ty, tz, rx, ry, rz, scale },
 *     "rmsFit": 0.012,
 *     "estimatedLocalAccuracy": 0.04,
 *     "pointResiduals": [...],
 *     "outlierCount": 1,
 *     "converged": true,
 *     "summary": "..."
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  calibrateTransformation,
  validateCommonPoints,
  assessCalibrationQuality,
  type CommonPoint,
} from '@/lib/geo/transformationCalibration'

const Point3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
})

const CommonPointSchema = z.object({
  id: z.string().min(1),
  source: Point3DSchema,
  target: Point3DSchema,
  sourceAccuracy: z.number().positive().optional(),
  targetAccuracy: z.number().positive().optional(),
})

const ProvenanceSchema = z.object({
  surveyorName: z.string(),
  projectName: z.string(),
  area: z.string(),
  notes: z.string().optional(),
})

const RequestSchema = z.object({
  commonPoints: z.array(CommonPointSchema).min(3),
  options: z.object({
    maxIterations: z.number().positive().optional(),
    convergenceThreshold: z.number().positive().optional(),
    outlierThreshold: z.number().positive().optional(),
    removeOutliers: z.boolean().optional(),
    registerInRegistry: z.boolean().optional(),
    provenance: ProvenanceSchema.optional(),
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

    const { commonPoints, options } = parsed.data

    // Validate the common points
    const issues = validateCommonPoints(commonPoints as CommonPoint[])
    if (issues.some(i => i.includes('at least 3'))) {
      return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 })
    }

    // Run the calibration
    const result = calibrateTransformation(
      commonPoints as CommonPoint[],
      options ? {
        maxIterations: options.maxIterations,
        convergenceThreshold: options.convergenceThreshold,
        outlierThreshold: options.outlierThreshold,
        removeOutliers: options.removeOutliers,
        registerInRegistry: options.registerInRegistry,
        provenance: options.provenance,
      } : undefined,
    )

    // Assess quality
    const quality = assessCalibrationQuality(result.rmsFit)

    return NextResponse.json({
      ...result,
      quality,
    })
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error)
    const isPoints = /point|insufficient|minimum|at least 3/i.test(rawMsg)
    const isSingular = /singular|collinear|rank/i.test(rawMsg)

    return NextResponse.json(
      {
        error: isPoints
          ? 'Insufficient common reference points for Bursa-Wolf calibration'
          : isSingular
          ? 'Collinear or ill-conditioned common points'
          : 'Datum transformation calibration failed',
        code: isPoints ? 'INSUFFICIENT_COMMON_POINTS' : isSingular ? 'ILL_CONDITIONED_GEOMETRY' : 'CALIBRATION_FAILED',
        message: rawMsg,
        remedy: isPoints
          ? 'At least 3 common points with known coordinates in both Source and Target datums are required.'
          : 'Ensure common points are well-distributed across the survey area and not situated on a single straight line.',
      },
      { status: 422 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/geo/calibrate-transformation',
    method: 'POST',
    description: 'Derive a site-specific 7-parameter Bursa-Wolf transformation from common points',
    requirement: 'At least 3 common points with coordinates in both datums',
  })
}
