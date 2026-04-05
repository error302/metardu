import type {
  SubmissionPackage,
  QAGateResult,
  QABlocker,
  QAWarning
} from './types'

const PRECISION_REQUIREMENTS: Record<string, number> = {
  cadastral_subdivision: 5000,
  cadastral_amalgamation: 5000,
  cadastral_resurvey: 5000,
  cadastral_mutation: 5000
}

export function validateSubmission(pkg: SubmissionPackage): QAGateResult {
  const blockers: QABlocker[] = []
  const warnings: QAWarning[] = []

  if (!pkg.surveyor.registrationNumber) {
    blockers.push({
      code: 'NO_REG_NUMBER',
      message: 'Surveyor registration number is missing. Update your profile before submitting.'
    })
  }

  if (!pkg.surveyor.isKMemberActive) {
    warnings.push({
      code: 'ISK_INACTIVE',
      message: 'ISK membership may not be current. Verify before submission to Director of Surveys.'
    })
  }

  if (!pkg.parcel.lrNumber) {
    blockers.push({
      code: 'NO_LR_NUMBER',
      message: 'LR Number is required for cadastral submission.'
    })
  }

  if (!pkg.parcel.county) {
    blockers.push({
      code: 'NO_COUNTY',
      message: 'County is required on Form No. 4.'
    })
  }

  const requiredPrecision = PRECISION_REQUIREMENTS[pkg.subtype] || 5000
  const precisionParts = pkg.traverse.precisionRatio.split(':')
  const denominator = parseInt(precisionParts[1], 10)

  if (isNaN(denominator) || denominator < requiredPrecision) {
    blockers.push({
      code: 'PRECISION_FAILURE',
      message: `Traverse precision ${pkg.traverse.precisionRatio} does not meet minimum 1:${requiredPrecision} required for ${pkg.subtype}.`
    })
  }

  if (pkg.traverse.points.length < 3) {
    blockers.push({
      code: 'INSUFFICIENT_POINTS',
      message: 'A minimum of 3 survey points are required.'
    })
  }

  const requiredDocs = pkg.supportingDocs.filter(d => d.required)
  const missingDocs = requiredDocs.filter(d => !d.fileUrl)

  missingDocs.forEach(doc => {
    blockers.push({
      code: `MISSING_DOC_${doc.type.toUpperCase()}`,
      message: `${doc.label} is required for this submission type and has not been uploaded.`
    })
  })

  if (pkg.parcel.areaM2 <= 0) {
    blockers.push({
      code: 'INVALID_AREA',
      message: 'Computed parcel area is zero or negative. Check traverse computation.'
    })
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  }
}
