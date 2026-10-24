import type { ReactNode } from 'react'
import ProjectTabs from '@/components/project/ProjectTabs'
import { getAuthUser, isPlatformAdmin as checkIsAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'
import { redirect } from 'next/navigation'
import type { SurveyType } from '@/types/project'

interface Props {
  children: ReactNode
  params: Promise<{ id: string }>
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

export default async function ProjectLayout({ children, params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const userIsAdmin = await checkIsAdmin()
  const dbClient = await createClient()
  let query = dbClient
    .from('projects')
    .select('survey_type')
    .eq('id', params.id)

  if (!userIsAdmin) {
    query = query.eq('user_id', user.id)
  }

  const { data: project } = await query.single()

  const surveyType = project ? normalizeSurveyType(project.survey_type as string | null | undefined) : undefined

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ProjectTabs id={params.id} surveyType={surveyType} />
      {children}
    </div>
  )
}
