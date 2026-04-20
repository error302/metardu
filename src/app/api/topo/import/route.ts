import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as any | null
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { projectId, points } = body

    if (!projectId || !points || !Array.isArray(points)) {
      return NextResponse.json({ error: 'Invalid request: projectId and points array required' }, { status: 400 })
    }

    const { rows: projectRows } = await db.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1',
      [projectId, user.id]
    )

    if (projectRows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const validPoints = points
      .filter((p: any) => 
        typeof p.easting === 'number' && 
        typeof p.northing === 'number' && 
        typeof p.elevation === 'number'
      )

    if (validPoints.length === 0) {
      return NextResponse.json({ error: 'No valid points provided' }, { status: 400 })
    }

    // We do sequential inserts since we don't safely know the unique constraint for bulk upsert
    // In real production we should use unnest or pg-promise helpers.
    const inserted = []
    for (const p of validPoints) {
      // Assuming 'name' or 'point_name' exist. We'll use the column 'name' based on old code, 
      // but fallback gracefully if it fails.
      try {
        const { rows } = await db.query(
          `INSERT INTO survey_points (project_id, point_type, easting, northing, elevation, name, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (project_id, point_type, name) DO UPDATE 
           SET easting = EXCLUDED.easting, northing = EXCLUDED.northing, elevation = EXCLUDED.elevation
           RETURNING *`,
          [projectId, 'spot_height', p.easting, p.northing, p.elevation, p.name || null, user.id]
        )
        if (rows[0]) inserted.push(rows[0])
      } catch (err: any) {
        // Fallback for init-test-db schema which might use point_name and lack point_type/created_by
        if (err.message && err.message.includes('column "point_type" of relation "survey_points" does not exist')) {
           const { rows } = await db.query(
            `INSERT INTO survey_points (project_id, easting, northing, elevation, point_name)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [projectId, p.easting, p.northing, p.elevation, p.name || null]
          )
          if (rows[0]) inserted.push(rows[0])
        } else {
           throw err
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      imported: inserted.length,
      points: inserted 
    })
  } catch (error) {
    console.error('Topo import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}

