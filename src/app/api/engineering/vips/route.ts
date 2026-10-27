export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { SaveVIPsSchema } from '@/lib/validation/apiSchemas'
import { ValidationError } from '@/lib/api/errors'
import { lockOwnedAlignment } from '@/lib/engineering/alignmentAccess'
import { recordAlignmentInputs } from '@/lib/engineering/alignmentInputHistory'
import { syncAlignmentProjectInputs, verifyAlignmentMirrorSnapshot } from '@/lib/engineering/alignmentProjectSync'

export const POST = apiHandler({ auth: true, schema: SaveVIPsSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { alignment_id, vips, replace, project_snapshot_hash } = ctx.body as z.infer<typeof SaveVIPsSchema>
  if (new Set(vips.map(v => v.chainage)).size !== vips.length) throw new ValidationError('VIP chainages must be unique.')
  const saved = await db.transaction(async client => {
    const alignment = await lockOwnedAlignment(client, alignment_id, ctx.userId)
    const mirrorOnly=await verifyAlignmentMirrorSnapshot(client,alignment,project_snapshot_hash)
    const { rows: before } = await client.query<Record<string, unknown>>('SELECT * FROM alignment_vertical_ips WHERE alignment_id = $1 ORDER BY chainage FOR UPDATE', [alignment_id])
    await recordAlignmentInputs(client, alignment, 'vertical', before, ctx.userId, 'before')
    for (const vip of vips) {
      await client.query<never>(`INSERT INTO alignment_vertical_ips (alignment_id, chainage, reduced_level, k_value, curve_length, gradient_in, gradient_out, source_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (alignment_id, chainage) DO UPDATE SET
        reduced_level=EXCLUDED.reduced_level, k_value=EXCLUDED.k_value,
        curve_length=CASE WHEN $9 THEN EXCLUDED.curve_length ELSE alignment_vertical_ips.curve_length END,
        gradient_in=CASE WHEN $10 THEN EXCLUDED.gradient_in ELSE alignment_vertical_ips.gradient_in END,
        gradient_out=CASE WHEN $11 THEN EXCLUDED.gradient_out ELSE alignment_vertical_ips.gradient_out END,
        source_id=COALESCE(EXCLUDED.source_id,alignment_vertical_ips.source_id), updated_at=NOW()`,
      [alignment_id, vip.chainage, vip.reduced_level, vip.k_value ?? null, vip.curve_length ?? null, vip.gradient_in ?? null, vip.gradient_out ?? null, vip.source_id ?? null,
        replace || 'curve_length' in vip, replace || 'gradient_in' in vip, replace || 'gradient_out' in vip])
    }
    if (replace) await client.query<never>('DELETE FROM alignment_vertical_ips WHERE alignment_id = $1 AND NOT (chainage = ANY($2::float8[]))', [alignment_id, vips.map(v => v.chainage)])
    const { rows } = await client.query<Record<string, unknown>>('SELECT * FROM alignment_vertical_ips WHERE alignment_id = $1 ORDER BY chainage', [alignment_id])
    await syncAlignmentProjectInputs(client, alignment, 'vips', rows, mirrorOnly)
    const { revision } = await recordAlignmentInputs(client, alignment, 'vertical', rows, ctx.userId, 'saved')
    return { data: rows, design_revision: revision.revision }
  })
  return NextResponse.json(saved)
})
