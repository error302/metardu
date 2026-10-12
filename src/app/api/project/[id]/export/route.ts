/**
 * GET /api/project/[id]/export?format=dxf|geojson|csv|landxml
 *
 * Project-scoped deliverable export used by the Deliver stage
 * (blueprint §5.6 DELIVER, §15 professional deliverable system).
 *
 * This route previously did not exist, so every "Certified Digital Export"
 * button in DeliverStagePanel resolved to a 404. It serves the project's own
 * points and CRS — never a caller-supplied guess:
 *
 *  - CRS is read from the project and FAILS CLOSED when undeclared
 *    (blueprint §2.4 / §4.2: no exporter may hard-code a project CRS).
 *  - Adjusted stations are preferred over raw `survey_points` when present,
 *    so exports carry computed coordinates rather than unadjusted ones.
 *  - Every format goes through the existing single-source generators
 *    (generateGeoJSON / generateLandXML / generateDXF) so there is one
 *    implementation of each format, not a second copy here.
 */

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { generateGeoJSON } from '@/lib/export/generateGeoJSON'
import { generateLandXML, type LandXMLPoint } from '@/lib/export/generateLandXML'
import { generateDXFFromProject, type SurveyPoint } from '@/lib/export/generateDXF'
import { registerDeliverable, type DeliverableDocumentType } from '@/lib/deliverables/deliverableRegister'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { resolveEpsg } from '@/lib/spatial/projectCrs'
import { parseCadGridCoordinate } from '@/lib/cad/cadDocumentValidation'
import { logger } from '@/lib/logger'
import { canAccess, type FeatureKey } from '@/lib/subscription/featureGates'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'

export const dynamic = 'force-dynamic'

const FORMATS = ['dxf', 'geojson', 'csv', 'landxml'] as const
type ExportFormat = (typeof FORMATS)[number]

interface ProjectRow {
  id: string
  name: string
  location: string | null
  utm_zone: number | null
  hemisphere: string | null
  datum: string | null
  boundary_data: { adjustedStations?: AdjustedStation[] } | null
}

interface PointRow {
  point_name: string
  easting: number | string
  northing: number | string
  elevation: number | string | null
  is_control: boolean
  horizontal_crs: string | null
}

interface VerticalDatumRow {
  vertical_datum: string | null
  vertical_reference: string | null
  geoid_model: string | null
  benchmark_basis: string | null
}

interface AdjustedStation {
  pointName?: string
  name?: string
  index?: number
  adjustedEasting?: number
  easting?: number
  adjustedNorthing?: number
  northing?: number
  elevation?: number | null
  isControl?: boolean
  is_control?: boolean
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? parseCadGridCoordinate(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || Math.abs(parsed) > 1e9) {
    throw new Error('The coordinate schedule contains an incomplete or invalid measurement.')
  }
  return parsed
}

function safeFileBase(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '') || 'project'
}

/** The data revision an export was produced from (blueprint §28). */
async function resolveDataRevision(projectId: string): Promise<string | null> {
  const { rows } = await db.query<{ updated_at: string; revision: number | null }>(
    'SELECT updated_at, (boundary_data->>\'revision\')::int AS revision FROM projects WHERE id = $1',
    [projectId]
  ).catch(() => ({ rows: [] as Array<{ updated_at: string; revision: number | null }> }));
  const row = rows[0];
  if (!row) return null;
  return row.revision != null ? `R${String(row.revision).padStart(2, '0')}` : null;
}

