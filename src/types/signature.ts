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
  verificationStatus: 'recorded'
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
  recordFound: boolean
  surveyorName?: string
  iskNumber?: string
  firmName?: string
  signedAt?: string
  documentType?: DigitalSignature['documentType']
  status: 'RECORD_FOUND' | 'REVOKED' | 'NOT_FOUND'
  revokedAt?: string
  revokedReason?: string
}
