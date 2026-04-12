/**
 * CLA Forms API — Community Land Act 2016 Form Generation
 *
 * GET  /api/cla-forms       → List available form types
 * POST /api/cla-forms       → Generate a specific CLA form PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { CLA_FORM_REGISTRY } from '@/lib/legal/claForms';

export const dynamic = 'force-dynamic';

/** GET: Return list of available CLA forms */
export async function GET() {
  const forms = Object.entries(CLA_FORM_REGISTRY).map(([key, value]) => ({
    formType: key,
    claFormNumber: value.claFormNumber,
    description: value.description,
  }));

  return NextResponse.json({
    success: true,
    data: forms,
  });
}

/** POST: Generate a CLA form PDF */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formType, data } = body;

    if (!formType || typeof formType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid formType field.' },
        { status: 400 }
      );
    }

    const formEntry = CLA_FORM_REGISTRY[formType];

    if (!formEntry) {
      const available = Object.keys(CLA_FORM_REGISTRY).join(', ');
      return NextResponse.json(
        { success: false, error: `Unknown form type: "${formType}". Available: ${available}` },
        { status: 400 }
      );
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid data field.' },
        { status: 400 }
      );
    }

    const pdfBytes = formEntry.generator(data);

    if (!pdfBytes || pdfBytes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'PDF generation failed — empty output.' },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(pdfBytes);
    const filename = `${formType}_${Date.now()}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during CLA form generation.';
    console.error('[cla-forms] Generation error:', message, error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