/** Coordinate schedule CSV — the portable interchange every office accepts. */
function buildCoordinateScheduleCsv(points: SurveyPoint[]): string {
  const header = 'point_name,easting,northing,elevation,type'
  const rows = points.map((p) =>
    [
      `"${p.name.replace(/"/g, '""')}"`,
      p.easting.toFixed(4),
      p.northing.toFixed(4),
      p.elevation == null ? '' : Number(p.elevation).toFixed(4),
      p.is_control ? 'control' : 'survey',
    ].join(',')
  )
  return [header, ...rows].join('\r\n')
}

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const params = await ctx.params
  const projectId = params?.id
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
  }

  const format = (req.nextUrl.searchParams.get('format') ?? '').toLowerCase() as ExportFormat
  if (!FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `Unsupported format '${format}'. Use one of: ${FORMATS.join(', ')}` },
      { status: 400 }
    )
  }

  // Enforce paid export features on the server as well as in the tool UI.
  // Authenticated project ownership alone must not bypass plan entitlements.
  const requiredFeature: FeatureKey | null = format === 'dxf'
    ? 'dxf_export'
    : format === 'landxml'
      ? 'landxml'
      : null
  if (requiredFeature) {
    const subscription = await getSubscription(ctx.userId, ctx.session?.user?.email ?? undefined)
    if (!subscription || !canAccess(subscription.plan, requiredFeature)) {
      return NextResponse.json(
        { error: `This export requires the ${requiredFeature === 'landxml' ? 'LandXML' : 'DXF'} feature on a Pro plan or higher.` },
        { status: 403 },
      )
    }
  }

  const ownership = await requireProjectOwnership(projectId, ctx.userId)
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Ownership check failed without an error response')
    return ownership.error
  }

  const { rows: projectRows } = await db.query<ProjectRow>(
    `SELECT id, name, location, utm_zone, hemisphere, datum, boundary_data
       FROM projects WHERE id = $1`,
    [projectId]
  )
  if (projectRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const project = projectRows[0]

  // Fail closed on an undeclared CRS: an export with guessed coordinates is
  // the failure mode the blueprint forbids outright.
  const referenceRow = (await db.query<Record<string, unknown>>(
    'SELECT * FROM project_reference_systems WHERE project_id = $1', [projectId]
  )).rows[0]
  const reference = resolveStageReference(referenceRow, {})
  if (!reference.code || reference.source !== 'declared') {
    return NextResponse.json(
      {
        error:
          'Project CRS is not declared. Set the datum, UTM zone and hemisphere in Project Settings before exporting.',
        code: 'CRS_UNDECLARED',
      },
      { status: 400 }
    )
  }
  const crs = resolveEpsg(reference.code)
  const hemisphere = crs.hemisphere

  const { rows: rawPoints } = await db.query<PointRow>(
    `SELECT point_name, easting, northing, elevation, is_control, horizontal_crs
       FROM survey_points WHERE project_id = $1 AND deleted_at IS NULL ORDER BY point_name`,
    [projectId]
  )

  const adjustedStations = project.boundary_data?.adjustedStations ?? []
  let points: SurveyPoint[]
  try {
    if (adjustedStations.length === 0 && rawPoints.some(point => point.horizontal_crs !== reference.code)) {
      throw new Error('Stored point CRS does not match the declaration. Review the source coordinates before export.')
    }
    points = adjustedStations.length > 0
    ? adjustedStations.map((s, i) => {
      const adjusted = s.adjustedEasting !== undefined || s.adjustedNorthing !== undefined
      return {
        name: s.pointName || s.name || `S${s.index ?? i}`,
        easting: toNumber(adjusted ? s.adjustedEasting : s.easting),
        northing: toNumber(adjusted ? s.adjustedNorthing : s.northing),
        elevation: s.elevation == null ? null : toNumber(s.elevation),
        is_control: Boolean(s.isControl ?? s.is_control),
        control_order: '',
      }
    })
    : rawPoints.map((p) => ({
        name: p.point_name,
        easting: toNumber(p.easting),
        northing: toNumber(p.northing),
        elevation: p.elevation == null ? null : toNumber(p.elevation),
        is_control: p.is_control,
        control_order: '',
      }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid coordinate schedule', code: 'COORDINATES_INVALID' }, { status: 400 })
  }

  if (points.length === 0) {
    return NextResponse.json({ error: 'No survey points found for this project' }, { status: 404 })
  }

  const base = safeFileBase(project.name)
  const dataRevision = await resolveDataRevision(projectId);
  const projectCrsCode = reference.code

  /**
   * Issue one artifact: register it in the deliverable register (revision,
   * content hash, source data revision, evidence event) and return the bytes.
   * Registration is best-effort — a surveyor must still receive a correct
   * document if the register is unavailable — but the failure is never silent.
   */
  const issue = async (options: {
    documentType: DeliverableDocumentType
    content: string
    contentType: string
    filename: string
    generator: string
  }) => {
    let registerError: string | null = null;
    try {
      await registerDeliverable({
        projectId,
        documentType: options.documentType,
        content: options.content,
        title: `${project.name} — ${options.documentType}`,
        sourceRevision: dataRevision,
        projectCrs: projectCrsCode,
        generator: options.generator,
        manifest: {
          point_count: points.length,
          from_adjusted_stations: adjustedStations.length > 0,
          format: options.documentType,
        },
        userId: ctx.userId,
      });
    } catch (error) {
      registerError = error instanceof Error ? error.message : 'register failed';
      logger.error('[export] deliverable registration failed', {
        projectId,
        documentType: options.documentType,
        error,
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': options.contentType,
      'Content-Disposition': `attachment; filename="${options.filename}"`,
      'Cache-Control': 'private, no-store',
    };
    if (registerError) headers['X-Metardu-Register-Warning'] = 'deliverable register unavailable';
    return new NextResponse(options.content, { status: 200, headers });
  };

  if (format === 'geojson') {
    if (!crs.zone || !hemisphere) {
      return NextResponse.json({ error: 'GeoJSON currently requires a declared UTM reference system.', code: 'EXPORT_REFUSED' }, { status: 400 })
    }
    const geojson = generateGeoJSON(
      points,
      project.name,
      crs.zone,
      hemisphere,
      crs.datum
    );
    return issue({
      documentType: 'geojson',
      content: geojson,
      contentType: 'application/geo+json',
      filename: `${base}.geojson`,
      generator: 'lib/export/generateGeoJSON',
    });
  }

  if (format === 'landxml') {
    if (!crs.zone || !hemisphere) {
      return NextResponse.json({ error: 'LandXML currently requires a declared UTM reference system.', code: 'EXPORT_REFUSED' }, { status: 400 })
    }
    const { rows: verticalRows } = await db.query<VerticalDatumRow>(
      `SELECT vertical_datum, vertical_reference, geoid_model, benchmark_basis
         FROM project_reference_systems WHERE project_id = $1`,
      [projectId]
    )
    const vertical = verticalRows[0]
    const landxmlPoints: LandXMLPoint[] = points.map((p) => ({
      name: p.name,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation == null ? null : Number(p.elevation),
      is_control: Boolean(p.is_control),
    }))
    let xml: string
    try {
      xml = generateLandXML(
        {
          name: project.name,
          location: project.location ?? undefined,
          utm_zone: crs.zone,
          hemisphere,
          datum: crs.datum,
          vertical_datum: vertical?.vertical_datum ?? undefined,
          vertical_reference: vertical?.vertical_reference ?? undefined,
          geoid_model: vertical?.geoid_model ?? undefined,
          benchmark_basis: vertical?.benchmark_basis ?? undefined,
        },
        landxmlPoints
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'LandXML export failed',
          code: 'EXPORT_REFUSED',
        },
        { status: 400 }
      )
    }
    return issue({
      documentType: 'landxml',
      content: xml,
      contentType: 'application/xml',
      filename: `${base}.xml`,
      generator: 'lib/export/generateLandXML',
    });
  }

  if (format === 'csv') {
    return issue({
      documentType: 'coordinate_schedule',
      content: buildCoordinateScheduleCsv(points),
      contentType: 'text/csv; charset=utf-8',
      filename: `${base}_coordinates.csv`,
      generator: 'api/project/[id]/export',
    });
  }

  return issue({
    documentType: 'dxf',
    content: generateDXFFromProject(project.name, points),
    contentType: 'application/dxf',
    filename: `${base}.dxf`,
    generator: 'lib/export/generateDXF',
  });
})

/** Keep the apiHandler contract discoverable for callers and tests. */
export const POST = apiHandler({ auth: true }, async () =>
  apiSuccess({ error: 'Use GET ?format=dxf|geojson|csv|landxml' }, 405)
)
