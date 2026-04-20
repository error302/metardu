import db from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
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

  const projectRes = await db.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, (session.user as any).id]
  );
  const project = projectRes.rows[0];

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const sessionRes = await db.query(
    `INSERT INTO import_sessions (
      project_id, file_name, format, row_count, status
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [projectId, fileName || 'unknown', 'csv', entries.length, 'committed']
  );
  const importSessionId = sessionRes.rows[0]?.id;

  const existingRes = await db.query(
    'SELECT row_index FROM project_fieldbook_entries WHERE project_id = $1 ORDER BY row_index DESC LIMIT 1',
    [projectId]
  );
  const startIndex = (existingRes.rows[0]?.row_index ?? -1) + 1;

  try {
    await db.query('BEGIN');
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const adjusted = adjustedLegs?.[i];
      const rowIndex = startIndex + i;
      
      await db.query(
        `INSERT INTO project_fieldbook_entries (
          project_id, row_index, station, bearing, distance, raw_data, import_session_id, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (project_id, row_index) DO UPDATE SET
          station = EXCLUDED.station,
          bearing = EXCLUDED.bearing,
          distance = EXCLUDED.distance,
          raw_data = EXCLUDED.raw_data,
          import_session_id = EXCLUDED.import_session_id,
          updated_at = EXCLUDED.updated_at`,
        [
          projectId,
          rowIndex,
          entry.station || (entry as any).from as string || `P${i + 1}`,
          adjusted?.bearing ?? entry.bearing ?? 0,
          adjusted?.length ?? entry.distance ?? 0,
          JSON.stringify({
            ...entry,
            correctedLat: adjusted?.correctedLat,
            correctedDep: adjusted?.correctedDep,
            deltaE: entry.deltaE,
            deltaN: entry.deltaN,
            relativePrecision,
          }),
          importSessionId,
          new Date().toISOString()
        ]
      );
    }

    await db.query(
      'UPDATE projects SET last_fieldbook_update = $1 WHERE id = $2',
      [new Date().toISOString(), projectId]
    );

    await db.query('COMMIT');

    return NextResponse.json({ 
      success: true, 
      imported: entries.length,
      message: `Committed ${entries.length} entries. Precision: ${relativePrecision || 'N/A'}` 
    });
  } catch (error: any) {
    await db.query('ROLLBACK');
    console.error('Import commit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
