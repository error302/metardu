import { createClient } from '@/lib/supabase/server'

export async function generateSubmissionRef(
  projectId: string,
  iskNumber: string
): Promise<{ ref: string; revision: number; sequence: number }> {
  const supabase = await createClient()
  const currentYear = new Date().getFullYear()

  const { data: profile } = await supabase
    .from('surveyor_profiles')
    .select('id')
    .eq('isk_number', iskNumber)
    .single()

  if (!profile) {
    throw new Error('Surveyor profile not found')
  }

  const { data: existingSubmissions } = await supabase
    .from('project_submissions')
    .select('revision_number')
    .eq('project_id', projectId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const revision = (existingSubmissions?.revision_number ?? -1) + 1
  const paddedRev = String(revision).padStart(2, '0')

  const sequenceResult = await supabase.rpc('increment_submission_sequence', {
    p_surveyor_profile_id: profile.id,
    p_year: currentYear
  })

  const sequence = sequenceResult.data ?? 1
  const paddedSeq = String(sequence).padStart(3, '0')

  const ref = `${iskNumber}_${currentYear}_${paddedSeq}_R${paddedRev}`

  return { ref, revision, sequence }
}