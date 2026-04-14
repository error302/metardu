import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const { data, error } = await supabase
    .from('cleaned_datasets')
    .insert({
      project_id: body.project_id,
      user_id: body.user_id,
      raw_data: body.raw_data,
      cleaned_data: body.cleaned_data,
      anomalies: body.anomalies,
      confidence_scores: body.confidence_scores,
      data_type: body.data_type
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}