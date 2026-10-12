import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
export const dynamic = 'force-dynamic'
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  if (!z.string().uuid().safeParse(ctx.params.id).success) return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  const owner = (await db.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id=$1', [ctx.params.id])).rows[0]
  if (owner?.user_id !== ctx.userId) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const captures = (await db.query<Record<string, unknown>>('SELECT id,beacon_id,point_id,request_id,input_hash,source_snapshot,project_reference_snapshot,created_at FROM control_import_captures WHERE project_id=$1 AND actor_id=$2 ORDER BY created_at,id', [ctx.params.id, ctx.userId])).rows
  return NextResponse.json({ data: { captures, fieldVerified: false } }, { headers: { 'Cache-Control': 'private, no-store' } })
})
