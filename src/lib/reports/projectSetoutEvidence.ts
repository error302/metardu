import { parseSetoutCaptureSnapshot, type SetoutCaptureSnapshot } from '@/lib/field/setoutCapture'
import type { SavedShotRow } from './projectSetoutCsv'

/** Pure capture validation, shared by CSV/HTML/PDF without initializing database configuration. */
export function captureForSavedShot(row: SavedShotRow): SetoutCaptureSnapshot | null {
  if (row.capture_snapshot == null) return null
  const snapshot = parseSetoutCaptureSnapshot(row.capture_snapshot)
  if (!snapshot || snapshot.projectId !== row.project_id || snapshot.definitionId !== row.definition_id
    || snapshot.pointId !== row.setout_point_id || snapshot.pointLabel !== row.label
    || snapshot.designRevision !== row.design_revision || snapshot.assessment.result !== row.result
    || snapshot.tolerance.version !== row.tolerance_version || (snapshot.tolerance.profile?.id ?? null) !== row.tolerance_profile_id) {
    throw new Error('Stored capture evidence is inconsistent or unsupported; review the observation before exporting it.')
  }
  return snapshot
}
