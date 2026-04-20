import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const insertSchema = z.object({
  event_type: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as any | null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Mapping table columns: action -> event_type, details -> metadata
    const { rows } = await db.query(
      `SELECT id, action as event_type, details as description, details as metadata, created_at 
       FROM audit_logs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [user.id]
    )

    return NextResponse.json({ logs: rows })
  } catch (error) {
    console.error('Audit log GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = insertSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const user = session?.user as any | null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { event_type, description, metadata } = parsed.data

    const { rows } = await db.query(
      `INSERT INTO audit_logs (
        user_id, action, details
      ) VALUES ($1, $2, $3)
      RETURNING id, action as event_type, details as description, details as metadata, created_at`,
      [user.id, event_type, JSON.stringify({ description, ...((metadata as any) || {}) })]
    )

    const data = rows[0]

    // CPD Auto-logging hook
    const cpdEvents = [
      'plan_generated',
      'traverse_completed',
      'report_exported',
      'levelbook_completed'
    ]

    if (cpdEvents.includes(event_type)) {
      // Assuming cpd_activities exists, if not this might throw but it's consistent with old code
      try {
        await db.query(
          `INSERT INTO cpd_activities (
            user_id, title, provider, hours, category, source
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, 'METARDU Professional Practice', 'METARDU Platform — auto-logged', 0.5, 'Technical Practice', 'METARDU Platform — auto-logged']
        )
      } catch (e) {
        console.warn('Could not insert CPD activity (table might not exist)', e)
      }
    }

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (error) {
    console.error('Audit log POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
