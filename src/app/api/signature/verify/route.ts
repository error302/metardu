import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import type { VerifySignatureResponse } from '@/types/signature'

// ─── DB Row interface ────────────────────────────────────────────────────
interface SignatureRow {
  verification_token: string
  valid: boolean
  surveyor_name: string | null
  isk_number: string | null
  firm_name: string | null
  signed_at: string | null
  document_type: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

export const dynamic = 'force-dynamic'

/**
 * GET /api/signature/verify?token=XXX
 *
 * Public endpoint — anyone with a record token can check whether METARDU has
 * a non-revoked record. This lookup does not authenticate the signer's identity,
 * validate professional registration, or compare the original document.
 *
 * Rate-limited to reduce token enumeration.
 */
export const GET = apiHandler(
  { auth: false, rateLimit: { max: 60, windowMs: 60_000 } },
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { status: 'NOT_FOUND' as const, recordFound: false } as VerifySignatureResponse,
        { status: 400 },
      )
    }

    const result = await db.query<SignatureRow>(
      'SELECT * FROM document_signatures WHERE verification_token = $1',
      [token.toUpperCase()],
    )

    const signature = result.rows[0]

    if (!signature) {
      return NextResponse.json({
        status: 'NOT_FOUND',
        recordFound: false,
      } as VerifySignatureResponse)
    }

    if (!signature.valid) {
      return NextResponse.json({
        recordFound: true,
        surveyorName: signature.surveyor_name ?? undefined,
        iskNumber: signature.isk_number ?? undefined,
        firmName: signature.firm_name ?? undefined,
        signedAt: signature.signed_at ?? undefined,
        documentType: (signature.document_type ?? undefined) as VerifySignatureResponse['documentType'],
        status: 'REVOKED',
        revokedAt: signature.revoked_at || undefined,
        revokedReason: signature.revoked_reason || undefined,
      } as VerifySignatureResponse)
    }

    return NextResponse.json({
      recordFound: true,
      surveyorName: signature.surveyor_name ?? undefined,
      iskNumber: signature.isk_number ?? undefined,
      firmName: signature.firm_name ?? undefined,
      signedAt: signature.signed_at ?? undefined,
      documentType: (signature.document_type ?? undefined) as VerifySignatureResponse['documentType'],
      status: 'RECORD_FOUND',
    } as VerifySignatureResponse)
  },
)
