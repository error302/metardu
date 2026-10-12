export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { PipeNetworkProjectSchema } from '@/lib/engineering/pipeNetworkPersistence'
import { assertProjectedCrs, resolveEpsg } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { z } from 'zod'

const saveSchema = z.object({ network: PipeNetworkProjectSchema }).strict()
const privateJson = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
})
const privateResponse = (response: NextResponse) => {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

interface ProjectNetworkRow {
  id: string
  name: string
  utm_zone: number | null
  hemisphere: string | null
  datum: string | null
  engineering_data: unknown
}

async function declaredProjectCrs(project: ProjectNetworkRow): Promise<{ code: string | null; error?: string }> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM project_reference_systems WHERE project_id = $1 LIMIT 1',
    [project.id],
  )
  const reference = resolveStageReference(rows[0], project)
  if (!reference.code) {
    return rows[0]
      ? { code: null, error: 'The saved project reference system is invalid. Repair it before using drainage coordinates.' }
      : { code: null }
  }
  try {
    const crs = assertProjectedCrs(resolveEpsg(reference.code).code)
    if (crs.units !== 'metres') return { code: null, error: `${crs.code} is not a projected metre CRS.` }
    return { code: crs.code }
  } catch (error) {
    return { code: null, error: error instanceof Error ? error.message : 'The project CRS is not supported.' }
  }
}

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_request, ctx) => {
  const projectId = ctx.params.id
  const access = await requireProjectReadAccess(projectId, ctx.userId)
  if (!access.ok) return privateResponse(access.error ?? NextResponse.json({ error: 'Project access denied' }, { status: 403 }))

  const { rows } = await db.query<ProjectNetworkRow>(
    `SELECT id, name, utm_zone, hemisphere, datum, engineering_data
       FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
  )
  const project = rows[0]
  if (!project) return privateJson({ error: 'Project not found', code: 'NOT_FOUND' }, 404)

  const rawEngineeringData = project.engineering_data
  const networkValue = rawEngineeringData && typeof rawEngineeringData === 'object'
    ? (rawEngineeringData as Record<string, unknown>).pipeNetwork
    : undefined
  const parsedNetwork = networkValue === undefined || networkValue === null
    ? null
    : PipeNetworkProjectSchema.safeParse(networkValue)
  if (parsedNetwork && !parsedNetwork.success) {
    return privateJson(
      { error: 'The saved pipe-network record is invalid. It was left unchanged; export or recover the project record before editing.', code: 'INVALID_SAVED_NETWORK' },
      409,
    )
  }

  const crs = await declaredProjectCrs(project)
  return privateJson({
    projectName: project.name,
    declaredProjectCrs: crs.code,
    projectCrsIssue: crs.error ?? null,
    network: parsedNetwork?.data ?? null,
  })
})

export const PUT = apiHandler({ auth: true, schema: saveSchema, rateLimit: { max: 30, windowMs: 60000 } }, async (_request, ctx) => {
  const projectId = ctx.params.id
  const ownership = await requireProjectOwnership(projectId, ctx.userId)
  if (!ownership.ok) return privateResponse(ownership.error ?? NextResponse.json({ error: 'Project ownership required' }, { status: 403 }))

  const { network } = ctx.body as z.infer<typeof saveSchema>
  let enteredCrs: string
  try {
    const parsedCrs = assertProjectedCrs(network.projectCrs)
    if (parsedCrs.units !== 'metres') {
      return privateJson({ error: `${parsedCrs.code} is not a projected metre CRS.`, code: 'CRS_NOT_PROJECTED_METRES' }, 409)
    }
    enteredCrs = parsedCrs.code
  } catch (error) {
    return privateJson({ error: error instanceof Error ? error.message : 'Enter a supported projected metre CRS.', code: 'CRS_NOT_SUPPORTED' }, 409)
  }

  const { rows: projectRows } = await db.query<ProjectNetworkRow>(
    `SELECT id, name, utm_zone, hemisphere, datum, engineering_data
       FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [projectId, ctx.userId],
  )
  const project = projectRows[0]
  if (!project) return privateJson({ error: 'Project not found or no longer owned by this account', code: 'NOT_FOUND' }, 404)
  const crs = await declaredProjectCrs(project)
  if (crs.error) return privateJson({ error: crs.error, code: 'PROJECT_CRS_INVALID' }, 409)
  if (crs.code && crs.code !== enteredCrs) {
    return privateJson({
      error: `This network uses ${enteredCrs}, but the project reference is ${crs.code}. Reproject the coordinates before saving them to this project.`,
      code: 'PROJECT_CRS_MISMATCH',
    }, 409)
  }

  const { rows } = await db.query<{ id: string }>(
    `UPDATE projects
        SET engineering_data = COALESCE(engineering_data, '{}'::jsonb)
          || jsonb_build_object('pipeNetwork', $2::jsonb)
      WHERE id = $1 AND user_id = $3
      RETURNING id`,
    [projectId, JSON.stringify(network), ctx.userId],
  )
  if (rows.length !== 1) {
    return privateJson({ error: 'The project network was not saved. Refresh and check project access.', code: 'NOT_SAVED' }, 409)
  }

  return privateJson({ saved: true, network })
})
