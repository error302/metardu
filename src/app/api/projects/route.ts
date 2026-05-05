import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  surveyType: z.string().min(1, 'Survey type is required'),
  location: z.string().min(1, 'Location is required'),
  utmZone: z.number().int().min(1).max(60).optional(),
  hemisphere: z.string().optional(),
  project_type: z.enum(['small', 'scheme']).optional().default('small'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = createProjectSchema.parse(body)

    // Create project in database using existing table structure
    const projectQuery = `
      INSERT INTO projects (
        user_id,
        name,
        survey_type,
        location,
        utm_zone,
        hemisphere,
        project_type,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, created_at
    `

    const values = [
      session.user.id,
      validatedData.name,
      validatedData.surveyType,
      validatedData.location,
      validatedData.utmZone || 36, // Default to UTM Zone 36 (Kenya)
      validatedData.hemisphere || 'N',
      validatedData.project_type,
    ]

    const result = await db.query(projectQuery, values)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      )
    }

    const project = result.rows[0]

    return NextResponse.json({
      id: project.id,
      name: validatedData.name,
      surveyType: validatedData.surveyType,
      location: validatedData.location,
      utmZone: validatedData.utmZone || 36,
      hemisphere: validatedData.hemisphere || 'N',
      status: 'active',
      project_type: validatedData.project_type,
      createdAt: project.created_at
    })

  } catch (error) {
    console.error('Project creation error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's projects — include project_type
    const projectsQuery = `
      SELECT id, name, survey_type, location, utm_zone, hemisphere, project_type, created_at
      FROM projects
      WHERE user_id = $1
      ORDER BY created_at DESC
    `

    const result = await db.query(projectsQuery, [session.user.id])

    return NextResponse.json({
      projects: result.rows
    })

  } catch (error) {
    console.error('Projects fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
