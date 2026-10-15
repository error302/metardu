import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { SaveIPsSchema } from '@/lib/validation/apiSchemas'
import { ValidationError } from '@/lib/api/errors'
import { calculateRoadHorizontal } from './roadHorizontalAlignment'
import type { OwnedAlignment } from './alignmentAccess'
import { recordAlignmentInputs } from './alignmentInputHistory'
import { syncAlignmentProjectInputs } from './alignmentProjectSync'

export type HorizontalInput = z.infer<typeof SaveIPsSchema>['ips'][number]
export const horizontalRowInput = (row: Record<string, unknown>): HorizontalInput => ({
  id: String(row.id), name: typeof row.name === 'string' ? row.name : '',
  ...(typeof row.source_id === 'string' ? { source_id: row.source_id } : {}),
  easting: row.easting == null ? NaN : Number(row.easting), northing: row.northing == null ? NaN : Number(row.northing), radius: row.radius == null ? NaN : Number(row.radius),
  has_transition: row.has_transition === true,
  transition_length_in: row.transition_length_in == null ? null : Number(row.transition_length_in),
  transition_length_out: row.transition_length_out == null ? null : Number(row.transition_length_out),
})

export async function saveHorizontalInputs(client: PoolClient, alignment: OwnedAlignment, inputs: HorizontalInput[], userId: string) {
  const { rows: previous } = await client.query<Record<string, unknown>>('SELECT * FROM alignment_ips WHERE alignment_id = $1 ORDER BY sort_order, created_at, id FOR UPDATE', [alignment.id])
  if (previous.length > 5000) throw new ValidationError('Review this large legacy alignment before replacing its input records.')
  const identities = inputs.flatMap(ip => ip.source_id ? [ip.source_id] : [])
  const ids = inputs.flatMap(ip => ip.id ? [ip.id] : [])
  if (new Set(identities).size !== identities.length || new Set(ids).size !== ids.length) throw new ValidationError('Input identities must be unique.')
  const points = inputs.map((ip, i) => ({ id: String(i), name: ip.name, easting: ip.easting, northing: ip.northing, radius: ip.radius,
    hasTransition: ip.has_transition, transitionLengthIn: ip.transition_length_in ?? undefined, transitionLengthOut: ip.transition_length_out ?? undefined }))
  const result = calculateRoadHorizontal(points, alignment.start_chainage == null ? NaN : Number(alignment.start_chainage), alignment.coordinate_system ?? '')
  const calculation = { status: !inputs.length ? 'empty' : result.issues.length ? 'needs-review' : 'ready', issues: inputs.length ? result.issues : [], length: result.length, version: 'project-horizontal-1' }
  await recordAlignmentInputs(client, alignment, 'horizontal', previous, userId, 'before')
  await client.query('DELETE FROM alignment_ips WHERE alignment_id = $1', [alignment.id])
  const saved: Record<string, unknown>[] = []
  const reusedIds = new Set<string>()
  for (let i = 0; i < inputs.length; i++) {
    const ip = inputs[i], curve = result.curves.find(c => c.ipId === String(i))
    let old = ip.id ? previous.find(row => row.id === ip.id) : ip.source_id ? previous.find(row => row.source_id === ip.source_id)
      : previous.find(row => row.name === ip.name && Number(row.easting) === ip.easting && Number(row.northing) === ip.northing)
    if (old && reusedIds.has(String(old.id))) old = undefined
    if (ip.id && !old) throw new ValidationError('The supplied IP row does not belong to this alignment; use source_id for new project inputs.')
    if (old) reusedIds.add(String(old.id))
    const metadata = { ...calculation, curve_type: curve?.kind ?? null, turn: curve?.turn ?? null,
      chainage_ts: curve?.chainageTS ?? null, chainage_sc: curve?.spiralAlignment?.scChainage ?? null,
      chainage_cs: curve?.spiralAlignment?.csChainage ?? null, chainage_st: curve?.chainageST ?? null, total_curve_length: curve?.totalLength ?? null }
    const { rows } = await client.query<Record<string, unknown>>(`INSERT INTO alignment_ips
      (id, alignment_id, name, easting, northing, radius, sort_order, has_transition, transition_length_in, transition_length_out, source_id,
       deflection_angle, tangent_length, arc_length, chainage_tc, chainage_mc, chainage_ct, spiral_parameters, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19::timestamptz,NOW())) RETURNING *`,
    [old?.id ?? randomUUID(), alignment.id, ip.name, ip.easting, ip.northing, ip.radius, i,
      ip.has_transition ?? Boolean((ip.transition_length_in ?? 0) > 0 || (ip.transition_length_out ?? 0) > 0), ip.transition_length_in ?? null, ip.transition_length_out ?? null, ip.source_id ?? old?.source_id ?? null,
      curve ? (curve.turn === 'right' ? 1 : -1) * curve.deflectionAngle : null, curve?.tangentLength ?? null, curve?.arcLength ?? null,
      curve?.spiralAlignment ? null : curve?.chainageTC ?? null, curve?.chainageMC ?? null, curve?.spiralAlignment ? null : curve?.chainageCT ?? null,
      JSON.stringify(metadata), old?.created_at ?? null])
    if (!rows[0]) throw new Error('An alignment IP was not saved.')
    saved.push(rows[0])
  }
  await syncAlignmentProjectInputs(client, alignment, 'ips', saved)
  const { revision } = await recordAlignmentInputs(client, alignment, 'horizontal', saved, userId, 'saved')
  return { data: saved, calculation, design_revision: revision.revision }
}
