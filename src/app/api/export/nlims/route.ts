import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { resolveEpsg, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { exportToNLIMS, validateNLIMSExport } from '@/lib/export/nlimsExporter'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const textField = (max: number) => z.string().trim().min(1).max(max)
const draftRequestSchema = z.object({
  projectId: z.string().guid(),
  submissionType: z.literal('new_registration'),
  parcelNumber: textField(100),
  registry: textField(120),
  county: textField(80),
  subCounty: z.string().trim().max(80).prefault(''),
  surveyor: z.object({
    name: textField(200),
    licenseNumber: textField(100),
    firm: z.string().trim().max(200).optional(),
  }).strict(),
}).strict()

const coordinate = z.union([
  z.number().finite(),
  z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).transform(Number).pipe(z.number().finite()),
])
const boundaryStation = z.object({
  pointName: z.string().trim().min(1).max(100),
  adjustedEasting: coordinate,
  adjustedNorthing: coordinate,
})

interface ProjectDraftRow {
  id: string
  name: string
  survey_type: string | null
  boundary_data: unknown
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' },
  })
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch { return null }
}

/**
 * Build a METARDU draft from the saved, adjusted field boundary of an owned
 * cadastral project. This endpoint does not call or submit to a government API.
 */
export const POST = apiHandler(
  { auth: true, schema: draftRequestSchema, rateLimit: { max: 20, windowMs: 60000 } },
  async (_req, ctx) => {
    const request = ctx.body as z.infer<typeof draftRequestSchema>
    const access = await requireProjectReadAccess(request.projectId, ctx.userId)
    if (!access.ok) {
      if (!access.error) throw new Error('Project access check failed without an error response')
      return access.error
    }

    const projectResult = await db.query<ProjectDraftRow>(
      'SELECT id, name, survey_type, boundary_data FROM projects WHERE id = $1 LIMIT 1',
      [request.projectId],
    )
    const project = projectResult.rows[0]
    if (!project) return privateJson({ error: 'Project not found', code: 'NOT_FOUND' }, 404)
    const surveyType = (project.survey_type ?? '').toLowerCase()
    if (!surveyType.includes('cadastral') && !surveyType.includes('boundary')) {
      return privateJson({ error: 'This draft export is available for cadastral boundary projects only.', code: 'UNSUPPORTED_SURVEY_TYPE' }, 422)
    }

    const referenceResult = await db.query<Record<string, unknown>>(
      'SELECT * FROM project_reference_systems WHERE project_id = $1 LIMIT 1',
      [request.projectId],
    )
    const reference = resolveStageReference(referenceResult.rows[0], {})
    if (reference.source !== 'declared' || !reference.code) {
      return privateJson({ error: 'Declare a valid project reference system before exporting coordinates.', code: 'CRS_UNDECLARED' }, 409)
    }

    let crs
    try {
      crs = resolveEpsg(reference.code)
    } catch {
      return privateJson({ error: 'The declared project coordinate system is not supported by this draft format.', code: 'CRS_UNSUPPORTED' }, 422)
    }
    if (crs.zone == null || !crs.hemisphere || crs.units !== 'metres' || !crs.projected) {
      return privateJson({ error: 'This draft format currently requires a declared projected UTM reference system in metres.', code: 'CRS_UNSUPPORTED' }, 422)
    }
    if (reference.distanceMode !== 'grid' && reference.distanceMode !== 'ground') {
      return privateJson({ error: 'Set the project distance mode before generating this draft.', code: 'DISTANCE_MODE_UNDECLARED' }, 409)
    }

    const boundaryData = parseJsonValue(project.boundary_data)
    const boundaryRecord = boundaryData && typeof boundaryData === 'object' && !Array.isArray(boundaryData)
      ? boundaryData as Record<string, unknown>
      : null
    const computation = boundaryRecord?.computation
    const computationSource = computation && typeof computation === 'object' && !Array.isArray(computation)
      ? (computation as Record<string, unknown>).source
      : null
    if (computationSource !== 'field-observations') {
      return privateJson({ error: 'No saved field-observation adjustment is available. Recompute and save the boundary before exporting.', code: 'BOUNDARY_DATA_UNAVAILABLE' }, 422)
    }

    const parsedStations = z.array(boundaryStation).min(3).safeParse(boundaryRecord?.adjustedStations)
    if (!parsedStations.success || new Set(parsedStations.data.map(station => station.pointName)).size !== parsedStations.data.length) {
      return privateJson({ error: 'Saved adjusted boundary coordinates are incomplete or duplicated. Review and recompute the field boundary.', code: 'BOUNDARY_DATA_INVALID' }, 422)
    }
    const rangeErrors = parsedStations.data.flatMap(station => [
      ...validateCoordinateRange(station.adjustedEasting, station.adjustedNorthing, reference.code).errors,
    ])
    if (rangeErrors.length > 0) {
      return privateJson({ error: `Saved boundary coordinates do not fit the declared project reference system: ${rangeErrors.join('; ')}`, code: 'COORDINATE_RANGE_INVALID' }, 422)
    }

    const params = {
      draftMetadata: {
        format: 'METARDU_CADASTRAL_DRAFT_V1' as const,
        projectId: project.id,
        projectName: project.name,
        coordinateReference: reference.code,
        distanceMode: reference.distanceMode,
        geometrySource: 'saved_field_observation_adjustment' as const,
        officialRegistryFormatVerified: false as const,
        registryTransmission: 'not_sent' as const,
      },
      submissionType: request.submissionType,
      registry: request.registry,
      county: request.county,
      subCounty: request.subCounty,
      surveyor: request.surveyor,
      resultingParcels: [{
        parcelNumber: request.parcelNumber,
        vertices: parsedStations.data.map(station => ({
          name: station.pointName,
          easting: station.adjustedEasting,
          northing: station.adjustedNorthing,
        })),
      }],
      beacons: [],
      crs: {
        utmZone: crs.zone,
        hemisphere: crs.hemisphere,
        datum: crs.datum,
        projection: 'UTM',
      },
    }

    const validation = validateNLIMSExport(params)
    if (!validation.isValid) {
      return privateJson({ error: 'Complete the required draft fields before generating the JSON file.', validation }, 400)
    }

    const { payload } = await exportToNLIMS(params)
    try {
      const { appendAuditEntry } = await import('@/lib/audit/auditLog')
      await appendAuditEntry({
        projectId: project.id,
        userId: ctx.userId,
        userName: request.surveyor.name,
        entityType: 'document',
        entityId: `cadastral-draft/${payload.submissionId}`,
        action: 'generate',
        payload: {
          new: { parcelCount: payload.resultingParcels.length, integrityHash: payload.integrity.hash },
          reason: 'METARDU cadastral draft generated; no registry submission was made',
          metadata: { format: payload.draftMetadata.format, projectCrs: reference.code },
        },
      })
    } catch (auditErr) {
      logger.warn('[cadastral-draft/export] Audit append failed:', { error: auditErr })
    }

    return privateJson({
      payload,
      validation,
      provenance: {
        geometrySource: 'Saved adjusted field-observation boundary',
        coordinateReference: reference.code,
        officialRegistryFormatVerified: false,
        registryTransmission: 'not_sent',
      },
    })
  },
)

/** Authenticated endpoint describing this local draft format and its limits. */
export const GET = apiHandler({ auth: true }, async () => privateJson({
  schema: {
    format: 'METARDU_CADASTRAL_DRAFT_V1',
    purpose: 'Surveyor-reviewed JSON draft from saved project boundary coordinates',
    officialRegistrySchemaVerified: false,
    registrySubmission: 'not_supported',
    requiredProjectEvidence: ['saved field-observation adjustment', 'declared projected UTM reference system'],
    supportedWorkflow: ['new_registration'],
  },
}))
