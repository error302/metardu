import { createClient } from '@/lib/supabase/server'
import type { SurveyorProfile } from './types'

export async function getActiveSurveyorProfile(): Promise<SurveyorProfile> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('surveyor_profiles')
    .select('registration_number, full_name, firm_name, isk_active')
    .eq('user_id', user.id)
    .single()

  if (error || !data) throw new Error('Surveyor profile not found')

  return {
    registrationNumber: data.registration_number,
    fullName: data.full_name,
    firmName: data.firm_name,
    isKMemberActive: data.isk_active
  }
}
