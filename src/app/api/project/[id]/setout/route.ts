/**
 * Project setting out (blueprint §11, §9.5, §27).
 *
 * GET  /api/project/[id]/setout                      — definitions, register, progress
 * POST /api/project/[id]/setout                      — actions
 *   { action: 'save_definition',  ... }  store/refresh a grid definition + design points
 *   { action: 'record_observation', ... } record an as-staked shot (design vs observed)
 *   { action: 'record_verticality', ... } record a column plumb check
 *
 * Setting out used to be a calculator with no project behind it: the panel was
 * mounted without a projectId, the definition and the stake records lived in
 * React state, and there was no way to record an as-staked shot or a plumb
 * check. This route makes it a project activity with evidence, judged by the
 * same DESIGN / MEASURED / DELTA / TOLERANCE / STATUS model used everywhere
 * else (blueprint §27).
 *
 * Observations and verticality readings are append-only (migration 075): a
 * re-stake is a new record, so the history of what was rejected stays visible.
 */

import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { db, setRlsContext } from '@/lib/db'
import { generatePileGrid, MAX_PILE_GRID_POINTS, type PileGridDefinition, type PileGridResult } from '@/lib/engineering/pileGrid'
import { drainagePipeGradeContext, generateProjectDrainageSetout } from '@/lib/engineering/projectDrainageEngine'
import {
  parseSetoutToleranceProfileDraft,
  resolveSetoutToleranceProfile,
  serializeSetoutToleranceRules,
} from '@/lib/engineering/setoutToleranceProfile'
import { createVerticalityCapture, parseVerticalityCapture, sameVerticalityEvidence, type VerticalityCaptureSnapshot } from '@/lib/field/verticalityCapture'
import { recordEvidenceEvent } from '@/lib/observations/observationBatches'
import { assertProjectedCrs, resolveEpsg, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import type { DrainageData } from '@/types/engineering'
import { logger } from '@/lib/logger'
import { createSetoutCaptureSnapshot, normalizeCaptureTime, parseSetoutCaptureSnapshot, type SetoutCaptureSnapshot } from '@/lib/field/setoutCapture'

export const dynamic = 'force-dynamic'

interface DefinitionBody {
  definitionId?: string
  name: string
  structureType?: PileGridDefinition['pileType']
  originEasting: number
  originNorthing: number
  originRL?: number | null
  rows: number
  columns: number
  rowSpacing: number
  columnSpacing: number
  rotation?: number
  startLabel?: string
  labelRowsAs?: 'alpha' | 'numeric'
  labelColumnsAs?: 'alpha' | 'numeric'
  pileDiameterMm?: number | null
  depthM?: number | null
  toleranceProfile?: unknown
}

interface ObservationBody {
  /** Stable identifier generated before the shot is queued on the device. */
  clientShotId?: string
  capturedAt?: string
  capturedCrs?: string
  definitionId: string
  label: string
  designRevision?: number
  designEasting?: number
  designNorthing?: number
  designRL?: number | null
  observedEasting: number
  observedNorthing: number
  observedRL?: number | null
  accuracyM?: number | null
  verticalAccuracyM?: number | null
  capturedVerticalDatum?: string | null
  capturedToleranceProfileId?: string | null
  instrument?: string
  instrumentSerial?: string
  operatorName?: string
  crew?: string
  observationBatchId?: string
  notes?: string
}

interface VerticalityBody {
  capturedBy?: string
  clientReadingId?: string
  capturedAt?: string | null
  capturedCrs?: string | null
  capturedVerticalDatum?: string | null
  horizontalUncertaintyM?: number | null
  heightUncertaintyM?: number | null
  criteria?: unknown
  definitionId?: string
  label: string
  level?: string
  baseEasting: number
  baseNorthing: number
  baseRL?: number | null
  topEasting: number
  topNorthing: number
  topRL?: number | null
  instrument?: string
  notes?: string
}

interface DrainageDefinitionBody {
  action: 'save_drainage_definition'
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const optionalNum = (value: unknown): { valid: boolean; value: number | null } => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { valid: true, value: null };
  }
  const parsed = num(value);
  return { valid: parsed !== null, value: parsed };
};

interface StoredSetoutObservation {
  id: string
  definition_id: string
  label: string
  design_easting: number | string
  design_northing: number | string
  design_rl: number | string | null
  observed_easting: number | string
  observed_northing: number | string
  observed_rl: number | string | null
  reported_accuracy_m: number | string | null
  design_revision: number | string | null
  staked_by: string | null
  instrument: string | null
  instrument_serial: string | null
  operator_name: string | null
  crew: string | null
  observation_batch_id: string | null
  notes: string | null
  result: string
  capture_snapshot?: unknown
}

function sameStoredNumber(stored: number | string | null, requested: number | null, resolution: number): boolean {
  if (requested == null) return stored == null
  return stored != null && Number.isFinite(Number(stored)) && Math.abs(Number(stored) - requested) <= resolution
}

function sameStoredText(stored: string | null, requested: unknown): boolean {
  return (stored ?? null) === (typeof requested === 'string' ? requested : null)
}

