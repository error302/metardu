import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { prepareParcelBatchImport, type PreparedParcel } from '@/lib/parcel/prepareBatchImport'
import { resolveEpsg } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { readTextBounded } from '@/lib/security/requestBody'

interface ProjectRow {
  id: string
  user_id: string
  datum: string | null
  utm_zone: number | null
  hemisphere: string | null
  reference_row: Record<string, unknown> | null
}

interface InvalidGeometryRow {
  parcel_number: string
  reason: string
}

interface ParcelNumberRow {
  parcel_number: string
}

interface BatchBody {
  parcels?: unknown
  sourceCrs?: string
  confirmTransformation?: boolean
}

export const dynamic = 'force-dynamic'

/** Import valid parcels and their points together, in the declared project CRS. */
export const POST = apiHandler(
  { auth: true, rawBody: true, rateLimit: { max: 10, windowMs: 60000 } },
  async (request, ctx) => {
    const projectId = ctx.params?.id
    if (!projectId) return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })

    return db.transaction(async (client) => {
      const projectRes = await client.query<ProjectRow>(
        `SELECT p.id, p.user_id, p.datum, p.utm_zone, p.hemisphere,
                to_jsonb(prs) AS reference_row
           FROM projects p
           LEFT JOIN project_reference_systems prs ON prs.project_id = p.id
          WHERE p.id = $1
          FOR UPDATE OF p`,
        [projectId],
      )
      const project = projectRes.rows[0]
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      if (project.user_id !== ctx.userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      const reference = resolveStageReference(project.reference_row, project)
      if (!reference.code) {
        return NextResponse.json(
          { error: 'Declare a valid projected project reference system before importing parcels.' },
          { status: 422 },
        )
      }
      const crs = resolveEpsg(reference.code)
      const srid = Number(reference.code.replace(/^EPSG:/, ''))
      if (!Number.isInteger(srid) || !crs.projected || crs.displayOnly || crs.units !== 'metres') {
        return NextResponse.json({ error: 'Project CRS cannot store survey parcels.' }, { status: 422 })
      }

      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({ error: 'Expected application/json' }, { status: 415 })
      }
      const requestText = await readTextBounded(request.body, 8 * 1024 * 1024)
      if (requestText === null) return NextResponse.json({ error: 'Parcel import body exceeds 8 MB.' }, { status: 413 })
      let parsedBody: unknown
      try { parsedBody = JSON.parse(requestText) } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      const body: BatchBody = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
        ? parsedBody as BatchBody
        : {}
      let batch
      try {
        batch = prepareParcelBatchImport({
          parcels: body.parcels,
          sourceCrs: body.sourceCrs,
          projectCrs: reference.code,
          confirmTransformation: body.confirmTransformation === true,
        })
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Invalid import' },
          { status: 400 },
        )
      }
      if (batch.parcels.length === 0) {
        return NextResponse.json({ error: 'No valid parcels to import.', errors: batch.errors.slice(0, 20) }, { status: 400 })
      }
      const inputTotal = Array.isArray(body.parcels) ? body.parcels.length : 0

      // Serialize imports for the same project so two batches cannot both pass
      // the duplicate check. Other write paths still need a DB uniqueness gate.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [projectId])
      const names = batch.parcels.map((parcel) => parcel.parcel_number.toLocaleLowerCase('en'))
      const existing = await client.query<ParcelNumberRow>(
        'SELECT parcel_number FROM parcels WHERE project_id = $1 AND lower(parcel_number) = ANY($2::text[])',
        [projectId, names],
      )
      const existingNames = new Set(existing.rows.map((row) => row.parcel_number.toLocaleLowerCase('en')))
      const candidates = batch.parcels.filter((parcel) => {
        if (!existingNames.has(parcel.parcel_number.toLocaleLowerCase('en'))) return true
        batch.errors.push(`Parcel ${parcel.parcel_number}: already exists in project`)
        return false
      })

      let valid: PreparedParcel[] = candidates
      if (candidates.length > 0) {
        const invalid = await client.query<InvalidGeometryRow>(
          `SELECT row_data.parcel_number,
                  ST_IsValidReason(ST_GeomFromText(row_data.wkt, $2)) AS reason
             FROM jsonb_to_recordset($1::jsonb)
               AS row_data(parcel_number text, wkt text)
            WHERE NOT ST_IsValid(ST_GeomFromText(row_data.wkt, $2))`,
          [JSON.stringify(candidates), srid],
        )
        const invalidNames = new Set(invalid.rows.map((row) => row.parcel_number))
        for (const row of invalid.rows) batch.errors.push(`Parcel ${row.parcel_number}: ${row.reason}`)
        valid = candidates.filter((parcel) => !invalidNames.has(parcel.parcel_number))
      }
      if (valid.length === 0) {
        return apiSuccess({ imported: 0, failed: inputTotal, errors: batch.errors.slice(0, 20), total: inputTotal })
      }

      const records = JSON.stringify(valid)
      const inserted = await client.query<ParcelNumberRow>(
        `INSERT INTO parcels (project_id, parcel_number, lr_number_proposed, area_ha, geom, created_at)
         SELECT $1, row_data.parcel_number, row_data.lr_number, row_data.area_ha,
                ST_GeomFromText(row_data.wkt, $3), NOW()
           FROM jsonb_to_recordset($2::jsonb)
             AS row_data(parcel_number text, lr_number text, area_ha numeric, wkt text)
         RETURNING parcel_number`,
        [projectId, records, srid],
      )
      await client.query(
         `INSERT INTO parcel_import_sources
           (parcel_id, source_crs, project_crs, source_vertices,
            source_owner_name, source_owner_id, transformed, imported_by)
         SELECT p.id, $3, $4, row_data.source_vertices,
                row_data.owner_name, row_data.owner_id, $5, $6
           FROM jsonb_to_recordset($1::jsonb)
             AS row_data(parcel_number text, source_vertices jsonb,
                         owner_name text, owner_id text)
           JOIN parcels p ON p.project_id = $2 AND p.parcel_number = row_data.parcel_number`,
        [records, projectId, body.sourceCrs?.trim().toUpperCase(), reference.code, batch.transformed, ctx.userId],
      )
      await client.query(
        `INSERT INTO survey_points
           (project_id, point_name, easting, northing, code, datum, utm_zone, hemisphere, source, created_at)
         SELECT $1, row_data.parcel_number || '/B' || vertex.ordinality,
                (vertex.value->>'easting')::double precision,
                (vertex.value->>'northing')::double precision,
                'BEACON', $3, $4, $5, 'imported', NOW()
           FROM jsonb_to_recordset($2::jsonb)
             AS row_data(parcel_number text, vertices jsonb)
           CROSS JOIN LATERAL jsonb_array_elements(row_data.vertices)
             WITH ORDINALITY AS vertex(value, ordinality)`,
        [projectId, records, crs.datum, crs.zone ?? null, crs.hemisphere ?? null],
      )

      await client.query(
        `INSERT INTO user_activity (user_id, project_id, activity_type, description, metadata, created_at)
         VALUES ($1, $2, 'batch_import', $3, $4::jsonb, NOW())`,
        [
          ctx.userId,
          projectId,
          `Imported ${inserted.rowCount ?? valid.length} parcels`,
          JSON.stringify({
            imported: inserted.rowCount ?? valid.length,
            failed: inputTotal - (inserted.rowCount ?? valid.length),
            sourceCrs: body.sourceCrs,
            projectCrs: reference.code,
            transformed: batch.transformed,
            warnings: batch.warnings.slice(0, 20),
          }),
        ],
      )

      return apiSuccess({
        imported: inserted.rowCount ?? valid.length,
        failed: inputTotal - (inserted.rowCount ?? valid.length),
        errors: batch.errors.slice(0, 20),
        warnings: batch.warnings.slice(0, 20),
        total: inputTotal,
        projectCrs: reference.code,
      })
    })
  },
)
