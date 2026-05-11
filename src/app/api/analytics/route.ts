import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { z } from 'zod'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    const schema = z.object({
      event: z.string().min(1).max(80).regex(/^[a-z0-9._:-]+$/i),
      properties: z.record(z.unknown()).optional(),
      url: z.string().max(2048).optional(),
    })

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid analytics payload', issues: parsed.error.issues }, { status: 400 })
    }

    const { event, properties, url } = parsed.data
    const user = await getAuthUser()

    const safeProps: Record<string, unknown> = {}
    if (properties) {
      const keys = Object.keys(properties).slice(0, 50)
      for (const k of keys) {
        const v = properties[k]
        if (typeof v === 'string') safeProps[k] = v.slice(0, 500)
        else if (typeof v === 'number' || typeof v === 'boolean' || v === null) safeProps[k] = v
        else safeProps[k] = JSON.stringify(v).slice(0, 500)
      }
    }

    await db.query(
      `INSERT INTO audit_logs (
        action, details, user_id, table_name
      ) VALUES ($1, $2, $3, $4)`,
      [event, JSON.stringify({ properties: safeProps, url: url ?? '' }), user?.id ?? null, 'analytics_events']
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Failed to track event' }, { status: 500 })
  }
}
