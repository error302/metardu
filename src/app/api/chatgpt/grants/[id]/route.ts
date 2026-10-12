import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const DELETE = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60_000 } },
  async (_request, ctx) => {
    const params = await ctx.params
    const id = params?.id
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const revoked = await db.query<{ id: string }>(
      `UPDATE chatgpt_grants
          SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [id, ctx.userId],
    )
    if (!revoked.rows[0]) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    return NextResponse.json({ revoked: true }, { headers: { 'Cache-Control': 'no-store' } })
  },
)
