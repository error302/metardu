import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/scheme/rim?project_id=X — Generate Registry Index Map (overview of all parcels)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const projectCheck = await db.query(
      'SELECT id, name, location, project_type FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, session.user.id]
    )
    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = projectCheck.rows[0]

    // Get scheme details
    let scheme: any = {}
    try {
      const sd = await db.query('SELECT * FROM scheme_details WHERE project_id = $1', [projectId])
      if (sd.rows.length > 0) scheme = sd.rows[0]
    } catch {}

    // Get all blocks with parcels and their coordinates
    const blocksResult = await db.query(
      `SELECT b.id, b.block_number, b.block_name
       FROM blocks b WHERE b.project_id = $1 ORDER BY b.block_number`,
      [projectId]
    )

    if (blocksResult.rows.length === 0) {
      return NextResponse.json({ error: 'No blocks found' }, { status: 400 })
    }

    // Get all parcels with coordinates
    const parcelsResult = await db.query(
      `SELECT p.id, p.parcel_number, p.lr_number_proposed, p.area_ha, p.block_id,
              p.status, b.block_number
       FROM parcels p
       JOIN blocks b ON b.id = p.block_id
       WHERE p.project_id = $1
       ORDER BY b.block_number, p.parcel_number`,
      [projectId]
    )

    // For each parcel, get traverse coordinates
    const parcelGeoms: Array<{
      parcel_id: number
      parcel_number: string
      lr_number: string | null
      block_number: string
      area_ha: number | null
      status: string
      coordinates: Array<{ station: string; easting: number; northing: number }>
    }> = []

    for (const parcel of parcelsResult.rows) {
      const coordCheck = await db.query(
        `SELECT tc.station, tc.easting, tc.northing
         FROM traverse_coordinates tc
         JOIN parcel_traverses pt ON pt.id = tc.traverse_id
         WHERE pt.parcel_id = $1
         ORDER BY tc.station`,
        [parcel.id]
      )
      if (coordCheck.rows.length >= 3) {
        parcelGeoms.push({
          parcel_id: parcel.id,
          parcel_number: parcel.parcel_number,
          lr_number: parcel.lr_number_proposed,
          block_number: parcel.block_number,
          area_ha: parcel.area_ha ? parseFloat(parcel.area_ha) : null,
          status: parcel.status,
          coordinates: coordCheck.rows.map((c: any) => ({
            station: c.station,
            easting: parseFloat(c.easting),
            northing: parseFloat(c.northing),
          })),
        })
      }
    }

    if (parcelGeoms.length === 0) {
      return NextResponse.json({ error: 'No parcels with computed coordinates found' }, { status: 400 })
    }

    // Generate RIM PDF
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    // Header
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('REGISTRY INDEX MAP', pageW / 2, 12, { align: 'center' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Scheme: ${scheme.scheme_number || project.name}  |  ${scheme.county || ''} ${scheme.sub_county || ''} ${scheme.ward || ''}`, pageW / 2, 18, { align: 'center' })

    // Draw area
    const margin = 15
    const drawX = margin
    const drawY = 24
    const drawW = pageW - margin * 2
    const drawH = pageH - 55

    doc.setDrawColor(0)
    doc.setLineWidth(0.3)
    doc.rect(drawX, drawY, drawW, drawH)

    // Find bounds
    const allCoords = parcelGeoms.flatMap(p => p.coordinates)
    const minE = Math.min(...allCoords.map(c => c.easting))
    const maxE = Math.max(...allCoords.map(c => c.easting))
    const minN = Math.min(...allCoords.map(c => c.northing))
    const maxN = Math.max(...allCoords.map(c => c.northing))

    const spanE = maxE - minE || 1
    const spanN = maxN - minN || 1
    const scaleFromE = spanE / (drawW / 1000)
    const scaleFromN = spanN / (drawH / 1000)
    const rawScale = Math.max(scaleFromE, scaleFromN) * 1.2

    const standardScales = [100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000]
    const scaleRatio = standardScales.find(s => s >= rawScale) || 20000

    const centreE = (minE + maxE) / 2
    const centreN = (minN + maxN) / 2

    const worldToMm = (e: number, n: number): [number, number] => {
      return [
        drawX + drawW / 2 + ((e - centreE) / scaleRatio) * 1000,
        drawY + drawH / 2 - ((n - centreN) / scaleRatio) * 1000,
      ]
    }

    // Draw each parcel polygon
    const statusColors: Record<string, [number, number, number]> = {
      pending: [180, 180, 180],
      field_complete: [100, 149, 237],
      computed: [255, 193, 7],
      plan_generated: [76, 175, 80],
      submitted: [156, 39, 176],
      approved: [22, 163, 74],
    }

    for (const parcel of parcelGeoms) {
      const color = statusColors[parcel.status] || [180, 180, 180]
      const pts = parcel.coordinates.map(c => worldToMm(c.easting, c.northing))

      // Fill
      doc.setFillColor(color[0], color[1], color[2], 0.2)
      doc.setDrawColor(color[0], color[1], color[2])
      doc.setLineWidth(0.5)

      // Draw filled polygon
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]

        // Use jsPDF lines for fill approximation
        doc.setLineWidth(0.8)
        doc.line(x1, y1, x2, y2)
      }

      // Parcel label at centroid
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length

      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5)
      doc.text(parcel.parcel_number, cx, cy - 1.5, { align: 'center' })
      if (parcel.lr_number) {
        doc.setFontSize(4.5)
        doc.setFont('helvetica', 'normal')
        doc.text(parcel.lr_number, cx, cy + 1, { align: 'center' })
      }
    }

    // Legend (bottom-right)
    const legendX = pageW - margin - 80
    const legendY = pageH - 42
    doc.setDrawColor(0)
    doc.setLineWidth(0.3)
    doc.rect(legendX, legendY, 75, 28)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.text('STATUS LEGEND', legendX + 37, legendY + 3, { align: 'center' })

    const legendItems = [
      { label: 'Computed', color: [255, 193, 7] },
      { label: 'Plan Gen.', color: [76, 175, 80] },
      { label: 'Submitted', color: [156, 39, 176] },
      { label: 'Approved', color: [22, 163, 74] },
    ]
    for (let i = 0; i < legendItems.length; i++) {
      const col = i < 2 ? 0 : 1
      const row = i % 2
      const x = legendX + 4 + col * 38
      const y = legendY + 7 + row * 8
      doc.setFillColor(legendItems[i].color[0], legendItems[i].color[1], legendItems[i].color[2])
      doc.rect(x, y - 1.5, 4, 3, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0)
      doc.text(legendItems[i].label, x + 6, y)
    }

    // Info bar
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total Parcels: ${parcelGeoms.length}  |  Blocks: ${blocksResult.rows.length}  |  Scale: 1:${scaleRatio}`, margin, pageH - 12)
    doc.setFont('helvetica', 'normal')
    doc.text(`Datum: ARC 1960  |  Projection: UTM Zone 37S  |  Date: ${new Date().toLocaleDateString('en-GB')}`, margin, pageH - 7)

    const pdfBase64 = doc.output('datauristring').split(',')[1]

    return new NextResponse(
      Buffer.from(pdfBase64, 'base64'),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="RIM_${(scheme.scheme_number || project.name).replace(/\s+/g, '_')}.pdf"`,
        },
      }
    )
  } catch (error) {
    console.error('RIM generation error:', error)
    return NextResponse.json({ error: 'Failed to generate RIM', details: String(error) }, { status: 500 })
  }
}
