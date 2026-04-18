import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'
import { computeHorizontalCurve } from '@/lib/engine/engineering'

export async function POST(request: NextRequest) {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { radius, delta, piChainage } = body

    if (radius === undefined || delta === undefined || piChainage === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = computeHorizontalCurve(radius, delta, piChainage)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Horizontal curve compute error:', error)
    return NextResponse.json({ error: 'Failed to compute curve' }, { status: 500 })
  }
}