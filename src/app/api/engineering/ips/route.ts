export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { SaveIPsSchema, UpdateIPInputsSchema } from '@/lib/validation/apiSchemas'
import { NotFoundError } from '@/lib/api/errors'
import { lockOwnedAlignment } from '@/lib/engineering/alignmentAccess'
import { horizontalRowInput, saveHorizontalInputs } from '@/lib/engineering/alignmentHorizontalPersistence'
import { verifyAlignmentMirrorSnapshot } from '@/lib/engineering/alignmentProjectSync'

export const POST = apiHandler({ auth: true, schema: SaveIPsSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { alignment_id, ips, project_snapshot_hash } = ctx.body as z.infer<typeof SaveIPsSchema>
  const saved = await db.transaction(async client => {
    const alignment = await lockOwnedAlignment(client, alignment_id, ctx.userId)
    const mirrorOnly=await verifyAlignmentMirrorSnapshot(client,alignment,project_snapshot_hash)
    return saveHorizontalInputs(client, alignment, ips, ctx.userId, mirrorOnly)
  })
  return NextResponse.json(saved)
})

/** Edit design inputs only; never adopt caller-authored derived quantities. */
export const PUT = apiHandler({ auth: true, schema: UpdateIPInputsSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { id, ...change } = ctx.body as z.infer<typeof UpdateIPInputsSchema>
  const saved = await db.transaction(async client => {
    const { rows: found } = await client.query<{ alignment_id: string }>('SELECT alignment_id FROM alignment_ips WHERE id = $1', [id])
    if (!found[0]) throw new NotFoundError('Intersection point not found')
    const alignment = await lockOwnedAlignment(client, found[0].alignment_id, ctx.userId)
    await verifyAlignmentMirrorSnapshot(client,alignment)
    const { rows } = await client.query<Record<string, unknown>>('SELECT * FROM alignment_ips WHERE alignment_id = $1 ORDER BY sort_order, created_at, id FOR UPDATE', [alignment.id])
    if (!rows.some(row => row.id === id)) throw new NotFoundError('Intersection point no longer belongs to this alignment')
    const inputs = rows.map(row => row.id !== id ? horizontalRowInput(row) : { ...horizontalRowInput(row), ...change,
      ...(change.has_transition === false ? { transition_length_in: null, transition_length_out: null } : {}) })
    const valid = SaveIPsSchema.parse({ alignment_id: alignment.id, ips: inputs })
    const result = await saveHorizontalInputs(client, alignment, valid.ips, ctx.userId)
    return { ...result, data: result.data.find(row => row.id === id) }
  })
  return NextResponse.json(saved)
})
