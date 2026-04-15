import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table')
  const projectId = searchParams.get('projectId')

  if (!table || !projectId) {
    return NextResponse.json({ error: 'Missing table or projectId' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const result = await supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })

    return NextResponse.json({ data: (result as any).data || [], error: (result as any).error })
  } catch (err: any) {
    return NextResponse.json({ data: [], error: err.message }, { status: 500 })
  }
}
