import Papa from 'papaparse'
import { db } from '@/lib/db'
import { captureForSavedShot } from './projectSetoutEvidence'
export { captureForSavedShot } from './projectSetoutEvidence'

export interface SavedShotRow {
  id: string; project_id: string; definition_id: string; definition_name: string;
  definition_crs: string | null; design_revision: number | null; setout_point_id: string | null; label: string;
  design_easting: number | string; design_northing: number | string; design_rl: number | string | null;
  observed_easting: number | string; observed_northing: number | string; observed_rl: number | string | null;
  d_e: number | string | null; d_n: number | string | null; d_z: number | string | null;
  horizontal_error: number | string | null; vertical_error: number | string | null;
  threshold_h: number | string | null; threshold_v: number | string | null;
  result: string; reported_accuracy_m: number | string | null;
  tolerance_profile_id: string | null; tolerance_version: string | null;
  instrument: string | null; instrument_serial: string | null; operator_name: string | null; crew: string | null;
  observation_batch_id: string | null; staked_by: string | null; staked_at: Date | string;
  notes: string | null; client_shot_id: string | null;
  capture_snapshot?: unknown;
  /** Context on the saved target row, separate from the observation snapshot. */
  target_metadata?: unknown;
  target_revision?: number | null;
}

function numberCell(value: number | string | null): number | string {
  if (value == null) return ''
  if (typeof value === 'string' && !value.trim()) throw new Error('Stored shot has a blank numeric value.')
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('Stored shot contains an invalid number; review the record before export.')
  return parsed
}

/** Saved history, including re-stakes. This does not recompute acceptance from rounded storage. */
export async function loadProjectSetoutShots(projectId: string, definitionId: string, revision: number | null): Promise<SavedShotRow[]> {
  const { rows } = await db.query<SavedShotRow>(
    `SELECT o.*, d.name AS definition_name, d.crs AS definition_crs,
            p.metadata AS target_metadata, p.revision AS target_revision,
            COALESCE((o.capture_snapshot->>'designRevision')::integer, p.revision) AS design_revision
       FROM setout_observations o
       JOIN setout_definitions d ON d.id = o.definition_id AND d.project_id = o.project_id
       LEFT JOIN setout_points p ON p.id = o.setout_point_id AND p.definition_id = d.id
      WHERE d.id = $1 AND d.project_id = $2 AND o.project_id = $2
        AND ($3::integer IS NULL OR COALESCE((o.capture_snapshot->>'designRevision')::integer, p.revision) = $3)
      ORDER BY design_revision NULLS FIRST, o.label, o.staked_at, o.created_at, o.id
      LIMIT $4`,
    [definitionId, projectId, revision, 10001],
  )
  return rows
}

export async function exportProjectSetoutCsv(projectId: string, definitionId: string, revision: number | null) {
  const rows = await loadProjectSetoutShots(projectId, definitionId, revision)
  if (!rows.length) return { csv: null, count: 0 }
  if (rows.length > 10000) return { csv: null, count: rows.length }
  const columns = [
    'Project_ID', 'Definition_ID', 'Definition_Name', 'Design_Revision', 'Observation_ID', 'Design_Point_ID', 'Point_ID',
    'Design_E_m', 'Design_N_m', 'Design_RL_m', 'Observed_E_m', 'Observed_N_m', 'Observed_RL_m',
    'Delta_E_m', 'Delta_N_m', 'Delta_RL_m', 'Recorded_H_Error_m', 'Recorded_V_Error_m',
    'Recorded_H_Tolerance_m', 'Recorded_V_Tolerance_m', 'Recorded_Status', 'Reported_H_Accuracy_m',
    'Tolerance_Profile_ID', 'Tolerance_Version', 'Current_Definition_CRS', 'Capture_CRS_Evidence', 'Export_Assessment',
    'Capture_CRS', 'Capture_Vertical_Datum', 'Device_Capture_At_UTC', 'Capture_Time_Source', 'Assessment_Algorithm', 'Assessment_Version',
    'Instrument', 'Instrument_Serial', 'Operator', 'Crew', 'Observation_Batch_ID', 'Recorded_By_Account_ID',
    'Server_Recorded_At_UTC', 'Device_Shot_ID', 'Notes',
    'Capture_Schema_Version','Reported_V_Accuracy_m','Captured_Criteria_ID','Observed_Height_Reference','Numerical_Eligibility_Issues',
  ]
  const values = rows.map((row) => {
    const recorded = new Date(row.staked_at)
    if (!Number.isFinite(recorded.getTime())) throw new Error('Stored shot has an invalid recording timestamp.')
    if (!['PASS', 'WARN', 'FAIL', 'INFO'].includes(row.result)) throw new Error('Stored shot has an invalid recorded assessment.')
    const snapshot = captureForSavedShot(row)
    const measurement = snapshot ? [snapshot.design.easting, snapshot.design.northing, snapshot.design.rl,
      snapshot.observed.easting, snapshot.observed.northing, snapshot.observed.rl,
      snapshot.assessment.dE, snapshot.assessment.dN, snapshot.assessment.dZ, snapshot.assessment.horizontalErrorM,
      snapshot.assessment.verticalErrorM, snapshot.tolerance.horizontalM, snapshot.tolerance.verticalM] :
      [row.design_easting, row.design_northing, row.design_rl, row.observed_easting, row.observed_northing, row.observed_rl,
        row.d_e, row.d_n, row.d_z, row.horizontal_error, row.vertical_error, row.threshold_h, row.threshold_v]
    return [
      row.project_id, row.definition_id, row.definition_name, row.design_revision ?? '', row.id, row.setout_point_id ?? '', row.label,
      ...measurement.map(numberCell),
      row.result, numberCell(snapshot ? snapshot.reportedAccuracyM : row.reported_accuracy_m), row.tolerance_profile_id ?? '', row.tolerance_version ?? '',
      row.definition_crs ?? '', snapshot?.horizontalCrsEvidence ?? 'Not stored with observation', 'Not reassessed; recorded status is historical',
      snapshot?.horizontalCrs ?? '', snapshot?.verticalDatum ?? '', snapshot?.capturedAt ?? '', snapshot?.captureTimeSource ?? 'not_stored',
      snapshot?.algorithm.id ?? '', snapshot?.algorithm.version ?? '', row.instrument ?? '', row.instrument_serial ?? '',
      row.operator_name ?? '', row.crew ?? '', row.observation_batch_id ?? '', row.staked_by ?? '',
      recorded.toISOString(), row.client_shot_id ?? '', row.notes ?? '',
      snapshot?.schemaVersion??'',snapshot?.schemaVersion===2?numberCell(snapshot.reportedVerticalAccuracyM):'',snapshot?.schemaVersion===2?snapshot.capturedToleranceProfileId??'':'',snapshot?.schemaVersion===2?snapshot.deviceVerticalDatum??'':'',snapshot?.schemaVersion===2?snapshot.acceptance.issues.join(' '):'Current capture prerequisites were not stored',
    ]
  })
  return { csv: Papa.unparse({ fields: columns, data: values }, { escapeFormulae: true }), count: rows.length }
}
