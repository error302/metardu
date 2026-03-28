import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOpenJobs, createJob, getJobById } from '@/lib/supabase/community'
import { awardCPDPoints } from '@/lib/supabase/cpd'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobType = searchParams.get('jobType') || undefined
    const county = searchParams.get('county') || undefined
    const minBudget = searchParams.get('minBudget') ? parseFloat(searchParams.get('minBudget')!) : undefined
    const maxBudget = searchParams.get('maxBudget') ? parseFloat(searchParams.get('maxBudget')!) : undefined

    const jobs = await getOpenJobs({ jobType, county, minBudget, maxBudget })
    return NextResponse.json({ jobs })

  } catch (error) {
    console.error('Jobs GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const jobId = await createJob(body, user.id)

    return NextResponse.json({ jobId })

  } catch (error) {
    console.error('Jobs POST error:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}
