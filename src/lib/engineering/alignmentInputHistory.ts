import type { PoolClient } from 'pg'
import type { OwnedAlignment } from './alignmentAccess'
import { recordDesignRevision } from './designRevisions'

/** Immutable raw-input snapshots, including the pre-repair legacy state. */
export async function recordAlignmentInputs(client: PoolClient, alignment: OwnedAlignment, kind: 'horizontal' | 'vertical' | 'stations', rows: Record<string, unknown>[], userId: string, phase: 'before' | 'saved') {
  const section = kind === 'horizontal' ? 'ips' : kind === 'vertical' ? 'vips' : 'stations'
  const { rows: project } = await client.query<{ canonical_inputs: unknown }>(
    'SELECT engineering_data #> $2::text[] AS canonical_inputs FROM projects WHERE id = $1', [alignment.project_id, ['road', section]])
  return recordDesignRevision({ projectId: alignment.project_id, discipline: 'road', entityType: `alignment-${kind}`,
    entityId: alignment.id, userId, crs: alignment.coordinate_system,
    summary: `${kind} inputs ${phase === 'before' ? 'before edit' : 'saved'} (draft)`,
    payload: { source: 'relational-alignment-inputs', phase, alignment, rows, canonicalInputs: project[0]?.canonical_inputs ?? null },
  }, client)
}
