/**
 * GET/PUT /api/project/[id]/reference-system
 *
 * The project reference system (blueprint §4.2): the declaration that every
 * export, drawing, report, and coordinate schedule must derive its CRS from.
 *
 * GET   → { referenceSystem, description } — null referenceSystem when the
 *         project has never declared one (a missing declaration is reported,
 *         never substituted).
 * PUT   → validates the declaration through the CRS authority
 *         (src/lib/spatial/projectCrs.ts), upserts
 *         project_reference_systems (migration 065), and keeps the
 *         denormalized projects.utm_zone / hemisphere / datum columns in
 *         sync with what was declared.
 *
 * SECURITY: project read access for GET, recorded ownership for PUT. Validation
 * failures return 400 with the CrsError code/message — no silent fallback
 * to a default CRS.
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { db, setRlsContext } from '@/lib/db'
import { CacheKeys, projectCache } from '@/lib/cache/memory-cache'
import { CrsError, describeProjectReferenceSystem } from '@/lib/spatial/projectCrs'
import { referenceNumber, referenceText, requiredReferenceNumber } from '@/lib/spatial/referenceDeclaration'
import {
  buildProjectReferenceSystem,
  fromReferenceSystemRow,
  normalizeDatumSelection,
  toReferenceSystemRow,
  type ProjectReferenceSystemForm,
} from '@/lib/spatial/projectReferenceSystem'

function ownershipError(ownership: Awaited<ReturnType<typeof requireProjectOwnership>>) {
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Ownership check failed without an error response')
    return ownership.error
  }
  return null
}

/** Narrow the raw PUT body into a form without inventing any values. */
function readForm(body: unknown): ProjectReferenceSystemForm {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CrsError('CRS_INVALID', 'Supply a reference-system declaration object.')
  const raw = (body ?? {}) as Record<string, unknown>

  if (typeof raw.hemisphere !== 'string' || (raw.hemisphere !== 'N' && raw.hemisphere !== 'S')) {
    throw new CrsError(
      'CRS_INVALID',
      `Hemisphere must be N or S (received: ${String(raw.hemisphere)}).`,
    )
  }
  if (raw.distanceMode !== undefined && raw.distanceMode !== 'grid' && raw.distanceMode !== 'ground') {
    throw new CrsError(
      'CRS_INVALID',
      `Distance mode must be "grid" or "ground" (received: ${String(raw.distanceMode)}).`,
    )
  }
  if (
    raw.verticalReference !== undefined &&
    raw.verticalReference !== null &&
    raw.verticalReference !== '' &&
    raw.verticalReference !== 'orthometric' &&
    raw.verticalReference !== 'ellipsoidal' &&
    raw.verticalReference !== 'trig' &&
    raw.verticalReference !== 'local'
  ) {
    throw new CrsError(
      'CRS_INVALID',
      `Vertical reference must be orthometric, ellipsoidal, trig, or local (received: ${String(raw.verticalReference)}).`,
    )
  }
  if (
    raw.csfProvenance !== undefined &&
    raw.csfProvenance !== null &&
    raw.csfProvenance !== '' &&
    raw.csfProvenance !== 'computed' &&
    raw.csfProvenance !== 'surveyor'
  ) {
    throw new CrsError(
      'CRS_INVALID',
      `Combined scale factor provenance must be "computed" or "surveyor" (received: ${String(raw.csfProvenance)}).`,
    )
  }

  if (raw.csfReference != null && (typeof raw.csfReference !== 'object' || Array.isArray(raw.csfReference))) {
    throw new CrsError('CRS_INVALID', 'The factor reference point must contain an easting and northing.')
  }
  const reference = (raw.csfReference ?? null) as Record<string, unknown> | null
  const easting = reference ? requiredReferenceNumber(reference.easting, 'Reference easting') : undefined
  const northing = reference ? requiredReferenceNumber(reference.northing, 'Reference northing') : undefined
  const height = reference ? referenceNumber(reference.height, 'Reference ellipsoidal height') : undefined

  const form: ProjectReferenceSystemForm = {
    datum: referenceText(raw.datum, 'Datum') ?? '',
    utmZone: requiredReferenceNumber(raw.utmZone, 'UTM zone'),
    hemisphere: raw.hemisphere,
    verticalDatum: referenceText(raw.verticalDatum, 'Vertical datum'),
    verticalReference: (raw.verticalReference ?? undefined) as
      | 'orthometric'
      | 'ellipsoidal'
      | 'trig'
      | 'local'
      | undefined,
    geoidModel: referenceText(raw.geoidModel, 'Geoid model'),
    benchmarkBasis: referenceText(raw.benchmarkBasis, 'Benchmark basis'),
    calibrationVersion: referenceText(raw.calibrationVersion, 'Calibration version'),
    calibrationNotes: referenceText(raw.calibrationNotes, 'Calibration notes'),
    distanceMode: (raw.distanceMode ?? undefined) as 'grid' | 'ground' | undefined,
    combinedScaleFactor: referenceNumber(raw.combinedScaleFactor, 'Combined scale factor'),
    csfProvenance: (raw.csfProvenance ?? undefined) as 'computed' | 'surveyor' | undefined,
    coordinatePrecision: referenceNumber(raw.coordinatePrecision, 'Coordinate precision'),
    notes: referenceText(raw.notes, 'Reference notes'),
  }
  if (easting !== undefined && northing !== undefined) {
    form.csfReference = { easting, northing, height }
  }
  return form
}

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const ownership = await requireProjectReadAccess(ctx.params.id, ctx.userId)
    const denied = ownershipError(ownership)
    if (denied) return denied
    if (!ownership.projectUserId) return NextResponse.json({ error: 'Recorded project ownership is required.' }, { status: 403 })

    const { rows } = await db.query<{ project_owner: string | null; reference: Record<string, unknown> | null }>(
      `SELECT project.user_id AS project_owner, to_jsonb(reference.*) AS reference
         FROM projects project
         LEFT JOIN project_reference_systems reference
           ON reference.project_id = project.id AND project.user_id = $2
        WHERE project.id = $1`,
      [ctx.params.id, ownership.projectUserId]
    )
    if (!rows[0]) return NextResponse.json({ error: 'Project no longer exists.' }, { status: 404 })
    if (rows[0].project_owner !== ownership.projectUserId) return NextResponse.json({ error: 'Project ownership changed; refresh before reading.' }, { status: 403 })
    const record = fromReferenceSystemRow(rows[0].reference ?? undefined)
    if (!record) {
      return NextResponse.json({ referenceSystem: null, description: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json({
      referenceSystem: record,
      description: describeProjectReferenceSystem(record.prs),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)

export const PUT = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (_req, ctx) => {
    const ownership = await requireProjectOwnership(ctx.params.id, ctx.userId)
    const denied = ownershipError(ownership)
    if (denied) return denied

    let form: ProjectReferenceSystemForm | null = null
    let record
    try {
      form = readForm(ctx.body)
      if (form.combinedScaleFactor !== undefined && !form.csfProvenance) {
        throw new CrsError(
          'PRS_INCOMPLETE',
          'State how the adopted combined scale factor was obtained (computed from coordinates, or surveyor-adopted) — provenance is recorded with every declared factor.',
        )
      }
      const prs = buildProjectReferenceSystem(form)
      record = {
        prs,
        geoidModel: form.geoidModel,
        benchmarkBasis: form.benchmarkBasis,
        calibrationVersion: form.calibrationVersion,
        calibrationNotes: form.calibrationNotes,
        csfProvenance: form.csfProvenance,
        csfReference: form.csfReference,
        declaredAt: new Date().toISOString(),
      }
    } catch (err) {
      if (err instanceof CrsError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 }
        )
      }
      throw err
    }
    if (!form) throw new Error('Declaration form was not parsed')

    const row = toReferenceSystemRow(ctx.params.id, record, ctx.userId)
    const columns = Object.keys(row)
    if (!columns.every((column) => /^[a-z_]+$/.test(column))) {
      throw new Error('Unexpected reference-system column name')
    }
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
    const updates = columns
      .filter((column) => column !== 'project_id')
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ')

    const client = await db.getClient()
    let saved: ReturnType<typeof fromReferenceSystemRow>
    let discardClient = false
    try {
      await client.query<never>('BEGIN')
      await setRlsContext(client)
      // Share the project lock with drainage set-out generation so a CRS
      // declaration cannot change between its source check and field-job save.
      await client.query<{ pg_advisory_xact_lock: unknown }>('SELECT pg_advisory_xact_lock(hashtext($1))', [ctx.params.id])
      // Match generation's reference-then-project lock order. The owner must
      // still be the caller at the write boundary, not only at admission.
      await client.query<{ project_id: string }>('SELECT project_id FROM project_reference_systems WHERE project_id = $1 FOR UPDATE', [ctx.params.id])
      const locked = await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id = $1 FOR UPDATE', [ctx.params.id])
      if (!locked.rows[0]) {
        await client.query<never>('ROLLBACK')
        return NextResponse.json({ error: 'Project no longer exists.' }, { status: 404 })
      }
      if (!locked.rows[0].user_id || locked.rows[0].user_id !== ctx.userId) {
        await client.query<never>('ROLLBACK')
        return NextResponse.json({ error: 'Project ownership changed; refresh before declaring the reference system.' }, { status: 403 })
      }
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO project_reference_systems (${columns.join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (project_id) DO UPDATE SET ${updates}
         RETURNING *`,
        columns.map((column) => row[column])
      )
      if (result.rowCount !== 1 || result.rows.length !== 1) throw new Error('Reference-system persistence was not confirmed.')
      const returned = result.rows[0]
      for (const column of columns) {
        const expected = row[column], actual = returned[column]
        const matches = typeof expected === 'number'
          ? actual != null && Number(actual) === expected
          : actual instanceof Date ? actual.toISOString() === expected : actual === expected
        if (!matches) throw new Error('Stored reference-system declaration differs from the submitted values.')
      }
      saved = fromReferenceSystemRow(returned)
      if (!saved) throw new Error('Reference system upsert returned no valid declaration')

      // Keep the denormalized display columns on projects in step with the
      // declaration (reports, title blocks, and map layers read those).
      const legacy = await client.query<never>(
        `UPDATE projects
            SET utm_zone = $1, hemisphere = $2, datum = $3, updated_at = NOW()
          WHERE id = $4 AND user_id = $5`,
        [form.utmZone, form.hemisphere, normalizeDatumSelection(form.datum), ctx.params.id, ctx.userId]
      )
      if (legacy.rowCount !== 1) throw new Error('Project reference display fields were not stored.')
      await client.query<never>('COMMIT')
    } catch (error) {
      await client.query<never>('ROLLBACK').catch(() => { discardClient = true })
      throw error
    } finally {
      client.release(discardClient)
    }
    projectCache.invalidate(CacheKeys.project(ctx.params.id))

    const response = apiSuccess({
      referenceSystem: saved,
      description: describeProjectReferenceSystem(saved.prs),
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
)
