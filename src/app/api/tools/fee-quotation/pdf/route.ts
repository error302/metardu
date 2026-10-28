import { NextRequest, NextResponse } from 'next/server'
import { generateQuotePdf } from '@/lib/business/generateQuotePdf'
import { feeQuoteInputSchema } from '@/lib/business/feeQuoteInput'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const parsed = feeQuoteInputSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid quotation input', issues: parsed.error.issues }, { status: 400 })
    const input = parsed.data
    const pdfBuffer = generateQuotePdf(input)

    const sanitizedLr = (input.lrNumber || input.projectName || 'Quotation')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30)

    const filename = `Survey_Fee_Quotation_${sanitizedLr}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate fee quotation PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
