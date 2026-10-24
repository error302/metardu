import { AppError } from '@/lib/api/errors'
import { logger } from '@/lib/logger'
import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile'
import { runStatutoryGate, type StatutoryGateInput } from '@/lib/validation/statutoryGate'
import { loadGateInputForProject, mergeGateInput } from '@/lib/validation/statutoryGateLoader'

/** Always read server evidence; neither UI verdicts nor existing files grant admission. */
export async function evaluateSubmissionAdmission(projectId: string, documentId?: string) {
  let loaded: Awaited<ReturnType<typeof loadGateInputForProject>>
  let profile: Awaited<ReturnType<typeof fetchSurveyorProfile>>
  try {
    loaded = await loadGateInputForProject(projectId)
    if (!loaded) throw new Error('Project evidence not found')
    profile = await fetchSurveyorProfile(projectId)
  } catch (error) {
    logger.error('[submissionAdmission] Evidence read failed', { projectId, error })
    throw new AppError('Submission evidence is unavailable. Retry after restoring the project evidence.', 503, 'SUBMISSION_EVIDENCE_UNAVAILABLE')
  }
  const requiredEvidence: NonNullable<StatutoryGateInput['requiredEvidence']> = loaded.surveyType === 'cadastral'
    ? ['traverse', 'parcels'] : []
  const submissionType = documentId === 'mutation-form' ? 'mutation' : loaded.submissionType
  if (submissionType === 'mutation' || submissionType === 'subdivision') requiredEvidence.push('parentParcel')
  const input = mergeGateInput(loaded, {
    surveyor: { name: profile.surveyorName, licenseNumber: profile.licenseNumber },
    requiredEvidence, submissionType,
  })
  return { input, profile, gate: runStatutoryGate(input) }
}

export async function requireSubmissionAdmission(projectId: string, documentId?: string) {
  const admission = await evaluateSubmissionAdmission(projectId, documentId)
  if (!admission.gate.passed) {
    throw new AppError('Submission generation is blocked by the current METARDU quality checks. Review the missing or failed evidence.',
      422, 'SUBMISSION_QUALITY_BLOCKED', { gate: admission.gate })
  }
  return admission
}
