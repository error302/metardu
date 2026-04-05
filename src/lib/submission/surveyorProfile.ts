import { createClient } from '@/lib/supabase/server'
import type { SurveyorProfile } from './types'

export async function getActiveSurveyorProfile(): Promise<SurveyorProfile> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('surveyor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    throw new Error(
      `Surveyor profile not found for user ${user.id}. ` +
      'Please complete your profile before generating a submission.'
    )
  }

  return {
    registrationNumber: data.registration_number ?? data.isk_number ?? '',
    fullName: data.full_name ?? data.name ?? '',
    firmName: data.firm_name ?? data.company ?? '',
    isKMemberActive: data.isk_active ?? data.verified_isk ?? true
  }
}
