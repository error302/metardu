export type SubmissionStatus =
  | 'draft'
  | 'qa_failed'
  | 'qa_passed'
  | 'submitted'
  | 'approved'

export type SurveySubtype =
  | 'cadastral_subdivision'
  | 'cadastral_amalgamation'
  | 'cadastral_resurvey'
  | 'cadastral_mutation'

export interface SurveyorProfile {
  registrationNumber: string
  fullName: string
  firmName: string
  isKMemberActive: boolean
}

export interface SubmissionPoint {
  pointName: string
  easting: number
  northing: number
  adjustedEasting: number
  adjustedNorthing: number
  observedBearing: number
  observedDistance: number
}

export interface TraverseResult {
  points: SubmissionPoint[]
  angularMisclosure: number
  linearMisclosure: number
  precisionRatio: string
  closingErrorE: number
  closingErrorN: number
  adjustmentMethod: 'bowditch' | 'transit'
  areaM2: number
  perimeterM: number
}

export interface ParcelDetails {
  lrNumber: string
  county: string
  district: string
  locality: string
  areaM2: number
  perimeterM: number
}

export interface SupportingDocument {
  type: 'ppa2' | 'lcb_consent' | 'mutation_form' | 'beacon_cert'
  label: string
  required: boolean
  fileUrl: string | null
  uploadedAt: string | null
}

export interface SubmissionPackage {
  submissionRef: string
  projectId: string
  surveyor: SurveyorProfile
  subtype: SurveySubtype
  parcel: ParcelDetails
  traverse: TraverseResult
  supportingDocs: SupportingDocument[]
  generatedAt: string
  revision: number
}

export interface QAGateResult {
  passed: boolean
  blockers: QABlocker[]
  warnings: QAWarning[]
}

export interface QABlocker {
  code: string
  message: string
  field?: string
}

export interface QAWarning {
  code: string
  message: string
}
