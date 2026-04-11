import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateCrossSectionPdf } from '@/lib/compute/crossSectionPdf'
import type { CrossSectionData } from '@/lib/compute/crossSectionPdf'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const body = await request.json()
    const { data } = body

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Missing data field.' }, { status: 400 })
    }

    if (!data.points || !Array.isArray(data.points) || data.points.length < 2) {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during cross-section generation.'
    console.error('[cross-section] Error:', message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
