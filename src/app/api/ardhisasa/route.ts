import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createArdhisasaClient, isArdhisasaConfigured, getArdhisasaStatus } from '@/lib/integrations/ardhisasaClient'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Status check
    if (action === 'status') {
      return NextResponse.json({ success: true, data: getArdhisasaStatus() })
    }

    // Check configuration
    if (action === 'configured') {
      return NextResponse.json({ success: true, data: { configured: isArdhisasaConfigured() } })
    }

    // Get supported counties
    if (action === 'counties') {
      if (!isArdhisasaConfigured()) {
        return NextResponse.json({ error: 'ARDHISASA integration not configured.' }, { status: 400 })
      }
      const client = createArdhisasaClient()
      const counties = await client.getSupportedCounties()
      return NextResponse.json({ success: true, data: counties })
    }

    // Get plan types
    if (action === 'plan-types') {
      if (!isArdhisasaConfigured()) {
        return NextResponse.json({ error: 'ARDHISASA integration not configured.' }, { status: 400 })
      }
      const client = createArdhisasaClient()
      const planTypes = await client.getPlanTypes()
      return NextResponse.json({ success: true, data: planTypes })
    }

    // Get submission requirements
    if (action === 'requirements') {
      const planType = searchParams.get('planType')
      if (!planType) {
        return NextResponse.json({ error: 'Missing planType parameter.' }, { status: 400 })
      }
      if (!isArdhisasaConfigured()) {
        return NextResponse.json({ error: 'ARDHISASA integration not configured.' }, { status: 400 })
      }
      const client = createArdhisasaClient()
      const requirements = await client.getSubmissionRequirements(planType)
      return NextResponse.json({ success: true, data: requirements })
    }

    return NextResponse.json({ error: 'Unknown action. Use: status, configured, counties, plan-types, requirements' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ARDHISASA request failed.'
    console.error('[ardhisasa] Error:', message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    if (!isArdhisasaConfigured()) {
      return NextResponse.json({ error: 'ARDHISASA integration not configured. Set ARDHISASA_API_KEY, ARDHISASA_CLIENT_ID, and ARDHISASA_CLIENT_SECRET environment variables.' }, { status: 400 })
    }

    const { action, data } = await request.json()
    const client = createArdhisasaClient()

    if (action === 'submit') {
      const result = await client.submitPlan(data)
      return NextResponse.json({ success: true, data: result })
    }

    if (action === 'search') {
      const results = await client.searchRecords(data || {})
      return NextResponse.json({ success: true, data: results })
    }

    if (action === 'validate') {
      const validation = await client.validateSubmission(data)
      return NextResponse.json({ success: true, data: validation })
    }

    if (action === 'status') {
      const { submissionId } = data || {}
      if (!submissionId) {
        return NextResponse.json({ error: 'Missing submissionId.' }, { status: 400 })
      }
      const result = await client.getSubmissionStatus(submissionId)
      return NextResponse.json({ success: true, data: result })
    }

    return NextResponse.json({ error: 'Unknown action. Use: submit, search, validate, status' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ARDHISASA request failed.'
    console.error('[ardhisasa] POST Error:', message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
