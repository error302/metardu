import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { WebhookEvent } from '@/lib/webhooks/types'
import { WEBHOOK_SECRET_PREFIX } from '@/lib/webhooks/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, events, name } = body

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: url, events (array)' },
        { status: 400 }
      )
    }

    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    const session = await getServerSession(authOptions)
    const user = session?.user as any | null
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = `${WEBHOOK_SECRET_PREFIX}${crypto.randomBytes(24).toString('hex')}`

    const { rows } = await db.query(
      `INSERT INTO webhooks (url, events, secret, name, user_id, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [url, JSON.stringify(events), secret, name || 'Webhook', user.id]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
    }

    const data = rows[0]

    return NextResponse.json({
      id: data.id,
      url: data.url,
      events: data.events,
      secret: data.secret,
      active: data.active,
      createdAt: data.created_at
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook creation failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as any | null
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { rows } = await db.query(
      'SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    )

    return NextResponse.json({ webhooks: rows || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch webhooks' },
      { status: 500 }
    )
  }
}
