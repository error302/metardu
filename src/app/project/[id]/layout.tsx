import type { ReactNode } from 'react'
import ProjectTabs from '@/components/project/ProjectTabs'
import { getAuthUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { SurveyType } from '@/types/project'

interface Props {
  children: ReactNode
  params: { id: string }
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

export default async function ProjectLayout({ children, params }: Props) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('survey_type')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  const surveyType = project ? normalizeSurveyType(project.survey_type) : undefined

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ProjectTabs id={params.id} surveyType={surveyType} />
      {children}
    </div>
  )
}
