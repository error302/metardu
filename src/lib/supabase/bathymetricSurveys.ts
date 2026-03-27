import { createClient } from '@/lib/supabase/client'
import type { BathymetricSurvey, SoundingPoint, ContourLine, Hazard } from '@/types/bathymetry'

export interface CreateSurveyInput {
  project_id: string
  survey_name: string
  soundings: SoundingPoint[]
  contours?: ContourLine[]
  hazards?: Hazard[]
}

export async function createSurvey(params: CreateSurveyInput): Promise<BathymetricSurvey> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('bathymetric_surveys')
    .insert({
      project_id: params.project_id,
      user_id: user.id,
      survey_name: params.survey_name,
      soundings: params.soundings,
      contours: params.contours || [],
      hazards: params.hazards || []
    })
    .select()
    .single()

  if (error) throw error
  return data as BathymetricSurvey
}

export async function getSurveys(projectId: string): Promise<BathymetricSurvey[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bathymetric_surveys')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as BathymetricSurvey[]
}

export async function getSurvey(id: string): Promise<BathymetricSurvey | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bathymetric_surveys')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as BathymetricSurvey | null
}

export async function updateSurvey(id: string, updates: Partial<BathymetricSurvey>): Promise<BathymetricSurvey> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bathymetric_surveys')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as BathymetricSurvey
}

export async function deleteSurvey(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('bathymetric_surveys')
    .delete()
    .eq('id', id)

  if (error) throw error
}
