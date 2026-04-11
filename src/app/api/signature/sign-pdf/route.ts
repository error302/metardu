/**
 * METARDU — Sign Existing PDF Endpoint
 *
 * POST /api/signature/sign-pdf
 *
 * Accepts a multipart form upload containing a PDF file, generates a digital
 * signature record in the database, embeds a professional signature appearance
 * block on the last page, and returns the signed PDF as a downloadable binary
 * response.
 *
 * @module sign-pdf-route
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import { hashDocument, generateVerificationToken } from '@/lib/compute/digitalSignature';
import { embedSignatureAppearance } from '@/lib/compute/pdfDigitalSignature';
import type { SignatureAppearanceData } from '@/lib/compute/pdfDigitalSignature';

// ---------------------------------------------------------------------------
// Route config
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Allowed signature methods
// ---------------------------------------------------------------------------

const ALLOWED_METHODS = ['DRAWN', 'TYPED', 'CERTIFICATE'] as const;
type SignatureMethod = (typeof ALLOWED_METHODS)[number];

function isSignatureMethod(value: string): value is SignatureMethod {
  return (ALLOWED_METHODS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

/**
 * Sign an existing PDF document.
 *
 * **Request** (multipart/form-data):
 * - `file`          — PDF file (binary, required)
 * - `documentId`    — Unique document identifier (string, required)
 * - `documentType`  — Type of document e.g. "SURVEY_PLAN" (string, required)
 * - `method`        — One of `DRAWN`, `TYPED`, `CERTIFICATE` (string, required)
 * - `signatureData` — Base64-encoded signature image for DRAWN method (string, optional)
 *
 * **Response** (on success):
 * - `Content-Type: application/pdf`
 * - `Content-Disposition: attachment; filename="signed-{documentId}.pdf"`
 * - Body: signed PDF bytes
 *
 * **Error responses:**
 * - 401 — Not authenticated
 * - 400 — Missing or invalid fields
 * - 500 — Internal error (hashing, DB, PDF embedding, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // ------------------------------------------------------------------
    // 1. Authenticate
    // ------------------------------------------------------------------
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const userId = session.user.id as string;

    // ------------------------------------------------------------------
    // 2. Parse multipart form data
    // ------------------------------------------------------------------
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const documentId = formData.get('documentId') as string | null;
    const documentType = formData.get('documentType') as string | null;
    const methodRaw = formData.get('method') as string | null;
    const signatureData = formData.get('signatureData') as string | null;

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'Missing required field: file (PDF).' },
        { status: 400 },
      );
    }

    if (!documentId || documentId.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: documentId.' },
        { status: 400 },
      );
    }

    if (!documentType || documentType.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: documentType.' },
        { status: 400 },
      );
    }

    if (!methodRaw || !isSignatureMethod(methodRaw)) {
      return NextResponse.json(
        { error: `Invalid or missing method. Must be one of: ${ALLOWED_METHODS.join(', ')}.` },
        { status: 400 },
      );
    }

    const method: SignatureMethod = methodRaw;

    // ------------------------------------------------------------------
    // 3. Read PDF bytes
    // ------------------------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    if (pdfBytes.length === 0) {
      return NextResponse.json(
        { error: 'Uploaded file is empty.' },
        { status: 400 },
      );
    }

    // Basic PDF magic-number check (optional but catches obvious non-PDFs)
    if (
      pdfBytes[0] !== 0x25 || // %
      pdfBytes[1] !== 0x50 || // P
      pdfBytes[2] !== 0x44 || // D
      pdfBytes[3] !== 0x46    // F
    ) {
      return NextResponse.json(
        { error: 'Uploaded file is not a valid PDF.' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch surveyor profile from DB
    // ------------------------------------------------------------------
    const profileResult = await db.query(
      `SELECT full_name, isk_number, firm_name
         FROM profiles
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );

    const profileRows = profileResult.rows;

    if (!profileRows || profileRows.length === 0) {
      return NextResponse.json(
        { error: 'Surveyor profile not found. Please complete your profile before signing documents.' },
        { status: 400 },
      );
    }

    const surveyorName = profileRows[0].full_name ?? 'Unknown Surveyor';
    const iskNumber = profileRows[0].isk_number ?? '';
    const firmName = profileRows[0].firm_name ?? '';

    // ------------------------------------------------------------------
    // 5. Generate document hash and verification token
    // ------------------------------------------------------------------
    // Convert PDF bytes to base64 string for hashing (hashDocument expects string)
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const documentHash = hashDocument(pdfBase64);
    const signedAt = new Date().toISOString();
    const verificationToken = generateVerificationToken(
      documentId,
      signedAt,
      iskNumber || 'ISK/0000'
    );

    // ------------------------------------------------------------------
    // 6. Insert signature record into DB
    // ------------------------------------------------------------------
    await db.query(
      `INSERT INTO document_signatures
         (document_id, document_type, signed_by, surveyor_name, isk_number, firm_name,
          signed_at, document_hash, signature_data, method, verification_token, valid)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
      [
        documentId,
        documentType,
        userId,
        surveyorName,
        iskNumber,
        firmName,
        signedAt,
        documentHash,
        signatureData ?? '',
        method,
        verificationToken,
      ],
    );

    // ------------------------------------------------------------------
    // 7. Embed signature appearance into PDF
    // ------------------------------------------------------------------
    const appearanceData: SignatureAppearanceData = {
      surveyorName,
      iskNumber,
      firmName,
      signedAt,
      documentHash,
      verificationToken,
      method,
    };

    const signedPdfBytes = await embedSignatureAppearance(pdfBytes, appearanceData);

    // ------------------------------------------------------------------
    // 8. Return signed PDF as download
    // ------------------------------------------------------------------
    const safeFilename = documentId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const signedPdfBuffer = Buffer.from(signedPdfBytes);

    return new NextResponse(signedPdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="signed-${safeFilename}.pdf"`,
        'Content-Length': String(signedPdfBuffer.byteLength),
      },
    });
  } catch (error) {
    // ------------------------------------------------------------------
    // Error handling
    // ------------------------------------------------------------------
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred while signing the PDF.';

    console.error('[sign-pdf] Error:', message, error);

    // Distinguish client-facing vs internal details
    if (message.includes('PDF contains no pages') || message.includes('Failed to load PDF')) {
      return NextResponse.json(
        { error: 'The uploaded PDF could not be processed. It may be corrupted or password-protected.' },
        { status: 400 },
      );
    }

    if (message.includes('hash mismatch')) {
      return NextResponse.json(
        { error: 'Document integrity check failed during signing.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
