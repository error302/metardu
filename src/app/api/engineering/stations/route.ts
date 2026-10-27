export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { SaveStationsSchema } from '@/lib/validation/apiSchemas'
import { ValidationError } from '@/lib/api/errors'
import { alignmentReadAccess, lockOwnedAlignment } from '@/lib/engineering/alignmentAccess'
import { recordAlignmentInputs } from '@/lib/engineering/alignmentInputHistory'
import { syncAlignmentProjectInputs, verifyAlignmentMirrorSnapshot } from '@/lib/engineering/alignmentProjectSync'
import { interpolateProfile, validateProfile } from '@/lib/engineering/profileGeometry'

export const POST = apiHandler({ auth: true, schema: SaveStationsSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { alignment_id, stations, replace, project_snapshot_hash } = ctx.body as z.infer<typeof SaveStationsSchema>
  if (new Set(stations.map(s => s.chainage)).size !== stations.length) throw new ValidationError('Station chainages must be unique.')
  for (const station of stations) {
    if (station.ground_profile) {
      try {
        const ground = validateProfile(station.ground_profile), centre = interpolateProfile(ground, 0)
        if (centre != null && Math.abs(centre - station.ground_level) > 1e-6) throw new Error('The measured profile disagrees with the supplied centreline ground RL.')
      } catch (error) { throw new ValidationError(error instanceof Error ? error.message : 'Review the measured profile.') }
    }
  }
  const saved = await db.transaction(async client => {
    const alignment = await lockOwnedAlignment(client, alignment_id, ctx.userId)
    const mirrorOnly=await verifyAlignmentMirrorSnapshot(client,alignment,project_snapshot_hash)
    const { rows: before } = await client.query<Record<string, unknown>>('SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage FOR UPDATE', [alignment_id])
    await recordAlignmentInputs(client, alignment, 'stations', before, ctx.userId, 'before')
    for (const station of stations) {
      const ground = { level: station.ground_level, ...('ground_profile' in station || replace ? { profile: station.ground_profile ?? null } : {}) }
      const design = {
        ...('design_level' in station || replace ? { designLevel: station.design_level ?? null } : {}),
        ...('design_level_source' in station || replace ? { designLevelSource: station.design_level_source ?? 'manual' } : {}),
      }
      await client.query<never>(`INSERT INTO cross_section_stations (alignment_id, chainage, ground_level, existing_ground, proposed_road)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT (alignment_id, chainage) DO UPDATE SET
        ground_level=EXCLUDED.ground_level,
        existing_ground=COALESCE(cross_section_stations.existing_ground,'{}'::jsonb) || EXCLUDED.existing_ground,
        proposed_road=COALESCE(cross_section_stations.proposed_road,'{}'::jsonb) || EXCLUDED.proposed_road, updated_at=NOW()`,
      [alignment_id, station.chainage, station.ground_level, JSON.stringify(ground), JSON.stringify(design)])
    }
    if (replace) await client.query<never>('DELETE FROM cross_section_stations WHERE alignment_id = $1 AND NOT (chainage = ANY($2::float8[]))', [alignment_id, stations.map(s => s.chainage)])
    const { rows } = await client.query<Record<string, unknown>>('SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage', [alignment_id])
    await syncAlignmentProjectInputs(client, alignment, 'stations', rows, mirrorOnly)
    const { revision } = await recordAlignmentInputs(client, alignment, 'stations', rows, ctx.userId, 'saved')
    return { data: rows, design_revision: revision.revision }
  })
  return NextResponse.json(saved)
})

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const id = new URL(req.url).searchParams.get('alignment_id')
  if (!id) return NextResponse.json({ error: 'Missing alignment_id query parameter' }, { status: 400 })
  const access = await alignmentReadAccess(id, ctx.userId)
  if (!access.ok) {
    if (!access.error) throw new Error('Alignment access could not be verified.')
    return access.error
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage ASC', [id])
  return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'private, no-store' } })
})
