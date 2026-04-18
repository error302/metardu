import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    const { error } = await dbClient
      .from('network_adjustments')
      .upsert({
        project_id: params.id,
        stations: body.stations,
        observations: body.observations,
        adjusted_stations: body.adjusted_stations,
        summary: body.summary,
        status: body.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await dbClient
      .from('network_adjustments')
      .select('*')
      .eq('project_id', params.id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({ data: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}