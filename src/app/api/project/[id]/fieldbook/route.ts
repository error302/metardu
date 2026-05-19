import { createClient } from '@/lib/api-client/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_fieldbook_entries')
    .select('*')
    .eq('project_id', params.id)
    .order('row_index', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
