export type ProfessionalBody = 'ISK' | 'EBK' | 'ISU' | 'RICS' | 'FIG' | 'OTHER'
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED'
export type VerificationMethod = 'MANUAL' | 'API' | 'DOCUMENT'

export interface ProfessionalMembership {
  id: string
  userId: string
  body: ProfessionalBody
  membershipNumber: string
  membershipGrade?: string
  verificationStatus: VerificationStatus
  verifiedAt?: string
  expiresAt?: string
  verificationMethod: VerificationMethod
  supportingDoc?: string
  createdAt: string
}

export const PROFESSIONAL_BODY_NAMES: Record<ProfessionalBody, string> = {
  ISK: 'Institution of Surveyors of Kenya',
  EBK: 'Engineers Board of Kenya',
  ISU: 'Institution of Surveyors of Uganda',
  RICS: 'Royal Institution of Chartered Surveyors',
  FIG: 'International Federation of Surveyors',
  OTHER: 'Other Professional Body'
}

export function validateISKNumber(number: string): boolean {
  const pattern = /^ISK\/\d{4}$|^\d{4}$/
  return pattern.test(number)
}
