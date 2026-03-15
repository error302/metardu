/**
 * Digital Signature & QR Verification Service
 * Phase 8 - Integration Layer
 * Simplified document signing without large RSA keys
 */

import crypto from 'crypto'

const SIGNATURE_ALGORITHM = 'sha256'
const KEY_LENGTH = 32

export interface SignedDocument {
  documentId: string
  documentHash: string
  signature: string
  timestamp: number
  signerId: string
  metadata: Record<string, string>
}

export interface QRVerificationResult {
  valid: boolean
  document?: SignedDocument
  message: string
  verifiedAt: number
}

function deriveKey(secret: string): Buffer {
  return crypto.pbkdf2Sync(secret, 'geonova-salt', 100000, KEY_LENGTH, 'sha256')
}

export function signDocument(
  documentId: string,
  content: string,
  signerId: string,
  secret: string,
  metadata: Record<string, string> = {}
): SignedDocument {
  const documentHash = crypto.createHash(SIGNATURE_ALGORITHM).update(content).digest('hex')
  const key = deriveKey(secret)
  const signature = crypto.createHmac(SIGNATURE_ALGORITHM, key).update(documentHash).digest('hex')

  return {
    documentId,
    documentHash,
    signature,
    timestamp: Date.now(),
    signerId,
    metadata,
  }
}

export function verifySignature(
  signedDoc: SignedDocument,
  originalContent: string,
  secret: string
): QRVerificationResult {
  const computedHash = crypto.createHash(SIGNATURE_ALGORITHM).update(originalContent).digest('hex')
  
  if (computedHash !== signedDoc.documentHash) {
    return {
      valid: false,
      message: 'Document content has been modified',
      verifiedAt: Date.now(),
    }
  }

  const key = deriveKey(secret)
  const expectedSignature = crypto.createHmac(SIGNATURE_ALGORITHM, key)
    .update(signedDoc.documentHash)
    .digest('hex')

  if (expectedSignature !== signedDoc.signature) {
    return {
      valid: false,
      message: 'Invalid signature',
      verifiedAt: Date.now(),
    }
  }

  return {
    valid: true,
    document: signedDoc,
    message: 'Document signature verified successfully',
    verifiedAt: Date.now(),
  }
}

export function generateQRPayload(signedDoc: SignedDocument): string {
  const payload = {
    id: signedDoc.documentId,
    h: signedDoc.documentHash,
    s: signedDoc.signature,
    t: signedDoc.timestamp,
    si: signedDoc.signerId,
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function parseQRPayload(payload: string): SignedDocument | null {
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return {
      documentId: decoded.id,
      documentHash: decoded.h,
      signature: decoded.s,
      timestamp: decoded.t,
      signerId: decoded.si,
      metadata: {},
    }
  } catch {
    return null
  }
}

export function createSurveyReportSignature(
  surveyId: string,
  surveyorLicense: string,
  measurements: Record<string, number>,
  secret: string
): SignedDocument {
  const content = JSON.stringify({ surveyId, surveyorLicense, measurements }, Object.keys(measurements).sort())
  return signDocument(surveyId, content, surveyorLicense, secret, { type: 'survey_report' })
}
