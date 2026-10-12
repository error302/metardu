import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { resolveStageReference } from '@/lib/workspaces/stageReference'

const querySchema = z.object({ cursor: z.string().uuid().optional(), id: z.string().uuid().optional(), q: z.string().max(100).default(''), limit: z.coerce.number().int().min(1).max(50).default(25) })
export const dynamic = 'force-dynamic'
export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid project selection parameters' }, { status: 400 })
  const { cursor, limit, id, q } = parsed.data
  const result = await db.query<{ id: string; name: string; reference_row: Record<string, unknown> | null }>(
    `SELECT p.id,p.name,to_jsonb(prs) AS reference_row FROM projects p
      LEFT JOIN project_reference_systems prs ON prs.project_id=p.id
      WHERE p.user_id=$1 AND ($2::uuid IS NULL OR p.id>$2::uuid) AND ($4::uuid IS NULL OR p.id=$4::uuid) AND p.name ILIKE $5 ORDER BY p.id LIMIT $3`,
    [ctx.userId, cursor ?? null, limit + 1, id ?? null, `%${q}%`],
  )
  const hasMore = result.rows.length > limit, rows = result.rows.slice(0, limit)
  const projects = rows.map(row => {
    const reference = resolveStageReference(row.reference_row, {})
    return { id: row.id, name: row.name, horizontalCrs: reference.source === 'declared' ? reference.code : null, verticalDatum: reference.verticalDatum }
  })
  return NextResponse.json({ data: { projects, nextCursor: hasMore ? rows[rows.length - 1]?.id : null } }, { headers: { 'Cache-Control': 'private, no-store' } })
})
