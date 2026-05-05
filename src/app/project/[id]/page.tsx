import { redirect } from 'next/navigation'
import type { SurveyType } from '@/types/project'
import { getWorkflow } from '@/lib/workflows/workflowRegistry'
import ProjectWorkspaceClient from './ProjectWorkspaceClient'
import { getAuthUser } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'

interface Props {
  params: { id: string }
  searchParams: { step?: string }
}

function normalizeSurveyType(subtype: string | null | undefined): SurveyType {
  const value = (subtype ?? '').toLowerCase()

  if (value.includes('cadastral') || value.includes('boundary')) return 'cadastral'
  if (value.includes('engineering') || value.includes('road') || value.includes('construction')) return 'engineering'
  if (value.includes('geodetic') || value.includes('control')) return 'geodetic'
  if (value.includes('mining')) return 'mining'
  if (value.includes('hydro')) return 'hydrographic'
  if (value.includes('drone') || value.includes('uav')) return 'drone'
  if (value.includes('deformation') || value.includes('monitor')) return 'deformation'
  return 'topographic'
}

export default async function ProjectWorkspacePage({ params, searchParams }: Props) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const dbClient = await createClient()
  const { data: project, error } = await dbClient
    .from('projects')
    .select('id, name, survey_type, project_type')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error || !project) redirect('/dashboard')

  // Phase 25: Redirect scheme projects to scheme workspace
  if (project.project_type === 'scheme') {
    redirect(`/project/${params.id}/scheme`)
  }

  const surveyType = normalizeSurveyType(project.survey_type)
  const workflow = getWorkflow(surveyType)
  const urlStep = parseInt(searchParams.step ?? '', 10)
  const stepIndex = Number.isFinite(urlStep) ? urlStep : 1

  return (
    <ProjectWorkspaceClient
      project={{
        id: project.id,
        name: project.name,
        surveyType,
        workflowStep: stepIndex,
        maxUnlocked: 1,
      }}
      workflow={workflow}
    />
  )
}
