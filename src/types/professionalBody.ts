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

/**
 * Validate an ISK (Institution of Surveyors of Kenya) license number.
 *
 * AUDIT FIX (H10, 2026-07-03): The old pattern `/^ISK\/\d{4}$|^\d{4}$/`
 * accepted only `ISK/1234` or `1234` — but the NLIMS exporter
 * (src/lib/export/nlimsExporter.ts:266) and the statutory gate
 * (src/lib/validation/statutoryGate.ts:553) both expect the official
 * ISK format `ISK/LS/YYYY/NNN` (e.g., `ISK/LS/2021/0452`).
 *
 * The two patterns were inconsistent — a surveyor could pass
 * `validateISKNumber()` but fail the NLIMS export. Now all three
 * call sites use the same pattern.
 *
 * We also accept legacy formats for backward compatibility:
 *   - ISK/LS/YYYY/NNN    (current official format, e.g. ISK/LS/2021/0452)
 *   - ISK/LS/YYYY/NNNN   (4-digit serial variant)
 *   - ISK/YYYY/NNN       (older format without the LS segment)
 *   - ISK/NNNN           (legacy short format — warn only)
 *
 * References:
 *   - ISK membership format: https://isk.or.ke/membership
 *   - Survey of Kenya Act Cap 299 — licensed surveyor registry
 */
export function validateISKNumber(number: string): boolean {
  if (!number) return false
  // Current official format: ISK/LS/YYYY/NNN or ISK/LS/YYYY/NNNN
  // Legacy formats: ISK/YYYY/NNN, ISK/NNNN
  const pattern = /^ISK\/(LS\/)?\d{4}\/\d{3,4}$|^ISK\/\d{4}$/i
  return pattern.test(number.trim())
}

/**
 * Validate an EBK (Engineers Board of Kenya) license number.
 * Format: ENG/YYYY/NNNN (e.g., ENG/2021/0452)
 */
export function validateEBKNumber(number: string): boolean {
  if (!number) return false
  return /^ENG\/\d{4}\/\d{3,4}$/i.test(number.trim())
}

/**
 * Validate an ISU (Institution of Surveyors of Uganda) membership number.
 * Format: ISU/YYYY/NNN
 */
export function validateISUNumber(number: string): boolean {
  if (!number) return false
  return /^ISU\/\d{4}\/\d{3,4}$/i.test(number.trim())
}

/**
 * Validate a professional membership number for any body.
 * Returns { valid, format, warning }.
 */
export function validateMembershipNumber(
  body: ProfessionalBody,
  number: string
): { valid: boolean; warning?: string } {
  switch (body) {
    case 'ISK':
      if (!validateISKNumber(number)) {
        return {
          valid: false,
          warning: 'ISK number should be in ISK/LS/YYYY/NNN format (e.g., ISK/LS/2021/0452). Legacy ISK/NNNN format is accepted but may be rejected by NLIMS.',
        }
      }
      // Warn if legacy format (no LS segment)
      if (/^ISK\/\d{4}$/i.test(number.trim()) && !/^ISK\/LS\//i.test(number.trim())) {
        return {
          valid: true,
          warning: 'Legacy ISK format detected. NLIMS submissions require ISK/LS/YYYY/NNN format. Consider updating your license number.',
        }
      }
      return { valid: true }

    case 'EBK':
      if (!validateEBKNumber(number)) {
        return {
          valid: false,
          warning: 'EBK number should be in ENG/YYYY/NNN format (e.g., ENG/2021/0452).',
        }
      }
      return { valid: true }

    case 'ISU':
      if (!validateISUNumber(number)) {
        return {
          valid: false,
          warning: 'ISU number should be in ISU/YYYY/NNN format.',
        }
      }
      return { valid: true }

    case 'RICS':
    case 'FIG':
    case 'OTHER':
      // No strict format — accept any non-empty string
      return number.trim().length > 0 ? { valid: true } : { valid: false, warning: 'Membership number is required.' }

    default:
      return { valid: false, warning: 'Unknown professional body.' }
  }
}
