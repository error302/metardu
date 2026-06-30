import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { exportToNLIMS, validateNLIMSExport, type NLIMSExportParams } from '@/lib/export/nlimsExporter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/export/nlims
 *
 * Generate an NLIMS/ArdhiSasa submission payload from survey data.
 */
export const POST = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (req, ctx) => {
    const params = ctx.body as unknown as NLIMSExportParams

    const validation = validateNLIMSExport(params)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'NLIMS validation failed', validation },
        { status: 400 },
      )
    }

    const { payload, validation: val } = await exportToNLIMS(params)

    return apiSuccess({ payload, validation: val, downloadUrl: null })
  },
)

/**
 * GET /api/export/nlims — Schema documentation
 */
export const GET = apiHandler(
  { auth: true },
  async (req, ctx) => {
    return apiSuccess({
      schema: {
        version: '1.0.0',
        standard: 'Kenya Land Registration Act 2012, Survey Act Cap 299',
        submissionTypes: ['mutation', 'subdivision', 'amalgamation', 'new_registration', 'boundary_adjustment'],
        beaconPatterns: ['KP/XX/YY', 'MB/XXX', 'IRP/XXX', 'RMB/XXX'],
        coordinateSystem: {
          datum: 'Arc 1960',
          projection: 'UTM Zone 37S',
          epsg: 'EPSG:21037',
          precision: '3 decimal places (mm)',
        },
        areaTolerance: { default: '0.001 ha (10 m²)' },
        precisionThresholds: { urban: '1:10,000', rural: '1:5,000', topographic: '1:1,000' },
      },
    })
  },
)
