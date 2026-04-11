import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateBeaconDescriptionPdf } from '@/lib/compute/beaconDescriptionPdf'
import type { BeaconDescriptionData } from '@/lib/compute/beaconDescriptionPdf'

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

    if (!data.beacons || !Array.isArray(data.beacons) || data.beacons.length === 0) {
      return NextResponse.json({ error: 'Beacons array is required and must not be empty.' }, { status: 400 })
    }

    const pdfBytes = generateBeaconDescriptionPdf(data as BeaconDescriptionData)
    const buffer = Buffer.from(pdfBytes)
    const filename = `beacon_description_${Date.now()}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during beacon description generation.'
    console.error('[beacon-description] Error:', message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
