export interface DigitalSignature {
  id: string
  documentId: string
  documentType: 'DEED_PLAN' | 'SURVEY_REPORT' | 'TRAVERSE_COMPUTATION'
  signedBy: string
  surveyorName: string
  iskNumber: string
  firmName: string
  signedAt: string
  documentHash: string
  signatureData: string
  method: 'DRAWN' | 'TYPED' | 'CERTIFICATE'
  ipAddress?: string
  valid: boolean
  revokedAt?: string
  revokedReason?: string
  verificationToken: string
}

export interface SignDocumentRequest {
  documentId: string
  documentType: DigitalSignature['documentType']
  content: string
  method: DigitalSignature['method']
  signatureData?: string
}

export interface VerifySignatureResponse {
  valid: boolean
  surveyorName?: string
  iskNumber?: string
  firmName?: string
  signedAt?: string
  documentType?: DigitalSignature['documentType']
  status: 'VALID' | 'REVOKED' | 'NOT_FOUND'
  revokedAt?: string
  revokedReason?: string
}
