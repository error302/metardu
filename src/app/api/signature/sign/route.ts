export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { hashDocument, generateVerificationToken } from '@/lib/compute/digitalSignature'
import type { SignDocumentRequest } from '@/types/signature'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { documentId, documentType, content, method, signatureData } = ctx.body as SignDocumentRequest

  if (!documentId || !documentType || !content || !method) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    )
  }

  const profileResult = await db.query(
    'SELECT full_name, isk_number, firm_name FROM profiles WHERE id = $1',
    [ctx.userId]
  )

  const profile = profileResult.rows[0]
  const surveyorName = profile?.full_name || 'Unknown Surveyor'
  const iskNumber = profile?.isk_number || 'ISK/0000'
  const firmName = profile?.firm_name || 'Independent Surveyor'

  const documentHash = hashDocument(content)
  const signedAt = new Date().toISOString()
  const verificationToken = generateVerificationToken(documentId, signedAt, iskNumber)

  const insertResult = await db.query(
    `INSERT INTO document_signatures (
      document_id, document_type, signed_by, surveyor_name, isk_number, firm_name,
      signed_at, document_hash, signature_data, method, valid, verification_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
    RETURNING id, verification_token`,
    [
      documentId, documentType, ctx.userId, surveyorName, iskNumber, firmName,
      signedAt, documentHash, signatureData || '', method, verificationToken
    ]
  )

  if (insertResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'Failed to save signature' },
      { status: 500 }
    )
  }

  const signature = insertResult.rows[0]

  return NextResponse.json({
    signatureId: signature.id,
    verificationToken: signature.verification_token,
    documentHash
  })
})
