import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { generateCrossSectionPdf } from '@/lib/compute/crossSectionPdf'
import type { CrossSectionData } from '@/lib/compute/crossSectionPdf'

export const dynamic = 'force-dynamic'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const body = ctx.body as { data?: unknown } | null
  const data = body?.data

  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing data field.' }, { status: 400 })
  }

  const dataObj = data as Record<string, unknown>
  if (!dataObj.points || !Array.isArray(dataObj.points) || dataObj.points.length < 2) {
    return NextResponse.json({ error: 'At least 2 profile points are required.' }, { status: 400 })
  }

  const pdfBytes = generateCrossSectionPdf(data as CrossSectionData)
  const buffer = Buffer.from(pdfBytes)
  const filename = `cross_section_${Date.now()}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  })
})
