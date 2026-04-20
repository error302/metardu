import db from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { transformCoordinates, TransformInput } from '@/lib/geo/transform';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: TransformInput & { projectId?: string } = await req.json();

  if (!body.points?.length || !body.fromCRS || !body.toCRS) {
    return NextResponse.json({ error: 'Missing points, fromCRS, or toCRS' }, { status: 400 });
  }

  if (body.points.length > 5000) {
    return NextResponse.json({ error: 'Maximum 5000 points per request' }, { status: 400 });
  }

  try {
    const result = transformCoordinates(body);

    await db.query(
      `INSERT INTO online_service_logs (
        user_id, project_id, service, input_summary, status
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        (session.user as any).id,
        body.projectId ?? null,
        'coordinate-transform',
        `${body.points.length} points, ${body.fromCRS} → ${body.toCRS}`,
        'success'
      ]
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
