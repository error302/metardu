import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { projectId, documentId } = body as { projectId?: string; documentId?: string };

  if (!projectId || !documentId) {
    return NextResponse.json({ error: 'Missing projectId or documentId' }, { status: 400 });
  }

  const { rows } = await db.query(
    'SELECT id, survey_type FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1',
    [projectId, (session.user as any).id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = rows[0];

  await db.query(
    `INSERT INTO submission_documents (project_id, document_id, status, error_message)
     VALUES ($1, $2, 'generating', null)
     ON CONFLICT (project_id, document_id) 
     DO UPDATE SET status = 'generating', error_message = null`,
    [projectId, documentId]
  );

  try {
    const { generateDocument } = await import('@/lib/submission/assembleDocument');
    const result = await generateDocument({ projectId, documentId, surveyType: project.survey_type });

    await db.query(
      `INSERT INTO submission_documents (project_id, document_id, status, file_url, error_message, generated_at)
       VALUES ($1, $2, 'ready', $3, null, $4)
       ON CONFLICT (project_id, document_id) 
       DO UPDATE SET status = 'ready', file_url = $3, error_message = null, generated_at = $4`,
      [projectId, documentId, result.fileUrl, new Date().toISOString()]
    );

    return NextResponse.json({ success: true, fileUrl: result.fileUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    
    await db.query(
      `INSERT INTO submission_documents (project_id, document_id, status, error_message)
       VALUES ($1, $2, 'error', $3)
       ON CONFLICT (project_id, document_id) 
       DO UPDATE SET status = 'error', error_message = $3`,
      [projectId, documentId, message]
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}