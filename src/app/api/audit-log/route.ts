import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'
import { z } from 'zod'

const insertSchema = z.object({
  event_type: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
})

export async function GET() {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    const user = session?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await dbClient
      .from('audit_logs')
      .select('id, event_type, description, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data ?? [] })
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

    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    const user = session?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { event_type, description, metadata } = parsed.data

    const { data, error } = await dbClient
      .from('audit_logs')
      .insert({
        user_id: user.id,
        event_type,
        description,
        metadata: metadata ?? {},
      })
      .select('id, event_type, description, metadata, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // CPD Auto-logging hook
    const cpdEvents = [
      'plan_generated',
      'traverse_completed',
      'report_exported',
      'levelbook_completed'
    ]

    if (cpdEvents.includes(event_type)) {
      await dbClient.from('cpd_activities').insert({
        user_id: user.id,
        title: 'METARDU Professional Practice',
        provider: 'METARDU Platform — auto-logged',
        hours: 0.5,
        category: 'Technical Practice',
        source: 'METARDU Platform — auto-logged'
      })
    }

    return NextResponse.json({ log: data }, { status: 201 })
  } catch (error) {
    console.error('Audit log POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
