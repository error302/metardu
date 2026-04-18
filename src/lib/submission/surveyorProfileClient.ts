import { createClient } from '@/lib/api-client/client'
import type { SurveyorProfileSubmission } from '@/lib/api-client/community'

export async function getActiveSurveyorProfile(): Promise<SurveyorProfileSubmission> {
  const dbClient = createClient()

  const { data: { session }, error: authError } = await dbClient.auth.getSession()
  if (authError || !session?.user) throw new Error('Not authenticated')
  const user = session.user

  const { data, error } = await dbClient
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
    verifiedIsk: data.verified_isk ?? false,
    fullName: data.full_name ?? data.name ?? '',
    firmName: data.firm_name ?? data.company ?? '',
    isKMemberActive: data.verified_isk ?? true
  }
}
