import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeVerticalCurve } from '@/lib/engine/engineering'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pvIChainage, pvIElevation, gradeIn, gradeOut, length } = body

    if (pvIChainage === undefined || pvIElevation === undefined || gradeIn === undefined || gradeOut === undefined || length === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = computeVerticalCurve(pvIChainage, pvIElevation, gradeIn, gradeOut, length)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Vertical curve compute error:', error)
    return NextResponse.json({ error: 'Failed to compute curve' }, { status: 500 })
  }
}