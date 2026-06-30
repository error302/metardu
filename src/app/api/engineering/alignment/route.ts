import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { CreateAlignmentSchema } from '@/lib/validation/apiSchemas'

// POST: Save full road alignment for a project (upsert on project_id)
export const POST = apiHandler({ auth: true, schema: CreateAlignmentSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
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
  } = ctx.body as z.infer<typeof CreateAlignmentSchema>

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
})

// GET: Retrieve alignment for a project including IPs, VIPs, and stations
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
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
})
