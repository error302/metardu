import { redirect } from 'next/navigation'
import type { SurveyType } from '@/types/project'
import { getWorkflow } from '@/lib/workflows/workflowRegistry'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import ProjectWorkspaceClient, { type ProjectBoundaryData } from '../ProjectWorkspaceClient'
import { getAuthUser, isAdmin as checkIsAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}

function normalizeSurveyType(subtype: string | null | undefined): SurveyType {
  const value = (subtype ?? '').toLowerCase()

  if (value.includes('cadastral') || value.includes('boundary')) return 'cadastral'
  if (value.includes('construction') || value.includes('building') || value.includes('pile')) return 'construction'
  if (value.includes('engineering') || value.includes('road')) return 'engineering'
  if (value.includes('geodetic') || value.includes('control')) return 'geodetic'
  if (value.includes('drone') || value.includes('uav')) return 'drone'
  if (value.includes('deformation') || value.includes('monitor')) return 'deformation'
  return 'topographic'
}

export default async function ProjectWorkspacePage({ params: paramsPromise, searchParams: searchParamsPromise }: Props) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const userIsAdmin = await checkIsAdmin()
  const dbClient = await createClient()

  let query = dbClient
    .from('projects')
    .select('id, name, survey_type, project_type, location, datum, utm_zone, hemisphere, workflow_step, workflow_max_unlocked, boundary_data')
    .eq('id', params.id)

  if (!userIsAdmin) {
    query = query.eq('user_id', user.id)
  }

  const { data: project, error } = await query.single()

  if (error || !project) redirect('/dashboard')

  // Phase 25: Redirect scheme projects to scheme workspace
  if (project.project_type === 'scheme') {
    redirect(`/project/${params.id}/scheme`)
  }

  const { data: referenceRows } = await dbClient
    .from('project_reference_systems')
    .select('*')
    .eq('project_id', params.id)
    .limit(1)
  const reference = resolveStageReference(
    (referenceRows?.[0] as Record<string, unknown> | undefined) ?? null,
    {
      datum: (project.datum as string | null) ?? null,
      utm_zone: (project.utm_zone as number | null) ?? null,
      hemisphere: (project.hemisphere as string | null) ?? null,
    },
  )

  const surveyType = normalizeSurveyType(project.survey_type as string | null | undefined)
  const workflow = getWorkflow(surveyType)
  const urlStep = parseInt(searchParams.step ?? '', 10)
  const dbStep = (project.workflow_step as number) ?? 1
  const stepIndex = Number.isFinite(urlStep) ? urlStep : dbStep
  const dbMaxUnlocked = (project.workflow_max_unlocked as number) ?? 1

  return (
    <ProjectWorkspaceClient
      project={{
        id: project.id as string,
        name: project.name as string,
        surveyType,
        workflowStep: stepIndex,
        maxUnlocked: dbMaxUnlocked,
      }}
      workflow={workflow}
      boundaryData={project.boundary_data as ProjectBoundaryData | null}
      reference={reference}
    />
  )
}
