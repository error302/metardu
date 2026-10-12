import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { extractProjectMapDrainageAlignments } from '@/lib/engineering/projectMapDrainageAlignments'
import { assertProjectedCrs, resolveEpsg } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'

export const dynamic = 'force-dynamic'

interface ProjectRow {
  utm_zone: number | null
  hemisphere: string | null
  datum: string | null
  drawn_features: unknown
}

/** Read saved project LineStrings and transform them into the declared project CRS. */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (_req, ctx) => {
    const projectId = ctx.params.id
    if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 })

    const access = await requireProjectReadAccess(projectId, ctx.userId)
    if (!access.ok) {
      if (!access.error) throw new Error('Project read-access check failed without an error response')
      return access.error
    }

    const { rows: projectRows } = await db.query<ProjectRow>(
      `SELECT utm_zone, hemisphere, datum,
              boundary_data -> 'drawnFeatures' AS drawn_features
         FROM projects WHERE id = $1 LIMIT 1`,
      [projectId],
    )
    const project = projectRows[0]
    if (!project) return NextResponse.json({ error: 'Project not found', code: 'NOT_FOUND' }, { status: 404 })

    const { rows: referenceRows } = await db.query<Record<string, unknown>>(
      'SELECT * FROM project_reference_systems WHERE project_id = $1 LIMIT 1',
      [projectId],
    )
    const reference = resolveStageReference(referenceRows[0], project)
    if (!reference.code) {
      return NextResponse.json(
        { error: 'Declare a supported projected metre CRS for this project before importing map lines into drainage.', code: 'CRS_UNDECLARED' },
        { status: 409 },
      )
    }

    try {
      const projectCrs = resolveEpsg(reference.code).code
      const crs = assertProjectedCrs(projectCrs)
      if (crs.units !== 'metres') {
        return NextResponse.json(
          { error: `${crs.code} is not a projected metre CRS and cannot be used for drainage set-out.`, code: 'CRS_NOT_PROJECTED_METRES' },
          { status: 409 },
        )
      }
      const result = extractProjectMapDrainageAlignments(project.drawn_features, crs.code)
      return NextResponse.json({ projectCrs: crs.code, ...result })
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'The saved project CRS cannot transform map lines for drainage.',
          code: 'CRS_NOT_SUPPORTED',
        },
        { status: 409 },
      )
    }
  },
)
