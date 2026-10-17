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

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text === '' ? undefined : text
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Narrow the raw PUT body into a form without inventing any values. */
function readForm(body: unknown): ProjectReferenceSystemForm {
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

  const reference = (raw.csfReference ?? null) as Record<string, unknown> | null
  const easting = reference ? num(reference.easting) : undefined
  const northing = reference ? num(reference.northing) : undefined
  const height = reference ? num(reference.height) : undefined

  const form: ProjectReferenceSystemForm = {
    datum: String(raw.datum ?? ''),
    utmZone: num(raw.utmZone) ?? Number.NaN,
    hemisphere: raw.hemisphere,
    verticalDatum: str(raw.verticalDatum),
    verticalReference: (raw.verticalReference ?? undefined) as
      | 'orthometric'
      | 'ellipsoidal'
      | 'trig'
      | 'local'
      | undefined,
    geoidModel: str(raw.geoidModel),
    benchmarkBasis: str(raw.benchmarkBasis),
    calibrationVersion: str(raw.calibrationVersion),
    calibrationNotes: str(raw.calibrationNotes),
    distanceMode: (raw.distanceMode ?? undefined) as 'grid' | 'ground' | undefined,
    combinedScaleFactor: num(raw.combinedScaleFactor),
    csfProvenance: (raw.csfProvenance ?? undefined) as 'computed' | 'surveyor' | undefined,
    coordinatePrecision: num(raw.coordinatePrecision),
    notes: str(raw.notes),
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

    const { rows } = await db.query<Record<string, unknown>>(
      'SELECT * FROM project_reference_systems WHERE project_id = $1',
      [ctx.params.id]
    )
    const record = fromReferenceSystemRow(rows[0])
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
    let rows: Record<string, unknown>[]
    try {
      await client.query('BEGIN')
      await setRlsContext(client)
      // Share the project lock with drainage set-out generation so a CRS
      // declaration cannot change between its source check and field-job save.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ctx.params.id])
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO project_reference_systems (${columns.join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (project_id) DO UPDATE SET ${updates}
         RETURNING *`,
        columns.map((column) => row[column])
      )
      rows = result.rows

      // Keep the denormalized display columns on projects in step with the
      // declaration (reports, title blocks, and map layers read those).
      await client.query(
        `UPDATE projects
            SET utm_zone = $1, hemisphere = $2, datum = $3, updated_at = NOW()
          WHERE id = $4`,
        [form.utmZone, form.hemisphere, normalizeDatumSelection(form.datum), ctx.params.id]
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    projectCache.invalidate(CacheKeys.project(ctx.params.id))

    const saved = fromReferenceSystemRow(rows[0])
    if (!saved) throw new Error('Reference system upsert returned no row')

    return apiSuccess({
      referenceSystem: saved,
      description: describeProjectReferenceSystem(saved.prs),
    })
  }
)
