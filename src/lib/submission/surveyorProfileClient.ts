import { createClient } from '@/lib/supabase/client'
import type { SurveyorProfileSubmission } from '@/lib/supabase/community'

export async function getActiveSurveyorProfile(): Promise<SurveyorProfileSubmission> {
  const supabase = createClient()

  const { data: { session }, error: authError } = await supabase.auth.getSession()
  if (authError || !session?.user) throw new Error('Not authenticated')
  const user = session.user

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
    registrationNumber: data.isk_number ?? '',
    iskNumber: data.isk_number ?? '',
    fullName: data.full_name ?? data.name ?? '',
    firmName: data.firm_name ?? data.company ?? '',
    isKMemberActive: data.verified_isk ?? true
  }
}
