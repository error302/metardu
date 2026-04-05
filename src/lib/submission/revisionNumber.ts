import { createClient } from '@/lib/supabase/server'

export async function generateSubmissionRef(
  projectId: string,
  registrationNumber: string
): Promise<{ ref: string; revision: number; sequence: number }> {
  const supabase = await createClient()
  const year = new Date().getFullYear()

  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('registration_number', registrationNumber)
    .gte('created_at', `${year}-01-01`)

  const sequence = (count ?? 0) + 1
  const paddedSeq = String(sequence).padStart(3, '0')

  const { count: revCount } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const revision = revCount ?? 0
  const paddedRev = String(revision).padStart(2, '0')

  const ref = `${registrationNumber}_${year}_${paddedSeq}_R${paddedRev}`

  return { ref, revision, sequence }
}