export const GET = apiHandler({ auth: true, rateLimit: { max: 120, windowMs: 60000 } }, async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params?.id;
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const ownership = await requireProjectOwnership(projectId, ctx.userId);
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Project ownership check failed without an error response');
    return ownership.error;
  }

  // The design point list for one definition — the field set-out screen walks
  // these in order.
  const definitionId = req.nextUrl.searchParams.get('definitionId');
  if (definitionId) {
    const { rows: points } = await db.query<{
      label: string
      easting: number
      northing: number
      design_rl: number | null
      point_type: string
      revision: number
      metadata: Record<string, unknown>
    }>(
      `SELECT p.label, p.easting::double precision AS easting,
              p.northing::double precision AS northing,
              p.design_rl::double precision AS design_rl,
              p.point_type, p.revision, p.metadata
         FROM setout_points p
         JOIN setout_definitions d ON d.id = p.definition_id
        WHERE d.id = $1 AND d.project_id = $2
          AND p.revision = (
            SELECT MAX(current.revision)
              FROM setout_points current
             WHERE current.definition_id = d.id
          )
        ORDER BY p.row_index, p.column_index, p.label`,
      [definitionId, projectId]
    );
    const { rows: register } = await db.query<{
      definition_id: string
      label: string
      result: string
      horizontal_error: number | null
      vertical_error: number | null
      reported_accuracy_m: number | null
      staked_at: string
      }>(
        `SELECT DISTINCT ON (o.definition_id, o.label)
              o.definition_id, o.label, o.result,
              COALESCE((o.capture_snapshot->'assessment'->>'horizontalErrorM')::double precision, o.horizontal_error::double precision) AS horizontal_error,
              COALESCE((o.capture_snapshot->'assessment'->>'verticalErrorM')::double precision, o.vertical_error::double precision) AS vertical_error,
              COALESCE((o.capture_snapshot->>'reportedAccuracyM')::double precision, o.reported_accuracy_m::double precision) AS reported_accuracy_m, o.staked_at
         FROM setout_observations o
         JOIN setout_definitions d ON d.id = o.definition_id
         JOIN setout_points current_point ON current_point.id = o.setout_point_id
          AND current_point.revision = (
            SELECT MAX(latest.revision) FROM setout_points latest
             WHERE latest.definition_id = d.id
          )
        WHERE d.id = $1 AND d.project_id = $2 AND o.project_id = $2
        ORDER BY o.definition_id, o.label, o.staked_at DESC, o.created_at DESC`,
      [definitionId, projectId]
    );
    return NextResponse.json({ data: { points, register } });
  }

  const { rows: definitions } = await db.query<{
    id: string
    name: string
    structure_type: string
    status: string
    rows: number
    columns: number
    crs: string | null
    tolerance_profile_id: string | null
    metadata: Record<string, unknown>
    origin_easting: number
    origin_northing: number
    updated_at: string
  }>(
    `SELECT id, name, structure_type, status, rows, columns, crs, tolerance_profile_id, metadata,
            origin_easting, origin_northing, origin_rl, row_spacing, column_spacing,
            rotation, start_label, label_rows_as, label_columns_as, pile_diameter_mm, depth_m, updated_at,
            (SELECT COALESCE(MAX(p.revision), 0) FROM setout_points p WHERE p.definition_id = setout_definitions.id) AS revision
       FROM setout_definitions
      WHERE project_id = $1 AND status <> 'SUPERSEDED'
      ORDER BY updated_at DESC`,
    [projectId]
  );

  const { rows: register } = await db.query<{
    definition_id: string
    label: string
    result: string
    horizontal_error: number | null
    vertical_error: number | null
    reported_accuracy_m: number | null
    staked_at: string
    instrument: string | null
    operator_name: string | null
  }>(
    `SELECT DISTINCT ON (o.definition_id, o.label)
            o.definition_id, o.label, o.result,
            COALESCE((o.capture_snapshot->'assessment'->>'horizontalErrorM')::double precision, o.horizontal_error::double precision) AS horizontal_error,
            COALESCE((o.capture_snapshot->'assessment'->>'verticalErrorM')::double precision, o.vertical_error::double precision) AS vertical_error,
            COALESCE((o.capture_snapshot->>'reportedAccuracyM')::double precision, o.reported_accuracy_m::double precision) AS reported_accuracy_m,
            o.staked_at, o.instrument, o.operator_name
       FROM setout_observations o
       JOIN setout_definitions d ON d.id = o.definition_id
       JOIN setout_points current_point ON current_point.id = o.setout_point_id
        AND current_point.revision = (
          SELECT MAX(latest.revision) FROM setout_points latest
           WHERE latest.definition_id = d.id
        )
      WHERE d.project_id = $1 AND o.project_id = $1
      ORDER BY o.definition_id, o.label, o.staked_at DESC, o.created_at DESC`,
    [projectId]
  );

  const { rows: progress } = await db.query<{
    staked: number
    fails: number
    points: number
  }>(
    `SELECT
       (SELECT count(*) FROM (
          SELECT DISTINCT o.definition_id, o.label
            FROM setout_observations o
            JOIN setout_definitions d ON d.id = o.definition_id
            JOIN setout_points current_point ON current_point.id = o.setout_point_id
             AND current_point.revision = (
               SELECT MAX(latest.revision) FROM setout_points latest
                WHERE latest.definition_id = d.id
             )
           WHERE d.project_id = $1 AND o.project_id = $1
       ) latest_shots) AS staked,
       (SELECT count(*) FROM (
          SELECT DISTINCT ON (o.definition_id, o.label) o.result
            FROM setout_observations o
            JOIN setout_definitions d ON d.id = o.definition_id
            JOIN setout_points current_point ON current_point.id = o.setout_point_id
             AND current_point.revision = (
               SELECT MAX(latest.revision) FROM setout_points latest
                WHERE latest.definition_id = d.id
             )
           WHERE d.project_id = $1 AND o.project_id = $1
           ORDER BY o.definition_id, o.label, o.staked_at DESC, o.created_at DESC
       ) latest_results WHERE result = 'FAIL') AS fails,
       (SELECT count(*) FROM setout_points p
          JOIN setout_definitions d ON d.id = p.definition_id
         WHERE d.project_id = $1
           AND p.revision = (SELECT MAX(current.revision)
                               FROM setout_points current
                              WHERE current.definition_id = d.id)) AS points`,
    [projectId]
  );

  const { rows: verticality } = await db.query<{
    label: string
    level: string | null
    offset_h: number | null
    tilt_ratio: string | null
    result: string
    observed_at: string
    capture_snapshot: unknown
  }>(
    `SELECT DISTINCT ON (label, level) label, level, offset_h, tilt_ratio, result, observed_at,
            to_jsonb(v)->'capture_snapshot' AS capture_snapshot
       FROM verticality_readings v
      WHERE project_id = $1
      ORDER BY label, level NULLS FIRST, observed_at DESC`,
    [projectId]
  );

  return NextResponse.json({
    data: {
      definitions,
      register,
      verticality: verticality.map(row => {
        const parsed = parseVerticalityCapture(row.capture_snapshot);
        const capture = parsed?.projectId === projectId && parsed.label === row.label && parsed.level === row.level ? parsed : null;
        return { ...row, captureSnapshot: capture, recordedResult: row.result,
          numericalResult: capture?.assessment.result ?? 'INFO',
          assessmentScope: capture ? 'numerical_comparison_only' : row.capture_snapshot == null ? 'historical_result_not_currently_assessed' : 'invalid_capture_evidence_not_assessed' };
      }),
      progress: progress[0] ?? { staked: 0, fails: 0, points: 0 },
      standard: null,
      standardSource: 'requires_recorded_project_criteria',
      tolerance: null,
      toleranceSource: 'requires_project_profile',
    },
  });
});

