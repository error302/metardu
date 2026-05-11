import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  survey_type: z.string().min(1, 'Survey type is required'),
  location: z.string().optional().default(''),
  utm_zone: z.number().int().min(1).max(60).optional().default(37),
  hemisphere: z.enum(['N', 'S']).optional().default('S'),
  project_type: z.enum(['small', 'scheme']).optional().default('small'),
  client_name: z.string().optional(),
  surveyor_name: z.string().optional(),
  country: z.string().optional(),
  datum: z.string().optional(),
  scheme_number: z.string().optional(),
  county: z.string().optional(),
  sub_county: z.string().optional(),
  ward: z.string().optional(),
  planned_parcels: z.number().int().nonnegative().optional(),
  adjudication_section: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const validated = createProjectSchema.parse(body)

    const projectResult = await db.query(
      `INSERT INTO projects (user_id, name, survey_type, location, utm_zone, hemisphere,
        project_type, client_name, surveyor_name, country, datum, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       RETURNING id, name, survey_type, location, utm_zone, hemisphere, project_type, created_at`,
      [
        user.id, validated.name, validated.survey_type, validated.location,
        validated.utm_zone, validated.hemisphere, validated.project_type,
        validated.client_name ?? null, validated.surveyor_name ?? null,
        validated.country ?? null, validated.datum ?? null,
      ]
    )

    if (projectResult.rows.length === 0) {
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    const project = projectResult.rows[0] as Record<string, unknown>

    if (validated.project_type === 'scheme') {
      try {
        await db.query(
          `INSERT INTO scheme_details (project_id, scheme_number, county, sub_county, ward,
            planned_parcels, adjudication_section)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            project.id, validated.scheme_number ?? null, validated.county ?? null,
            validated.sub_county ?? null, validated.ward ?? null,
            validated.planned_parcels ?? 0, validated.adjudication_section ?? null,
          ]
        )
      } catch (schemeErr) {
        await db.query('DELETE FROM projects WHERE id = $1', [project.id])
        console.error('scheme_details insert failed:', schemeErr)
        return NextResponse.json({ error: 'Failed to create scheme details' }, { status: 500 })
      }
    }

    return NextResponse.json({ data: project }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Project creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await db.query(
      `SELECT id, name, survey_type, location, utm_zone, hemisphere, project_type,
              client_name, surveyor_name, country, datum, created_at
       FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    )

    return NextResponse.json({ data: result.rows })
  } catch (error) {
    console.error('Projects fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
