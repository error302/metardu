import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/scheme/batch?project_id=X — Generate ZIP with all deed plans for computed parcels
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

    // Verify project belongs to user
    const projectCheck = await db.query(
      'SELECT id, name, project_type FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, session.user.id]
    )
    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get all parcels with computed traverses
    const parcelsResult = await db.query(
      `SELECT p.id, p.parcel_number, p.lr_number_proposed, p.area_ha, p.status,
              b.block_number, b.block_name
       FROM parcels p
       JOIN blocks b ON b.id = p.block_id
       WHERE p.project_id = $1
       AND p.status IN ('computed', 'plan_generated', 'submitted', 'approved')
       ORDER BY b.block_number, p.parcel_number`,
      [projectId]
    )

    if (parcelsResult.rows.length === 0) {
      return NextResponse.json({ error: 'No computed parcels found. Run traverse computation on parcels first.' }, { status: 400 })
    }

    // Generate deed plans for each parcel
    const { jsPDF } = await import('jspdf')
    const { renderBoundaryPlan } = await import('@/lib/generators/deedPlanRenderer')

    const pdfBuffers: Array<{ filename: string; buffer: Buffer }> = []

    for (const parcel of parcelsResult.rows) {
      try {
        // Get traverse data
        const traverseCheck = await db.query(
          `SELECT pt.id, pt.accuracy_order, pt.total_perimeter, pt.computed_area_ha
           FROM parcel_traverses pt WHERE pt.parcel_id = $1`,
          [parcel.id]
        )
        if (traverseCheck.rows.length === 0) continue

        const traverse = traverseCheck.rows[0]
        const traverseId = traverse.id

        const coordsResult = await db.query(
          `SELECT station, easting, northing FROM traverse_coordinates WHERE traverse_id = $1 ORDER BY station`,
          [traverseId]
        )
        if (coordsResult.rows.length < 3) continue

        const stations = coordsResult.rows.map((c: any) => ({
          station: c.station,
          easting: parseFloat(c.easting),
          northing: parseFloat(c.northing),
          beaconNo: c.station,
          monument: 'psc found',
        }))

        const bearingSchedule: Array<{ bearing: string; distance: string }> = []
        for (let i = 0; i < stations.length; i++) {
          const from = stations[i]
          const to = stations[(i + 1) % stations.length]
          const dE = to.easting - from.easting
          const dN = to.northing - from.northing
          const dist = Math.sqrt(dE * dE + dN * dN)
          let wcbDeg = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360
          const wcbD = Math.floor(wcbDeg)
          const wcbM = Math.floor((wcbDeg - wcbD) * 60)
          const wcbS = ((wcbDeg - wcbD) * 60 - wcbM) * 60
          bearingSchedule.push({
            bearing: `${String(wcbD).padStart(3, '0')}\u00B0${String(wcbM).padStart(2, '0')}'${wcbS.toFixed(1)}"`,
            distance: dist.toFixed(3),
          })
        }

        const geom = {
          stations,
          bearingSchedule,
          minE: Math.min(...stations.map((s: any) => s.easting)),
          maxE: Math.max(...stations.map((s: any) => s.easting)),
          minN: Math.min(...stations.map((s: any) => s.northing)),
          maxN: Math.max(...stations.map((s: any) => s.northing)),
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('REPUBLIC OF KENYA', pageW / 2, 10, { align: 'center' })
        doc.setFontSize(9)
        doc.text('FORM NO. 4 \u2014 DEED PLAN', pageW / 2, 15, { align: 'center' })

        renderBoundaryPlan(doc, geom as any, { x: 10, y: 20, width: pageW - 20, height: pageH - 75 })

        const tableY = pageH - 52
        doc.setDrawColor(0)
        doc.setLineWidth(0.4)
        doc.rect(10, tableY, pageW - 20, 48)

        const areaStr = parcel.area_ha
          ? `${parseFloat(parcel.area_ha).toFixed(4)} Ha`
          : traverse.computed_area_ha
            ? `${parseFloat(traverse.computed_area_ha).toFixed(4)} Ha`
            : '\u2014'

        const infoPairs = [
          ['PARCEL:', parcel.parcel_number],
          ['LR NO.:', parcel.lr_number_proposed || 'Pending'],
          ['AREA:', areaStr],
          ['BLOCK:', `${parcel.block_number} \u2014 ${parcel.block_name || 'N/A'}`],
          ['ACCURACY:', traverse.accuracy_order || '\u2014'],
          ['PERIMETER:', traverse.total_perimeter ? `${parseFloat(traverse.total_perimeter).toFixed(3)} m` : '\u2014'],
        ]

        const curY = tableY + 5
        for (let i = 0; i < infoPairs.length; i++) {
          const col = i < 3 ? 12 : pageW / 2 + 5
          const row = i < 3 ? i : i - 3
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.text(infoPairs[i][0], col, curY + row * 6)
          doc.setFont('helvetica', 'normal')
          doc.text(String(infoPairs[i][1]), col + 28, curY + row * 6)
        }

        const pdfBuf = Buffer.from(doc.output('arraybuffer'))

        const safeLR = (parcel.lr_number_proposed || parcel.parcel_number).replace(/[\/\\]/g, '-')
        pdfBuffers.push({
          filename: `Block${parcel.block_number}_${safeLR}_DeedPlan.pdf`,
          buffer: pdfBuf,
        })
      } catch (err) {
        console.error(`Failed to generate deed plan for parcel ${parcel.id}:`, err)
        // Skip failed parcels
      }
    }

    if (pdfBuffers.length === 0) {
      return NextResponse.json({ error: 'No deed plans could be generated' }, { status: 500 })
    }

    // Create ZIP using Node.js built-in (or JSZip)
    let zipBuffer: Buffer
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const pdf of pdfBuffers) {
        zip.file(pdf.filename, pdf.buffer)
      }
      zipBuffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))
    } catch {
      // Fallback: return first PDF if JSZip not available
      return new NextResponse(pdfBuffers[0].buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfBuffers[0].filename}"`,
        },
      })
    }

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="DeedPlans_Project${projectId}_${pdfBuffers.length}parcels.zip"`,
      },
    })
  } catch (error) {
    console.error('Batch generation error:', error)
    return NextResponse.json({ error: 'Failed to generate batch deed plans', details: String(error) }, { status: 500 })
  }
}
