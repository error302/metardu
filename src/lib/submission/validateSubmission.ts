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
  cadastral_mutation: 5000,
  topographic_site: 1000,
  topographic_corridor: 1000,
  engineering_road: 2000,
  engineering_bridge: 3000,
  engineering_dam: 3000,
  geodetic_control: 20000,
  mining: 1000,
  hydrographic: 500,
  drone: 1000,
  deformation: 5000,
}

const LEVELLING_TOLERANCE: Record<string, number> = {
  first_order: 3,
  second_order: 6,
  third_order: 12,
  fourth_order: 20,
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

  if (!pkg.parcel.district) {
    blockers.push({
      code: 'NO_DISTRICT',
      message: 'District is required for cadastral submission per Survey Act Cap 299.'
    })
  }

  if (!pkg.parcel.locality) {
    warnings.push({
      code: 'NO_LOCALITY',
      message: 'Locality not specified. Recommended for Director of Surveys clarity.'
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

  if (pkg.traverse.angularMisclosure > 20 * Math.sqrt(pkg.traverse.points.length)) {
    blockers.push({
      code: 'ANGULAR_MISCLOSURE_EXCEEDED',
      message: `Angular misclosure ${(pkg.traverse.angularMisclosure).toFixed(1)}" exceeds 20√n = ${(20 * Math.sqrt(pkg.traverse.points.length)).toFixed(1)}" limit.`
    })
  }

  const perimeterKm = pkg.traverse.perimeterM / 1000
  const levellingTolerance = 10 * Math.sqrt(perimeterKm)
  if (pkg.traverse.linearMisclosure > levellingTolerance / 1000) {
    warnings.push({
      code: 'LEVELLING_TOLERANCE_WARNING',
      message: `Linear misclosure may exceed 10√K mm tolerance. Verify levelling computations per RDM 1.1 Table 5.1.`
    })
  }

  if (pkg.revision > 1) {
    warnings.push({
      code: 'MULTIPLE_REVISIONS',
      message: `This is revision R${pkg.revision.toString().padStart(2, '0')}. Ensure all previous comments from Director of Surveys have been addressed.`
    })
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  }
}

export function getSubmissionChecklist(subtype: string): { code: string; label: string; required: boolean }[] {
  const base = [
    { code: 'COORD_SYS', label: 'Coordinate system specified (Arc 1960 / UTM Zone 37S)', required: true },
    { code: 'SURVEYOR_PROFILE', label: 'Licensed surveyor profile complete (ISK Reg. No.)', required: true },
    { code: 'LR_NUMBER', label: 'LR Number specified', required: true },
    { code: 'COUNTY', label: 'County specified', required: true },
    { code: 'DISTRICT', label: 'District specified', required: true },
    { code: 'AREA_COMPUTED', label: 'Parcel area computed and > 0', required: true },
    { code: 'PRECISION', label: `Traverse precision meets 1:${PRECISION_REQUIREMENTS[subtype] || 5000}`, required: true },
    { code: 'BEACONS', label: 'Beacon types and positions verified', required: true },
    { code: 'FORM_NO4', label: 'Form No. 4 (Mutation Form) generated', required: true },
    { code: 'DXF_PLAN', label: 'DXF plan with TitleBlock generated', required: true },
  ]

  const cadastralExtras = [
    { code: 'PPA2', label: 'PPA2 (Permission to Amend) attached', required: true },
    { code: 'LCB_CONSENT', label: 'Land Control Board consent attached', required: true },
    { code: 'BEACON_CERT', label: 'Beacon completion certificate attached', required: true },
    { code: 'SEARCH_CERT', label: 'Official search certificate attached', required: false },
  ]

  const topoExtras = [
    { code: 'CONTOURS', label: 'Contour interval matches spec', required: true },
    { code: 'SPOT_HEIGHTS', label: 'Spot heights verified against field book', required: true },
    { code: 'IDW_COMPUTED', label: 'IDW interpolation completed', required: true },
  ]

  const engineeringExtras = [
    { code: 'HORIZONTAL_CURVE', label: 'Horizontal curve computation verified', required: true },
    { code: 'SUPERELEVATION', label: 'Superelevation within RDM 1.1 limits', required: true },
    { code: 'VERTICAL_CURVE', label: 'Vertical curve K-value meets SSD requirements', required: true },
    { code: 'EARTHWORKS', label: 'Cross-section volumes computed', required: false },
  ]

  if (subtype.startsWith('cadastral')) {
    return [...base, ...cadastralExtras]
  }
  if (subtype.startsWith('topographic')) {
    return [...base, ...topoExtras]
  }
  if (subtype.startsWith('engineering')) {
    return [...base, ...engineeringExtras]
  }

  return base
}
