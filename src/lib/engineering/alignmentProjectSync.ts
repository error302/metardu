import type { PoolClient } from 'pg'
import type { OwnedAlignment } from './alignmentAccess'
import { roadFromAlignmentMirror } from './roadAlignmentMirror'

/** Update only this selected design; retain unrelated project/input metadata. */
export async function syncAlignmentProjectInputs(client: PoolClient, alignment: OwnedAlignment, section: 'ips' | 'vips' | 'stations', rows: Record<string, unknown>[]) {
  const { rows: current } = await client.query<{ inputs: unknown }>(
    'SELECT engineering_data #> $2::text[] AS inputs FROM projects WHERE id = $1', [alignment.project_id, ['road', section]])
  const previous = Array.isArray(current[0]?.inputs) ? current[0].inputs as unknown[] : []
  const fresh = roadFromAlignmentMirror({ [section]: rows })[section]
  const inputs = fresh.map(input => {
    const key = section === 'stations' ? 'chainage' : 'id'
    const identity = (input as unknown as Record<string, unknown>)[key]
    const old = previous.find(value => value && typeof value === 'object' && (value as Record<string, unknown>)[key] === identity)
    const merged = { ...(old && typeof old === 'object' ? old : {}), ...input } as Record<string, unknown>
    // Cached reductions cannot survive an input change as adopted truth.
    const derived = section === 'ips' ? ['deflectionAngle','tangentLength','arcLength','chainageTC','chainageMC','chainageCT','computed']
      : section === 'vips' ? ['computed'] : ['cutArea','fillArea','cutVolume','fillVolume','cumulativeCut','cumulativeFill']
    for (const field of derived) delete merged[field]
    return merged
  })
  await client.query(`UPDATE projects SET engineering_data=jsonb_set(engineering_data,$2::text[],$3::jsonb,true),updated_at=NOW()
    WHERE id=$1 AND engineering_data #>> '{road,roadName}'=$4 AND jsonb_typeof(engineering_data->'road')='object'`,
  [alignment.project_id,['road',section],JSON.stringify(inputs),alignment.road_name])
}
