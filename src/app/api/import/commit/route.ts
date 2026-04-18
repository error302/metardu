import { createClient } from '@/lib/api-client/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const dbClient = await createClient();
  const { data: { session } } = await dbClient.auth.getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId, entries, adjustedLegs, fileName, relativePrecision } = await req.json() as {
    projectId: string;
    entries: Array<{
      station: string;
      bearing?: number;
      distance?: number;
      deltaE?: number;
      deltaN?: number;
      description?: string;
    }>;
    adjustedLegs?: Array<{
      from: string;
      to: string;
      length: number;
      bearing: number;
      correctedLat?: number;
      correctedDep?: number;
    }>;
    fileName?: string;
    relativePrecision?: string;
  };

  if (!projectId || !entries || entries.length === 0) {
    return NextResponse.json({ error: 'Missing projectId or entries' }, { status: 400 });
  }

  const { data: project } = await dbClient
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', session.user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: importSession } = await dbClient
    .from('import_sessions')
    .insert({
      project_id: projectId,
      file_name: fileName || 'unknown',
      format: 'csv',
      row_count: entries.length,
      status: 'committed',
    })
    .select()
    .single();

  const { data: existing } = await dbClient
    .from('project_fieldbook_entries')
    .select('row_index')
    .eq('project_id', projectId)
    .order('row_index', { ascending: false })
    .limit(1);

  const startIndex = (existing?.[0]?.row_index ?? -1) + 1;

  const fieldbookEntries = entries.map((entry, idx) => {
    const adjusted = adjustedLegs?.[idx];
    return {
      project_id: projectId,
      row_index: startIndex + idx,
      station: entry.station || (entry as Record<string, unknown>).from as string || `P${idx + 1}`,
      bearing: adjusted?.bearing ?? entry.bearing ?? 0,
      distance: adjusted?.length ?? entry.distance ?? 0,
      raw_data: {
        ...entry,
        correctedLat: adjusted?.correctedLat,
        correctedDep: adjusted?.correctedDep,
        deltaE: entry.deltaE,
        deltaN: entry.deltaN,
        relativePrecision,
      },
      import_session_id: importSession?.id ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await dbClient
    .from('project_fieldbook_entries')
    .upsert(fieldbookEntries, { onConflict: 'project_id,row_index' });

  if (error) {
    console.error('Import commit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await dbClient
    .from('projects')
    .update({ last_fieldbook_update: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({ 
    success: true, 
    imported: entries.length,
    message: `Committed ${entries.length} entries. Precision: ${relativePrecision || 'N/A'}` 
  });
}