export const POST = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (_req, ctx) => {
  const params = await ctx.params;
  const projectId = params?.id;
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const userId = ctx.userId;
  if (!userId || userId === 'anonymous') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownership = await requireProjectOwnership(projectId, userId);
  if (!ownership.ok) {
    if (!ownership.error) throw new Error('Project ownership check failed without an error response');
    return ownership.error;
  }

  // apiHandler parses JSON once before invoking the route; its request stream
  // is already consumed. Use that parsed payload for every field action.
  const body = ctx.body as
    | (DefinitionBody & { action: 'save_definition' })
    | (ObservationBody & { action: 'record_observation' })
    | (VerticalityBody & { action: 'record_verticality' })
    | DrainageDefinitionBody
    | null;

  if (!body?.action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }
  if (!['save_definition', 'save_drainage_definition', 'record_observation', 'record_verticality'].includes(body.action)) {
    return NextResponse.json({ error: 'Unsupported set-out action.' }, { status: 400 });
  }

  // The project CRS governs: set-out coordinates without a stated reference
  // system are not a professional record.
  const { rows: projectRows } = await db.query<{
    utm_zone: number | null
    hemisphere: string | null
    datum: string | null
    engineering_data: Record<string, unknown> | null
  }>('SELECT utm_zone, hemisphere, datum, engineering_data FROM projects WHERE id = $1', [projectId]);
  const project = projectRows[0];
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { rows: referenceRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM project_reference_systems WHERE project_id = $1',
    [projectId]
  );
  const projectReference = resolveStageReference(referenceRows[0], project);
  if (!projectReference.code && body.action !== 'record_observation') {
    return NextResponse.json(
      { error: 'Project CRS is not declared as a supported projected metre system. Declare it before setting out.', code: 'CRS_UNDECLARED' },
      { status: 400 }
    );
  }
  const crs = projectReference.code ?? '';
  try {
    if (crs) assertProjectedCrs(crs);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Project CRS must be a registered projected CRS in metres.',
        code: 'CRS_NOT_PROJECTED',
      },
      { status: 400 }
    );
  }

  if (body.action === 'save_drainage_definition') {
    const engineeringData = project.engineering_data
    const rawDrainage = engineeringData && typeof engineeringData === 'object'
      ? (engineeringData as Record<string, unknown>).drainage
      : null
    if (!rawDrainage || typeof rawDrainage !== 'object' || !Array.isArray((rawDrainage as Record<string, unknown>).manholes)) {
      return NextResponse.json(
        { error: 'Save a drainage design with at least two manholes before creating field targets.', code: 'DRAINAGE_DATA_MISSING' },
        { status: 400 }
      )
    }
    const drainage = rawDrainage as DrainageData
    const toleranceProfileDraft = parseSetoutToleranceProfileDraft(drainage.setoutToleranceProfile)
    if (toleranceProfileDraft.issues.length > 0) {
      return NextResponse.json(
        { error: 'The drainage set-out tolerance profile is incomplete or unacknowledged.', code: 'SETOUT_TOLERANCE_PROFILE_INVALID', details: toleranceProfileDraft.issues },
        { status: 422 }
      )
    }
    let declaredDrainageCrs: string
    try {
      if (!drainage.projectCrs?.trim()) throw new Error('The drainage design has no declared CRS.')
      declaredDrainageCrs = resolveEpsg(drainage.projectCrs).code
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'The drainage design CRS is not registered.', code: 'DRAINAGE_CRS_INVALID' },
        { status: 400 }
      )
    }
    if (declaredDrainageCrs !== crs) {
      return NextResponse.json(
        { error: `Drainage CRS ${declaredDrainageCrs} differs from the project's declared CRS ${crs}. Reconcile the project reference system before set-out.`, code: 'DRAINAGE_CRS_MISMATCH' },
        { status: 409 }
      )
    }

    const result = generateProjectDrainageSetout(drainage)
    if (result.issues.length > 0 || result.stations.length === 0) {
      return NextResponse.json(
        { error: 'Drainage set-out targets are incomplete or inconsistent.', code: 'DRAINAGE_SETOUT_INPUTS', details: result.issues },
        { status: 422 }
      )
    }

    const coordinateErrors: string[] = []
    const coordinateWarnings = new Set<string>()
    result.warnings.forEach(warning => coordinateWarnings.add(warning))
    for (const [index, station] of result.stations.entries()) {
      const label = `DR-${String(index + 1).padStart(5, '0')}`
      if (![station.easting, station.northing, station.invertLevelM, station.crownLevelM].every(Number.isFinite)) {
        coordinateErrors.push(`${label}: calculated station coordinates or levels are not finite.`)
        continue
      }
      const check = validateCoordinateRange(station.easting, station.northing, crs)
      if (!check.valid) coordinateErrors.push(`${label}: ${check.errors.join('; ')}`)
      for (const warning of check.warnings) coordinateWarnings.add(warning)
    }
    if (coordinateErrors.length > 0) {
      return NextResponse.json(
        { error: 'Generated drainage targets fall outside the declared project CRS range.', code: 'COORDINATES_OUT_OF_RANGE', details: coordinateErrors.slice(0, 10) },
        { status: 400 }
      )
    }

    const sourceHash = createHash('sha256').update(JSON.stringify(drainage)).digest('hex')
    const routedSegmentCount = drainage.manholes.slice(0, -1)
      .filter(manhole => Array.isArray(manhole.alignmentVerticesOut) && manhole.alignmentVerticesOut.length > 0)
      .length
    const mapAlignmentSources = drainage.manholes.slice(0, -1)
      .map((manhole, index) => ({
        from: manhole.name,
        to: drainage.manholes[index + 1]?.name ?? '',
        source: manhole.alignmentSourceOut,
      }))
      .filter(entry => entry.source !== undefined)
    const mapAlignmentSourceByPipeId = new Map(
      mapAlignmentSources.map(entry => [`${entry.from}-${entry.to}`, entry.source]),
    )
    const baseDefinitionMetadata = {
      source: 'project_drainage',
      sourceEngineeringHash: sourceHash,
      generator: 'project-drainage-alignment-setout-v3',
      projectCrs: crs,
      declaredHeightReference: projectReference.verticalDatum ?? null,
      setoutIntervalM: drainage.setoutIntervalM,
      stationCount: result.stations.length,
      routedSegmentCount,
      mapAlignmentSegmentCount: mapAlignmentSources.length,
      mapAlignmentSources,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
      coordinateMethod: mapAlignmentSources.length > 0
        ? 'Stationing follows selected saved project map lines transformed to the declared project CRS, with the recorded manhole-to-line connectors. These map drawings remain unverified design geometry and require review against approved design and survey control.'
        : routedSegmentCount > 0
          ? 'Stationing follows saved projected alignment vertices; segments without interior vertices are straight between saved manhole coordinates.'
          : 'Straight segments between saved manhole coordinates; no interior alignment vertices were supplied.',
      verticalTarget: 'Pipe invert RL; crown RL is derived from the entered manufacturer outside diameter.',
      intermediateGround: 'Not surveyed or inferred.',
      setoutToleranceSource: toleranceProfileDraft.profile ? 'project_approved_profile' : 'METARDU_default',
    }

    const client = await db.getClient()
    try {
      await client.query('BEGIN')
      await setRlsContext(client)
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [projectId])
      const first = result.stations[0]
      const recordedAt = new Date().toISOString()
      const toleranceRules = toleranceProfileDraft.profile
        ? serializeSetoutToleranceRules(toleranceProfileDraft.profile, userId, recordedAt)
        : null
      let toleranceProfileId: string | null = null
      if (toleranceProfileDraft.profile && toleranceRules) {
        const profileResult = await client.query<{ id: string }>(
          `INSERT INTO tolerance_profiles
             (name, jurisdiction, version, description, rules, is_default, created_by)
           VALUES ($1,$2,$3,$4,$5::jsonb,FALSE,$6)
           RETURNING id`,
          [
            toleranceProfileDraft.profile.name,
            toleranceProfileDraft.profile.jurisdiction,
            toleranceProfileDraft.profile.version,
            `Project drainage set-out tolerance from ${toleranceProfileDraft.profile.source}; effective ${toleranceProfileDraft.profile.effectiveDate}; approved by ${toleranceProfileDraft.profile.approvedBy}.`,
            JSON.stringify(toleranceRules),
            userId,
          ]
        )
        toleranceProfileId = profileResult.rows[0]?.id ?? null
        if (!toleranceProfileId) throw new Error('Set-out tolerance profile was not returned after save')
      }
      const definitionMetadata = {
        ...baseDefinitionMetadata,
        setoutToleranceProfileSnapshot: toleranceProfileDraft.profile && toleranceRules && toleranceProfileId
          ? { id: toleranceProfileId, ...toleranceProfileDraft.profile, rules: toleranceRules }
          : null,
      }
      const definitionResult = await client.query<{ id: string }>(
        `INSERT INTO setout_definitions
           (project_id, name, structure_type, origin_easting, origin_northing, origin_rl,
            rows, columns, row_spacing, column_spacing, rotation, start_label,
            label_rows_as, label_columns_as, crs, status, tolerance_profile_id, created_by, metadata)
         VALUES ($1,'Drainage pipe set-out','grid_point',$2,$3,$4,1,$5,1,$6,0,'DR','numeric','numeric',$7,'COMPUTED',$8,$9,$10::jsonb)
         ON CONFLICT (project_id, name) WHERE status <> 'SUPERSEDED'
         DO UPDATE SET structure_type = EXCLUDED.structure_type,
                       origin_easting = EXCLUDED.origin_easting,
                       origin_northing = EXCLUDED.origin_northing,
                       origin_rl = EXCLUDED.origin_rl,
                       rows = EXCLUDED.rows,
                       columns = EXCLUDED.columns,
                       row_spacing = EXCLUDED.row_spacing,
                       column_spacing = EXCLUDED.column_spacing,
                       rotation = EXCLUDED.rotation,
                       start_label = EXCLUDED.start_label,
                       label_rows_as = EXCLUDED.label_rows_as,
                       label_columns_as = EXCLUDED.label_columns_as,
                       crs = EXCLUDED.crs,
                       tolerance_profile_id = EXCLUDED.tolerance_profile_id,
                       status = 'COMPUTED',
                       metadata = EXCLUDED.metadata,
                       updated_at = NOW()
         RETURNING id`,
        [
          projectId,
          first.easting,
          first.northing,
          first.invertLevelM,
          result.stations.length,
          drainage.setoutIntervalM,
          crs,
          toleranceProfileId,
          userId,
          JSON.stringify(definitionMetadata),
        ]
      )
      const definitionId = definitionResult.rows[0]?.id
      if (!definitionId) throw new Error('Drainage set-out definition was not returned after save')
      const { rows: revisionRows } = await client.query<{ revision: number }>(
        'SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM setout_points WHERE definition_id = $1',
        [definitionId]
      )
      const revision = Number(revisionRows[0]?.revision ?? 1)

      const pipeGrades = drainagePipeGradeContext(result.stations)
      const batchSize = 250
      for (let offset = 0; offset < result.stations.length; offset += batchSize) {
        const batch = result.stations.slice(offset, offset + batchSize)
        const values: unknown[] = [definitionId, revision]
        const rowsSql = batch.map((station, batchIndex) => {
          const stationIndex = offset + batchIndex
          const label = `DR-${String(stationIndex + 1).padStart(5, '0')}`
          const metadata = {
            ...pipeGrades.get(station.pipeId),
            pipeId: station.pipeId,
            stationRole: station.stationRole,
            pipeChainageM: station.pipeChainageM,
            runChainageM: station.runChainageM,
            crownLevelM: station.crownLevelM,
            groundStatus: station.groundStatus,
            coverAboveCrownM: station.coverAboveCrownM ?? null,
            coverAssessment: station.coverAssessment,
            alignmentSource: mapAlignmentSourceByPipeId.get(station.pipeId) ?? null,
            horizontalTarget: 'Pipe centreline',
            verticalTarget: 'Pipe invert RL',
            declaredHeightReference: projectReference.verticalDatum ?? null,
            setoutToleranceProfileSnapshot: definitionMetadata.setoutToleranceProfileSnapshot,
            projectCrs: crs,
          }
          const base = 3 + batchIndex * 8
          values.push(label, 0, stationIndex, station.easting, station.northing, station.invertLevelM, 'drainage_station', JSON.stringify(metadata))
          const fields = Array.from({ length: 8 }, (_, valueIndex) =>
            `$${base + valueIndex}${valueIndex === 7 ? '::jsonb' : ''}`
          )
          return `($1,$2,${fields.join(',')})`
        }).join(',')
        await client.query(
          `INSERT INTO setout_points
             (definition_id, revision, label, row_index, column_index, easting, northing, design_rl, point_type, metadata)
           VALUES ${rowsSql}
           ON CONFLICT (definition_id, revision, label) DO NOTHING`,
          values
        )
      }
      await client.query('COMMIT')
      return NextResponse.json(
        { data: { definitionId, revision, pointCount: result.stations.length, crs, coordinateWarnings: [...coordinateWarnings] } },
        { status: 201 }
      )
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      logger.error('[setout] save drainage definition failed', { error })
      return NextResponse.json({ error: 'Could not store the drainage set-out definition' }, { status: 500 })
    }
  }

  if (body.action === 'save_definition') {
    const toleranceProfileDraft = parseSetoutToleranceProfileDraft(body.toleranceProfile)
    if (toleranceProfileDraft.issues.length) return NextResponse.json({ error: toleranceProfileDraft.issues.join(' '), code: 'INVALID_TOLERANCE_PROFILE' }, { status: 400 })
    const originEasting = num(body.originEasting);
    const originNorthing = num(body.originNorthing);
    const rows = num(body.rows);
    const columns = num(body.columns);
    const rowSpacing = num(body.rowSpacing);
    const columnSpacing = num(body.columnSpacing);
    const rotation = body.rotation == null ? 0 : num(body.rotation);
    const structureTypes: readonly PileGridDefinition['pileType'][] = ['pile', 'column', 'pier', 'abutment'];
    const structureType = body.structureType ?? 'pile';
    const labelRowsAs = body.labelRowsAs ?? 'alpha';
    const labelColumnsAs = body.labelColumnsAs ?? 'alpha';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const startLabel = typeof body.startLabel === 'string' ? body.startLabel.trim() : '';
    const pileDiameterMm = num(body.pileDiameterMm);
    const depthM = num(body.depthM);
    const originRL = optionalNum(body.originRL);
    if (originEasting == null || originNorthing == null || rows == null || columns == null || rowSpacing == null || columnSpacing == null || rotation == null) {
      return NextResponse.json(
        { error: 'Finite origin coordinates, whole grid dimensions, positive spacing, and a finite rotation are required' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
      return NextResponse.json({ error: 'Grid rows and columns must be positive whole numbers' }, { status: 400 });
    }
    if (rows * columns > MAX_PILE_GRID_POINTS) {
      return NextResponse.json(
        { error: `A set-out grid cannot exceed ${MAX_PILE_GRID_POINTS.toLocaleString()} points`, code: 'GRID_POINT_LIMIT' },
        { status: 413 }
      );
    }
    if (rowSpacing <= 0 || columnSpacing <= 0) {
      return NextResponse.json({ error: 'Grid row and column spacing must be positive' }, { status: 400 });
    }
    if (!structureTypes.includes(structureType)) {
      return NextResponse.json({ error: 'Select a supported structure type' }, { status: 400 });
    }
    if (!['alpha', 'numeric'].includes(labelRowsAs) || !['alpha', 'numeric'].includes(labelColumnsAs)) {
      return NextResponse.json({ error: 'Row and column label formats must be alpha or numeric' }, { status: 400 });
    }
    if (name.length > 150 || startLabel.length > 20) {
      return NextResponse.json({ error: 'Grid name or starting label exceeds its supported length' }, { status: 400 });
    }
    if (!originRL.valid) {
      return NextResponse.json({ error: 'Design RL must be a finite number or left blank' }, { status: 400 });
    }
    if (body.pileDiameterMm != null && pileDiameterMm == null) {
      return NextResponse.json({ error: 'Pile diameter must be a finite number when supplied' }, { status: 400 });
    }
    if (body.depthM != null && depthM == null) {
      return NextResponse.json({ error: 'Pile depth must be a finite number when supplied' }, { status: 400 });
    }
    if (pileDiameterMm != null && pileDiameterMm <= 0) {
      return NextResponse.json({ error: 'Pile diameter must be positive when supplied' }, { status: 400 });
    }
    if (depthM != null && depthM <= 0) {
      return NextResponse.json({ error: 'Pile depth must be positive when supplied' }, { status: 400 });
    }

    const definition: PileGridDefinition = {
      name: name || 'Set-out grid',
      originEasting,
      originNorthing,
      originRL: originRL.value,
      rows,
      columns,
      rowSpacing,
      columnSpacing,
      rotation,
      startLabel,
      labelRowsAs: labelRowsAs as PileGridDefinition['labelRowsAs'],
      labelColumnsAs: labelColumnsAs as PileGridDefinition['labelColumnsAs'],
      pileType: structureType as PileGridDefinition['pileType'],
      pileDiameter: pileDiameterMm ?? undefined,
      depth: depthM ?? undefined,
      coordinateSystem: crs,
    };

    // Design coordinates are computed server-side so the stored design and the
    // stored shots can never come from two different engines.
    let result: PileGridResult;
    try {
      result = generatePileGrid(definition);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Set-out grid inputs are invalid', code: 'INVALID_GRID' },
        { status: 400 }
      );
    }

    const coordinateErrors: string[] = [];
    const coordinateWarnings = new Set<string>();
    for (const pile of result.piles) {
      const check = validateCoordinateRange(pile.easting, pile.northing, crs);
      if (!check.valid) {
        coordinateErrors.push(`${pile.label}: ${check.errors.join('; ')}`);
        if (coordinateErrors.length === 5) break;
      }
      for (const warning of check.warnings) coordinateWarnings.add(warning);
    }
    if (coordinateErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Generated set-out coordinates fall outside the declared project CRS range.',
          code: 'COORDINATES_OUT_OF_RANGE',
          details: coordinateErrors,
        },
        { status: 400 }
      );
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await setRlsContext(client);

      let definitionId = body.definitionId ?? null;
      if (definitionId) {
        const owned = await client.query(
          'SELECT id FROM setout_definitions WHERE id = $1 AND project_id = $2',
          [definitionId, projectId]
        );
        if (!owned.rows[0]) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'Definition not found' }, { status: 404 });
        }
        await client.query(
          `UPDATE setout_definitions
              SET name = $2, structure_type = $3, origin_easting = $4, origin_northing = $5,
                  origin_rl = $6, rows = $7, columns = $8, row_spacing = $9, column_spacing = $10,
                  rotation = $11, start_label = $12, label_rows_as = $13, label_columns_as = $14,
                  pile_diameter_mm = $15, depth_m = $16, crs = $17, status = 'COMPUTED',
                  updated_at = NOW()
            WHERE id = $1`,
          [
            definitionId,
            definition.name,
            definition.pileType,
            definition.originEasting,
            definition.originNorthing,
            definition.originRL,
            definition.rows,
            definition.columns,
            definition.rowSpacing,
            definition.columnSpacing,
            definition.rotation,
            definition.startLabel,
            definition.labelRowsAs,
            definition.labelColumnsAs,
            definition.pileDiameter ?? null,
            definition.depth ?? null,
            crs,
          ]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO setout_definitions
             (project_id, name, structure_type, origin_easting, origin_northing, origin_rl,
              rows, columns, row_spacing, column_spacing, rotation, start_label,
              label_rows_as, label_columns_as, pile_diameter_mm, depth_m, crs, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'COMPUTED',$18)
           RETURNING id`,
          [
            projectId,
            definition.name,
            definition.pileType,
            definition.originEasting,
            definition.originNorthing,
            definition.originRL,
            definition.rows,
            definition.columns,
            definition.rowSpacing,
            definition.columnSpacing,
            definition.rotation,
            definition.startLabel,
            definition.labelRowsAs,
            definition.labelColumnsAs,
            definition.pileDiameter ?? null,
            definition.depth ?? null,
            crs,
            userId,
          ]
        );
        definitionId = inserted.rows[0].id;
      }

      const recordedAt = new Date().toISOString()
      const toleranceRules = toleranceProfileDraft.profile ? serializeSetoutToleranceRules(toleranceProfileDraft.profile, userId, recordedAt) : null
      let toleranceProfileId: string | null = null
      if (toleranceProfileDraft.profile && toleranceRules) {
        const profile = toleranceProfileDraft.profile
        const savedProfile = await client.query<{ id: string }>(
          `INSERT INTO tolerance_profiles (name, jurisdiction, version, description, rules, is_default, created_by)
           VALUES ($1,$2,$3,$4,$5::jsonb,FALSE,$6) RETURNING id`,
          [profile.name, profile.jurisdiction, profile.version, `Pile/grid criteria transcribed from ${profile.source}; effective ${profile.effectiveDate}; approved by ${profile.approvedBy}.`, JSON.stringify(toleranceRules), userId])
        toleranceProfileId = savedProfile.rows[0]?.id ?? null
        if (!toleranceProfileId) throw new Error('Tolerance profile was not returned after save')
      }
      const metadata = {
        source: 'project_pile_grid', generator: 'pile-grid-v2', projectCrs: crs,
        generatedAt: recordedAt, generatedBy: userId,
        setoutToleranceSource: toleranceProfileDraft.profile ? 'project_profile_transcription' : 'METARDU_default',
        setoutToleranceProfileSnapshot: toleranceProfileDraft.profile && toleranceRules && toleranceProfileId
          ? { id: toleranceProfileId, ...toleranceProfileDraft.profile, rules: toleranceRules } : null,
      }
      await client.query(
        `UPDATE setout_definitions SET tolerance_profile_id = $2, metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb WHERE id = $1`,
        [definitionId, toleranceProfileId, JSON.stringify(metadata)])

      // Every save writes a fresh design revision; existing shots keep the
      // revision they were taken against.
      const { rows: revRows } = await client.query<{ revision: number }>(
        'SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM setout_points WHERE definition_id = $1',
        [definitionId]
      );
      const revision = Number(revRows[0]?.revision ?? 1);

      const pointMetadata = JSON.stringify({ ...metadata, sourceDefinition: definition, declaredHeightReference: projectReference.verticalDatum ?? null, designRevision: revision })
      const insertBatchSize = 500;
      for (let offset = 0; offset < result.piles.length; offset += insertBatchSize) {
        const batch = result.piles.slice(offset, offset + insertBatchSize);
        const values: unknown[] = [definitionId, revision];
        const rowsSql = batch.map((pile, batchIndex) => {
          const base = 3 + batchIndex * 8;
          values.push(
            pile.label,
            pile.row,
            pile.column,
            pile.easting,
            pile.northing,
            pile.designRL,
            definition.pileType,
            pointMetadata,
          );
          return `($1,$2,${Array.from({ length: 8 }, (_, valueIndex) => `$${base + valueIndex}${valueIndex === 7 ? '::jsonb' : ''}`).join(',')})`;
        }).join(',');
        await client.query(
          `INSERT INTO setout_points
             (definition_id, revision, label, row_index, column_index, easting, northing, design_rl, point_type, metadata)
           VALUES ${rowsSql}
           ON CONFLICT (definition_id, revision, label) DO NOTHING`,
          values
        );
      }

      await client.query('COMMIT');

      return NextResponse.json(
        { data: { definitionId, revision, pointCount: result.piles.length, crs, coordinateWarnings: [...coordinateWarnings] } },
        { status: 201 }
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('[setout] save definition failed', { error });
      return NextResponse.json({ error: 'Could not store the set-out definition' }, { status: 500 });
    }
  }

  if (body.action === 'record_observation') {
    let capturedAt: string | null
    try { capturedAt = normalizeCaptureTime(body.capturedAt) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid capture time.' }, { status: 400 }) }
    let deviceCrs: string | null = null
    if (body.capturedCrs !== undefined) {
      try { deviceCrs = assertProjectedCrs(body.capturedCrs).code }
      catch { return NextResponse.json({ error: 'Capture CRS must be a supported projected metre CRS.' }, { status: 400 }) }
    }
    const observedE = num(body.observedEasting);
    const observedN = num(body.observedNorthing);
    const observedRLValue = optionalNum(body.observedRL);
    const accuracyValue = optionalNum(body.accuracyM);
    const verticalAccuracyValue = optionalNum(body.verticalAccuracyM);
    const capturedVerticalDatum = typeof body.capturedVerticalDatum === 'string' && body.capturedVerticalDatum.trim() ? body.capturedVerticalDatum.trim() : null;
    const capturedProfileId = typeof body.capturedToleranceProfileId === 'string' && body.capturedToleranceProfileId.trim() ? body.capturedToleranceProfileId.trim() : null;
    if (!verticalAccuracyValue.valid || verticalAccuracyValue.value != null && verticalAccuracyValue.value < 0
      || body.capturedVerticalDatum != null && (typeof body.capturedVerticalDatum !== 'string' || body.capturedVerticalDatum.length > 500)
      || body.capturedToleranceProfileId != null && (typeof body.capturedToleranceProfileId !== 'string' || body.capturedToleranceProfileId.length > 128)) return NextResponse.json({error:'Level accuracy and captured reference/criterion identifiers are invalid.'},{status:400});
    const clientShotId = body.clientShotId;
    if (clientShotId !== undefined && (typeof clientShotId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(clientShotId))) {
      return NextResponse.json({ error: 'clientShotId must be a stable identifier of at most 128 letters, numbers, underscores or hyphens' }, { status: 400 });
    }
    if (!body.definitionId || !body.label || observedE == null || observedN == null) {
      return NextResponse.json(
        { error: 'definitionId, label and the observed coordinates are required' },
        { status: 400 }
      );
    }
    if (!observedRLValue.valid || !accuracyValue.valid || (accuracyValue.value != null && accuracyValue.value < 0)) {
      return NextResponse.json(
        { error: 'Observed RL must be finite when supplied and fix accuracy cannot be negative' },
        { status: 400 }
      );
    }

    const capturedDesignE = optionalNum(body.designEasting)
    const capturedDesignN = optionalNum(body.designNorthing)
    const capturedDesignRL = optionalNum(body.designRL)
    const capturedRevision = num(body.designRevision)
    const hasDesignSnapshot = body.designEasting !== undefined || body.designNorthing !== undefined || body.designRL !== undefined
    if (!capturedDesignE.valid || capturedDesignE.value == null || !capturedDesignN.valid || capturedDesignN.value == null
      || !capturedDesignRL.valid || !hasDesignSnapshot
      || (body.designRevision !== undefined && (capturedRevision == null || !Number.isInteger(capturedRevision) || capturedRevision < 1))) {
      return NextResponse.json(
        { error: 'Include the design coordinates and revision shown when this shot was captured.', code: 'DESIGN_REVISION_REQUIRED' },
        { status: 400 }
      )
    }

    if (clientShotId && (capturedRevision == null || !Number.isInteger(capturedRevision) || capturedRevision < 1)) {
      return NextResponse.json(
        { error: 'Offline set-out uploads require the design revision captured with the shot.', code: 'DESIGN_REVISION_REQUIRED' },
        { status: 400 }
      );
    }

    const respondToReplay = (existing: StoredSetoutObservation): NextResponse => {
      let matchesRequest = existing.definition_id === body.definitionId
        && existing.label === body.label
        && sameStoredNumber(existing.design_easting, capturedDesignE.value, 0.00051)
        && sameStoredNumber(existing.design_northing, capturedDesignN.value, 0.00051)
        && sameStoredNumber(existing.design_rl, capturedDesignRL.value, 0.00051)
        && sameStoredNumber(existing.observed_easting, observedE, 0.00051)
        && sameStoredNumber(existing.observed_northing, observedN, 0.00051)
        && sameStoredNumber(existing.observed_rl, observedRLValue.value, 0.00051)
        && sameStoredNumber(existing.reported_accuracy_m, accuracyValue.value, 0.000051)
        && Number(existing.design_revision) === capturedRevision
        && existing.staked_by === userId
        && sameStoredText(existing.instrument, body.instrument)
        && sameStoredText(existing.instrument_serial, body.instrumentSerial)
        && sameStoredText(existing.operator_name, body.operatorName)
        && sameStoredText(existing.crew, body.crew)
        && sameStoredText(existing.observation_batch_id, body.observationBatchId)
        && sameStoredText(existing.notes, body.notes);

      if (existing.capture_snapshot != null) {
        const snapshot = parseSetoutCaptureSnapshot(existing.capture_snapshot)
        if (!snapshot) return NextResponse.json({ error: 'The saved capture evidence needs review before this shot can be reconciled.', code: 'CAPTURE_EVIDENCE_INVALID' }, { status: 409 })
        matchesRequest = matchesRequest
          && snapshot.projectId === projectId && snapshot.definitionId === body.definitionId && snapshot.pointLabel === body.label
          && snapshot.capturedDesign.easting === capturedDesignE.value && snapshot.capturedDesign.northing === capturedDesignN.value && snapshot.capturedDesign.rl === capturedDesignRL.value
          && snapshot.observed.easting === observedE && snapshot.observed.northing === observedN && snapshot.observed.rl === observedRLValue.value
          && snapshot.reportedAccuracyM === accuracyValue.value && snapshot.designRevision === capturedRevision
          && snapshot.capturedAt === capturedAt && snapshot.deviceCrs === deviceCrs
        if(snapshot.schemaVersion===2)matchesRequest=matchesRequest&&snapshot.reportedVerticalAccuracyM===verticalAccuracyValue.value&&snapshot.deviceVerticalDatum===capturedVerticalDatum&&snapshot.capturedToleranceProfileId===capturedProfileId
        else if(verticalAccuracyValue.value!=null||capturedVerticalDatum!=null||capturedProfileId!=null)matchesRequest=false
      }

      if (!matchesRequest) {
        return NextResponse.json(
          { error: 'This clientShotId is already attached to a different observation. Keep the original record and capture a new shot with a new identifier.', code: 'IDEMPOTENCY_KEY_REUSED' },
          { status: 409 }
        );
      }

      return NextResponse.json({
        data: {
          id: existing.id,
          designRevision: Number(existing.design_revision),
          result: existing.result,
        },
        replayed: true,
      });
    };

    const findClientShot = async (): Promise<NextResponse | null> => {
      if (!clientShotId) return null;
      const { rows } = await db.query<StoredSetoutObservation>(
        `SELECT o.id, o.definition_id, o.label,
                o.design_easting::double precision AS design_easting,
                o.design_northing::double precision AS design_northing,
                o.design_rl::double precision AS design_rl,
                o.observed_easting::double precision AS observed_easting,
                o.observed_northing::double precision AS observed_northing,
                o.observed_rl::double precision AS observed_rl,
                o.reported_accuracy_m::double precision AS reported_accuracy_m,
                COALESCE((o.capture_snapshot->>'designRevision')::integer, p.revision) AS design_revision, o.staked_by::text AS staked_by,
                o.instrument, o.instrument_serial, o.operator_name, o.crew,
                o.observation_batch_id::text AS observation_batch_id, o.notes, o.result, o.capture_snapshot
           FROM setout_observations o
           LEFT JOIN setout_points p ON p.id = o.setout_point_id
          WHERE o.project_id = $1 AND o.client_shot_id = $2
          LIMIT 1`,
        [projectId, clientShotId]
      );
      return rows[0] ? respondToReplay(rows[0]) : null;
    };

    const priorDelivery = await findClientShot();
    if (priorDelivery) return priorDelivery;
    if (!crs) return NextResponse.json({ error: 'Declare a valid project CRS before recording a new shot.', code: 'CRS_UNDECLARED' }, { status: 400 });
    if (deviceCrs != null && deviceCrs !== crs) return NextResponse.json({ error: 'The project CRS changed after capture. Review this shot before uploading it.', code: 'SETOUT_CRS_CHANGED' }, { status: 409 });

    const { rows: pointRows } = await db.query<{
      id: string
      easting: number
      northing: number
      design_rl: number | null
      revision: number
      tolerance_profile_id: string | null
      definition_metadata: Record<string, unknown> | null
      definition_crs: string | null
      point_metadata: Record<string, unknown> | null
    }>(
      `SELECT p.id, p.easting::double precision AS easting,
              p.northing::double precision AS northing,
              p.design_rl::double precision AS design_rl, p.revision,
              d.tolerance_profile_id, d.metadata AS definition_metadata, d.crs AS definition_crs, p.metadata AS point_metadata
         FROM setout_points p
        JOIN setout_definitions d ON d.id = p.definition_id
        WHERE d.project_id = $1 AND d.id = $2 AND p.label = $3
        ORDER BY p.revision DESC LIMIT 1`,
      [projectId, body.definitionId, body.label]
    );
    const design = pointRows[0];
    if (!design) {
      return NextResponse.json(
        { error: `Unknown set-out point '${body.label}' for this definition` },
        { status: 404 }
      );
    }
    if (capturedRevision != null && Number(design.revision) !== capturedRevision) {
      return NextResponse.json(
        { error: 'This target changed after the shot was captured. Refresh the design and review the queued observation before recording it.', code: 'SETOUT_REVISION_CHANGED' },
        { status: 409 }
      )
    }
    const sameDesign = Math.abs(Number(design.easting) - capturedDesignE.value) <= 0.0005
      && Math.abs(Number(design.northing) - capturedDesignN.value) <= 0.0005
      && (design.design_rl == null
        ? capturedDesignRL.value == null
        : capturedDesignRL.value != null && Math.abs(Number(design.design_rl) - capturedDesignRL.value) <= 0.0005)
    if (!sameDesign) {
      return NextResponse.json(
        { error: 'This target no longer matches the design coordinates captured with the shot. Review it before recording.', code: 'SETOUT_DESIGN_CHANGED' },
        { status: 409 }
      )
    }

    const hasPointProfile=design.point_metadata!=null&&Object.prototype.hasOwnProperty.call(design.point_metadata,'setoutToleranceProfileSnapshot')
    const profileSnapshotValue = hasPointProfile ? design.point_metadata?.setoutToleranceProfileSnapshot : design.definition_metadata?.setoutToleranceProfileSnapshot
    const toleranceProfile = resolveSetoutToleranceProfile(profileSnapshotValue)
    const hasProfileSnapshot = profileSnapshotValue != null
    if ((hasProfileSnapshot && (!toleranceProfile || !hasPointProfile && toleranceProfile.id !== design.tolerance_profile_id))
      || (!hasPointProfile && design.tolerance_profile_id != null && !toleranceProfile)) {
      return NextResponse.json(
        { error: 'The set-out definition has an invalid or mismatched tolerance profile snapshot. Rebuild and review the field definition before recording this shot.', code: 'SETOUT_TOLERANCE_PROFILE_INVALID' },
        { status: 409 }
      )
    }
    const originalHeight=design.point_metadata?.declaredHeightReference
    const recordedHeight=design.point_metadata!=null&&Object.prototype.hasOwnProperty.call(design.point_metadata,'declaredHeightReference')
      ? typeof originalHeight==='string'&&originalHeight.trim()?originalHeight:null
      : typeof design.definition_metadata?.declaredHeightReference==='string'&&design.definition_metadata.declaredHeightReference.trim()?design.definition_metadata.declaredHeightReference:null;
    const recordedCrs=typeof design.point_metadata?.projectCrs==='string'?design.point_metadata.projectCrs:design.definition_crs??null;
    if(recordedCrs!=null&&recordedCrs!==crs)return NextResponse.json({error:'The target revision belongs to a different coordinate reference. Review its original design.',code:'SETOUT_CRS_CHANGED'},{status:409});
    if(design.design_rl!=null && recordedHeight!=null && recordedHeight!==projectReference.verticalDatum)return NextResponse.json({error:'The project height reference changed after this target revision. Review the original design and reference before capturing against it.',code:'SETOUT_HEIGHT_REFERENCE_CHANGED'},{status:409});
    if(capturedProfileId!=null && capturedProfileId!==toleranceProfile?.id)return NextResponse.json({error:'The captured criterion changed or is not bound to this target revision. Keep this shot and review its original plan.',code:'SETOUT_CRITERIA_CHANGED'},{status:409});
    if(capturedVerticalDatum!=null && capturedVerticalDatum!==projectReference.verticalDatum)return NextResponse.json({error:'The captured height reference differs from the project reference. Keep this shot for review.',code:'SETOUT_HEIGHT_REFERENCE_CHANGED'},{status:409});

    let captureSnapshot: SetoutCaptureSnapshot
    try {
      captureSnapshot = createSetoutCaptureSnapshot({
        projectId, definitionId: body.definitionId, pointId: design.id, pointLabel: body.label, designRevision: Number(design.revision),
        horizontalCrs: crs, definitionCrs: recordedCrs, deviceCrs, verticalDatum: recordedHeight,
        capturedAt, design: { easting: Number(design.easting), northing: Number(design.northing), rl: design.design_rl == null ? null : Number(design.design_rl) },
        capturedDesign: { easting: capturedDesignE.value, northing: capturedDesignN.value, rl: capturedDesignRL.value },
        observed: { easting: observedE, northing: observedN, rl: observedRLValue.value }, reportedAccuracyM: accuracyValue.value, profile: toleranceProfile,
        reportedVerticalAccuracyM:verticalAccuracyValue.value,deviceVerticalDatum:capturedVerticalDatum,capturedToleranceProfileId:capturedProfileId,
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture evidence is invalid.', code: 'CAPTURE_EVIDENCE_INVALID' }, { status: 400 })
    }
    const shot = captureSnapshot.assessment;
    const activeTolerance=captureSnapshot.tolerance;
    const toleranceVersion=activeTolerance.version;

    let inserted:{rows:Array<{id:string}>};
    try { inserted = await db.query<{ id: string }>(
      `INSERT INTO setout_observations
         (project_id, definition_id, setout_point_id, label, design_easting, design_northing, design_rl,
          observed_easting, observed_northing, observed_rl, d_e, d_n, d_z, horizontal_error, vertical_error,
          reported_accuracy_m, tolerance_profile_id, tolerance_version, threshold_h, threshold_v, result, instrument,
          instrument_serial, operator_name, crew, observation_batch_id, staked_by, notes, client_shot_id, capture_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb)
       ON CONFLICT (project_id, client_shot_id) WHERE client_shot_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        projectId,
        body.definitionId,
        design.id,
        body.label,
        design.easting,
        design.northing,
        design.design_rl,
        observedE,
        observedN,
        observedRLValue.value,
        shot.dE,
        shot.dN,
        shot.dZ,
        shot.horizontalErrorM,
        shot.verticalErrorM,
        accuracyValue.value,
        toleranceProfile?.id ?? null,
        toleranceVersion,
        activeTolerance.horizontalM,
        activeTolerance.verticalM,
        shot.result,
        body.instrument ?? null,
        body.instrumentSerial ?? null,
        body.operatorName ?? null,
        body.crew ?? null,
        body.observationBatchId ?? null,
        userId,
        body.notes ?? null,
        clientShotId ?? null,
        JSON.stringify(captureSnapshot),
      ]
    ); } catch(error) {
      const detail=error&&typeof error==='object'?error as {code?:unknown;constraint?:unknown}:null;
      if(detail?.code==='23514'&&detail.constraint==='setout_capture_snapshot_shape')return NextResponse.json({error:'The server is not ready to store this version of capture evidence. Keep the observation on the device and retry after the service is updated.',code:'SETOUT_CAPTURE_SCHEMA_NOT_READY'},{status:503});
      throw error;
    }

    if (!inserted.rows[0]) {
      const concurrentDelivery = await findClientShot();
      if (concurrentDelivery) return concurrentDelivery;
      return NextResponse.json(
        { error: 'The shot upload conflicted but its saved record could not be loaded. Retry with the same clientShotId.', code: 'SETOUT_RETRY_REQUIRED' },
        { status: 503 }
      );
    }

    await recordEvidenceEvent({
      projectId,
      entityType: 'setout_point',
      entityId: inserted.rows[0].id,
      eventType: 'DERIVED',
      userId,
      details: {
        action: 'set_out',
        label: body.label,
        result: shot.result,
        design_revision: Number(design.revision),
        horizontal_error_mm: Number((shot.horizontalErrorM * 1000).toFixed(1)),
        vertical_error_mm: shot.verticalErrorM == null ? null : Number((shot.verticalErrorM * 1000).toFixed(1)),
        tolerance_profile_id: toleranceProfile?.id ?? null,
        tolerance_version: toleranceVersion,
        horizontal_tolerance_mm: activeTolerance.horizontalM==null?null:activeTolerance.horizontalM * 1000,
        vertical_tolerance_mm: activeTolerance.verticalM==null?null:activeTolerance.verticalM * 1000,
        tolerance_source: activeTolerance.source,
      },
    }).catch((error) => logger.error('[setout] evidence failed', { error }));

    return NextResponse.json(
      {
        data: {
          id: inserted.rows[0].id,
          designRevision: Number(design.revision),
          ...shot,
          toleranceProfileId: toleranceProfile?.id ?? null,
          toleranceVersion,
          tolerance: { horizontalM: activeTolerance.horizontalM, verticalM: activeTolerance.verticalM },
        },
      },
      { status: 201 }
    );
  }

  // record_verticality
  if (body.capturedBy !== undefined && body.capturedBy !== userId) {
    return NextResponse.json({ error: 'This device reading belongs to a different account. Sign in to the capturing account to deliver it.', code: 'CAPTURE_ACCOUNT_MISMATCH' }, { status: 403 });
  }
  const baseE = num(body.baseEasting);
  const baseN = num(body.baseNorthing);
  const topE = num(body.topEasting);
  const topN = num(body.topNorthing);
  if (!body.label || baseE == null || baseN == null || topE == null || topN == null) {
    return NextResponse.json(
      { error: 'label and the base/top centre coordinates are required' },
      { status: 400 }
    );
  }

  if (body.definitionId) {
    const { rows: definitionRows } = await db.query<{ id: string }>(
      'SELECT id FROM setout_definitions WHERE id = $1 AND project_id = $2',
      [body.definitionId, projectId]
    );
    if (!definitionRows[0]) {
      return NextResponse.json({ error: 'Definition not found', code: 'NOT_FOUND' }, { status: 404 });
    }
  }

  const baseLevel = optionalNum(body.baseRL), topLevel = optionalNum(body.topRL);
  const horizontalUncertainty = optionalNum(body.horizontalUncertaintyM), heightUncertainty = optionalNum(body.heightUncertaintyM);
  if (![baseLevel, topLevel, horizontalUncertainty, heightUncertainty].every(value => value.valid)) {
    return NextResponse.json({ error: 'Optional levels and uncertainties must be finite numbers or absent.' }, { status: 400 });
  }
  if (typeof body.clientReadingId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.clientReadingId)) {
    return NextResponse.json({ error: 'Generate a stable UUID clientReadingId before recording a plumb observation.' }, { status: 400 });
  }
  const schemaError = (error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    return code === '42703' ? NextResponse.json({ error: 'The plumb capture migration is not ready. Retain the original reading and retry with the same clientReadingId after deployment.', code: 'VERTICALITY_CAPTURE_SCHEMA_NOT_READY' }, { status: 503 }) : null;
  };
  let existing: { id: string; capture_snapshot: unknown } | undefined;
  try {
    existing = (await db.query<{ id: string; capture_snapshot: unknown }>('SELECT id, capture_snapshot FROM verticality_readings WHERE project_id = $1 AND client_reading_id = $2', [projectId, body.clientReadingId])).rows[0];
  } catch (error) { const response = schemaError(error); if (response) return response; throw error; }
  const stored = existing ? parseVerticalityCapture(existing.capture_snapshot) : null;
  if (existing && (!stored || stored.projectId !== projectId)) return NextResponse.json({ error: 'The saved reading evidence is inconsistent; review it before retrying.', code: 'VERTICALITY_REPLAY_CONFLICT' }, { status: 409 });
  let snapshot: VerticalityCaptureSnapshot;
  try {
    snapshot = createVerticalityCapture({ projectId, definitionId: body.definitionId ?? null, label: body.label, level: body.level ?? null,
      horizontalCrs: stored?.horizontalCrs ?? crs, capturedCrs: body.capturedCrs ?? null,
      verticalDatum: stored ? stored.verticalDatum : projectReference.verticalDatum, capturedVerticalDatum: body.capturedVerticalDatum ?? null, capturedAt: body.capturedAt ?? null,
      base: { easting: baseE, northing: baseN, rl: baseLevel.value }, top: { easting: topE, northing: topN, rl: topLevel.value },
      horizontalUncertaintyM: horizontalUncertainty.value, heightUncertaintyM: heightUncertainty.value, criteria: body.criteria ?? null, instrument: body.instrument ?? null, notes: body.notes ?? null });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid plumb capture evidence.' }, { status: 400 }); }
  const check = snapshot.assessment;
  if (existing) {
    if (!sameVerticalityEvidence(stored, snapshot)) return NextResponse.json({ error: 'This reading ID already belongs to different evidence. Retain the original and use a new ID for a new observation.', code: 'VERTICALITY_REPLAY_CONFLICT' }, { status: 409 });
    return NextResponse.json({ data: { id: existing.id, ...check, captureSnapshot: stored, replayed: true } });
  }
  const ratioText = check.tiltRatioKind === 'infinite' ? '1:inf' : check.tiltRatio === null ? null : `1:${Math.round(check.tiltRatio)}`;
  let inserted: { rows: Array<{ id: string }> };
  try { inserted = await db.query<{ id: string }>(
    `INSERT INTO verticality_readings
       (project_id, definition_id, label, level, base_easting, base_northing, base_rl,
        top_easting, top_northing, top_rl, offset_h, tilt_ratio, tolerance_ratio, result,
        instrument, observed_by, notes, capture_snapshot, client_reading_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
     ON CONFLICT (project_id, client_reading_id) WHERE client_reading_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      projectId,
      snapshot.definitionId,
      snapshot.label,
      snapshot.level,
      baseE,
      baseN,
      snapshot.base.rl,
      topE,
      topN,
      snapshot.top.rl,
      check.offsetM,
      ratioText,
      snapshot.criteria ? `1:${snapshot.criteria.minTiltRatio}` : null,
      check.result,
      snapshot.instrument,
      userId,
      snapshot.notes,
      JSON.stringify(snapshot),
      body.clientReadingId,
    ]
  ); } catch (error) { const response = schemaError(error); if (response) return response; throw error; }
  if (!inserted.rows[0]) {
    const concurrent = (await db.query<{ id: string; capture_snapshot: unknown }>('SELECT id, capture_snapshot FROM verticality_readings WHERE project_id = $1 AND client_reading_id = $2', [projectId, body.clientReadingId])).rows[0];
    const capture = concurrent ? parseVerticalityCapture(concurrent.capture_snapshot) : null;
    if (!concurrent || !capture || !sameVerticalityEvidence(capture, snapshot)) return NextResponse.json({ error: 'The concurrent reading uses different evidence.', code: 'VERTICALITY_REPLAY_CONFLICT' }, { status: 409 });
    return NextResponse.json({ data: { id: concurrent.id, ...capture.assessment, captureSnapshot: capture, replayed: true } });
  }

  await recordEvidenceEvent({
    projectId,
    entityType: 'verticality',
    entityId: inserted.rows[0].id,
    eventType: 'DERIVED',
    userId,
    details: {
      label: body.label,
      level: body.level ?? null,
      offset_mm: Number((check.offsetM * 1000).toFixed(1)),
      tilt_ratio: ratioText,
      result: check.result,
      capture_algorithm: snapshot.algorithm,
      scope: snapshot.scope,
      criteria: snapshot.criteria,
      evidence_issues: check.issues,
    },
  }).catch((error) => logger.error('[setout] verticality evidence failed', { error }));

  return NextResponse.json({ data: { id: inserted.rows[0].id, ...check, captureSnapshot: snapshot } }, { status: 201 });
});
