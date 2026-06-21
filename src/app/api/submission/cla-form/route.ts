/**
 * METARDU — CLA (Community Land Act) Form Generator API
 *
 * POST /api/submission/cla-form
 *
 * Generates PDF documents for Kenya Community Land Act 2016 forms.
 * Supports Forms 1, 2, 3, 4, 5, 6, 9, 11, and 12.
 *
 * @module cla-form-route
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import {
  CLA_FORMS,
  getClaFormGenerator,
  getClaFormMetadata,
  isValidClaFormNumber,
  type ClaFormNumber,
} from '@/lib/submission/generators/claForms';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET handler — List available CLA forms
// ---------------------------------------------------------------------------

/**
 * Returns metadata for all available Community Land Act forms.
 * No authentication required for listing.
 */
export const GET = apiHandler({ auth: false, rateLimit: { max: 20, windowMs: 60000 } }, async () => {
  return NextResponse.json({
    forms: CLA_FORMS.map((f) => ({
      formNumber: f.formNumber,
      title: f.title,
      section: f.section,
      description: f.description,
    })),
    count: CLA_FORMS.length,
  });
})

// ---------------------------------------------------------------------------
// POST handler — Generate a specific CLA form PDF
// ---------------------------------------------------------------------------

/**
 * Generate a CLA form PDF.
 *
 * **Request body** (JSON):
 * - `formNumber` — One of: 1, 2, 3, 4, 5, 6, 9, 11, 12 (required)
 * - `formData`   — Object containing all fields for the specific form (required)
 * - `projectId`  — Optional project ID for audit trail
 *
 * **Response** (on success):
 * - `Content-Type: application/pdf`
 * - `Content-Disposition: attachment; filename="CLA-Form-{N}.pdf"`
 * - Body: PDF bytes
 */
export const POST = apiHandler({ auth: true, audit: 'cla_form_generated' }, async (req, ctx) => {
  const userId = ctx.userId

  const body = ctx.body as {
    formNumber: number;
    formData: Record<string, unknown>;
    projectId?: string;
  } | null

  if (!body) {
    return NextResponse.json({ error: 'Missing request body.' }, { status: 400 })
  }

  const { formNumber, formData, projectId } = body

  // Validate form number
  if (!formNumber || !isValidClaFormNumber(formNumber)) {
    return NextResponse.json(
      {
        error: `Invalid form number: ${formNumber}. Supported: ${CLA_FORMS.map((f) => f.formNumber).join(', ')}`,
      },
      { status: 400 },
    );
  }

  if (!formData || typeof formData !== 'object' || Object.keys(formData).length === 0) {
    return NextResponse.json(
      { error: 'Missing required field: formData (object with form fields).' },
      { status: 400 },
    );
  }

  // Get the generator function
  const claNumber = formNumber as ClaFormNumber;
  const generator = getClaFormGenerator(claNumber);
  const metadata = getClaFormMetadata(claNumber);

  if (!generator) {
    return NextResponse.json(
      { error: `Generator not found for form ${formNumber}.` },
      { status: 500 },
    );
  }

  // Generate the PDF
  const pdfBytes = generator(formData);

  if (!pdfBytes || pdfBytes.length === 0) {
    return NextResponse.json(
      { error: `Failed to generate CLA Form ${formNumber}. The generator returned empty content.` },
      { status: 500 },
    );
  }

  // Log the generation (optional audit)
  if (userId) {
    console.log(
      `[cla-form] User ${userId} generated CLA Form ${formNumber} (${metadata?.title})` +
      (projectId ? ` for project ${projectId}` : ''),
    );
  }

  // Return PDF (convert to Buffer for proper streaming)
  const pdfBuffer = Buffer.from(pdfBytes);
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="CLA-Form-${formNumber}-${(metadata?.title ?? 'document').replace(/\s+/g, '-').toLowerCase()}.pdf"`,
      'Content-Length': String(pdfBuffer.byteLength),
    },
  });
})
