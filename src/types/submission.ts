import { SurveyType } from './project';

export type DocumentStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'error';

export type DocumentFormat = 'pdf' | 'xlsx' | 'zip' | 'dxf' | 'shp' | 'geojson';

export interface SubmissionDocument {
  id: string;
  label: string;
  description: string;
  format: DocumentFormat;
  surveyTypes: SurveyType[];
  requiredData: string[];
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  document_id: string;
  status: DocumentStatus;
  file_url: string | null;
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
}

// Legacy types — preserved for backward compatibility with existing code
export interface ProjectSubmission {
  id: string
  project_id: string
  surveyor_profile_id: string
  submission_number: string
  revision_code: string
  submission_year: number
  package_status: 'draft' | 'incomplete' | 'ready' | 'submitted'
  required_sections: SubmissionSection[]
  generated_artifacts: Record<string, string>
  supporting_attachments: Record<string, string>
  validation_results: ValidationResult[]
  created_at: string
  updated_at: string
}

export interface SubmissionSection {
  id: string
  order: number
  label: string
  required: boolean
  status: 'missing' | 'pending' | 'ready'
  artifact_key?: string
}

export interface ValidationResult {
  section_id: string
  passed: boolean
  message: string
}

export const SUBMISSION_SECTIONS: SubmissionSection[] = [
  { id: 'surveyor_report', order: 1, label: "Surveyor", required: true, status: 'missing' },
  { id: 'index', order: 2, label: 'Index to Computations', required: true, status: 'missing' },
  { id: 'coordinate_list', order: 3, label: 'Final Coordinate List', required: true, status: 'missing' },
  { id: 'working_diagram', order: 4, label: 'Working Diagram', required: true, status: 'missing' },
  { id: 'theoretical_comps', order: 5, label: 'Theoretical Computations', required: true, status: 'missing' },
  { id: 'rtk_result', order: 6, label: 'RTK / Field Result Bundle', required: false, status: 'missing' },
  { id: 'consistency_checks', order: 7, label: 'Consistency Checks', required: true, status: 'missing' },
  { id: 'area_computations', order: 8, label: 'Area Computations', required: true, status: 'missing' },
]

export interface SurveyorProfile {
  id: string
  user_id: string
  full_name: string
  registration_number: string
  firm_name?: string
  seal_url?: string
  signature_url?: string
}

export interface SurveyorDocumentProfile {
  userId: string
  name: string
  firm: string
  licence: string
  phone: string
  email: string
  address: string
  county?: string
  sealImagePath?: string
  profilePublic?: boolean
  verifiedLicence?: boolean
}

export interface AttachmentSlot {
  id: string
  label: string
  required: boolean
  accepts: string[]
  maxSizeMB: number
  helpText: string
}

export const BOUNDARY_ATTACHMENT_SLOTS: AttachmentSlot[] = [
  { id: 'ppa2', label: 'Physical Planning Approval (PPA2)', required: true, accepts: ['application/pdf', 'image/jpeg', 'image/png'], maxSizeMB: 10, helpText: 'Approval from local authority for subdivision' },
  { id: 'lcb_consent', label: 'Land Control Board Consent', required: true, accepts: ['application/pdf'], maxSizeMB: 10, helpText: 'Required for subdivisions under the Land Control Act' },
  { id: 'mutation_form', label: 'Mutation Form / Subdivision Scheme', required: true, accepts: ['application/pdf', 'image/jpeg'], maxSizeMB: 20, helpText: 'Signed by landowner and registered surveyor' },
  { id: 'rtk_raw', label: 'RTK Raw Output', required: false, accepts: ['text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml'], maxSizeMB: 50, helpText: 'Raw GNSS field data from RTK session' },
  { id: 'field_book_export', label: 'Digital Field Book Export', required: false, accepts: ['text/csv', '.fbk', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml'], maxSizeMB: 20, helpText: 'Exported from total station or GNSS instrument' },
]

export interface PackageValidation {
  ready: boolean
  blockers: string[]
  warnings: string[]
}

export type SubmissionPackageStatus = 'draft' | 'incomplete' | 'ready' | 'submitted'

export interface ProjectSubmissionRecord {
  id: string
  project_id: string
  user_id: string
  surveyor_profile_user_id: string | null
  submission_year: number
  sequence_number: number | null
  revision_number: number
  submission_number: string | null
  package_status: SubmissionPackageStatus
  required_documents: unknown[] | null
  generated_artifacts: Record<string, unknown> | null
  supporting_attachments: Record<string, unknown> | null
  validation_results: Record<string, unknown> | null
  created_at: string
  updated_at: string
}