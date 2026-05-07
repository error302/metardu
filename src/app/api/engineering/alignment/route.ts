import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST: Save full road alignment for a project (upsert on project_id)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const {
      project_id,
      road_name,
      start_chainage,
      datum,
      coordinate_system,
      design_speed,
      road_class,
      terrain_type,
      standard,
      cross_section_template,
      road_reserve_width,
    } = body as {
      project_id: string
      road_name: string
      start_chainage: number
      datum: string
      coordinate_system: string
      design_speed: number
      road_class: string
      terrain_type?: string
      standard?: string
      cross_section_template: Record<string, unknown>
      road_reserve_width?: number
    }

    if (!project_id || !road_name) {
      return NextResponse.json({ error: 'Missing required fields: project_id, road_name' }, { status: 400 })
    }

    const { rows } = await db.query(
      `INSERT INTO road_alignments (
        project_id, road_name, start_chainage, datum, coordinate_system,
        design_speed, road_class, terrain_type, standard,
        cross_section_template, road_reserve_width
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (project_id) DO UPDATE SET
        road_name = EXCLUDED.road_name,
        start_chainage = EXCLUDED.start_chainage,
        datum = EXCLUDED.datum,
        coordinate_system = EXCLUDED.coordinate_system,
        design_speed = EXCLUDED.design_speed,
        road_class = EXCLUDED.road_class,
        terrain_type = EXCLUDED.terrain_type,
        standard = EXCLUDED.standard,
        cross_section_template = EXCLUDED.cross_section_template,
        road_reserve_width = EXCLUDED.road_reserve_width
       RETURNING *`,
      [
        project_id,
        road_name,
        start_chainage,
        datum,
        coordinate_system,
        design_speed,
        road_class,
        terrain_type,
        standard,
        JSON.stringify(cross_section_template),
        road_reserve_width,
      ]
    )

    return NextResponse.json({ data: rows[0] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/engineering/alignment] Error:', message)
    return NextResponse.json({ error: 'Failed to save alignment' }, { status: 500 })
  }
}

// GET: Retrieve alignment for a project including IPs, VIPs, and stations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing project_id query parameter' }, { status: 400 })
    }

    // Fetch the alignment
    const { rows: alignments } = await db.query(
      'SELECT * FROM road_alignments WHERE project_id = $1',
      [projectId]
    )

    if (alignments.length === 0) {
      return NextResponse.json({ data: null })
    }

    const alignment = alignments[0]

    // Fetch IPs for this alignment
    const { rows: ips } = await db.query(
      'SELECT * FROM alignment_ips WHERE alignment_id = $1 ORDER BY created_at ASC',
      [alignment.id]
    )

    // Fetch VIPs for this alignment
    const { rows: vips } = await db.query(
      'SELECT * FROM alignment_vertical_ips WHERE alignment_id = $1 ORDER BY chainage ASC',
      [alignment.id]
    )

    // Fetch stations for this alignment
    const { rows: stations } = await db.query(
      'SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage ASC',
      [alignment.id]
    )

    return NextResponse.json({
      data: {
        ...alignment,
        ips,
        vips,
        stations,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/engineering/alignment] Error:', message)
    return NextResponse.json({ error: 'Failed to fetch alignment' }, { status: 500 })
  }
}
