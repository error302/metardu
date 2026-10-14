import { db } from '@/lib/db'
import { MAX_PLUMB_HISTORY_ROWS, type SavedPlumbRow } from './projectPlumbHistory'

export interface PlumbHistoryFilter { label: string | null; fromUtc: string | null; toUtc: string | null }
export async function loadProjectPlumbHistory(projectId: string, filter: PlumbHistoryFilter): Promise<SavedPlumbRow[]> {
  const { rows } = await db.query<SavedPlumbRow>(
    `SELECT v.*, p.name AS project_name,
            to_jsonb(v)->'capture_snapshot' AS capture_snapshot,
            to_jsonb(v)->>'client_reading_id' AS client_reading_id
       FROM verticality_readings v JOIN projects p ON p.id = v.project_id
      WHERE v.project_id = $1
        AND ($2::text IS NULL OR v.label = $2)
        AND ($3::timestamptz IS NULL OR v.observed_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR v.observed_at <= $4::timestamptz)
      ORDER BY v.label, v.level NULLS FIRST, v.observed_at, v.id
      LIMIT $5`, [projectId, filter.label, filter.fromUtc, filter.toUtc, MAX_PLUMB_HISTORY_ROWS + 1])
  return rows
}
