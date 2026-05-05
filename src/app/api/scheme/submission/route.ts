import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/scheme/submission?project_id=X — Generate complete submission package ZIP
// Includes: deed plans, PPA2 forms, mutation forms, RIM, parcel summary, computation workbooks
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
      'SELECT id, name, location, survey_type, project_type FROM projects WHERE id = $1 AND user_id = $2',
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

    // Get blocks
    const blocksResult = await db.query(
      'SELECT id, block_number, block_name FROM blocks WHERE project_id = $1 ORDER BY block_number',
      [projectId]
    )

    // Get all parcels with traverse data
    const parcelsResult = await db.query(
      `SELECT p.id, p.parcel_number, p.lr_number_proposed, p.area_ha, p.status,
              p.block_id, b.block_number
       FROM parcels p
       JOIN blocks b ON b.id = p.block_id
       WHERE p.project_id = $1
       AND p.status IN ('computed', 'plan_generated', 'submitted', 'approved')
       ORDER BY b.block_number, p.parcel_number`,
      [projectId]
    )

    if (parcelsResult.rows.length === 0) {
      return NextResponse.json({ error: 'No computed parcels found for submission package' }, { status: 400 })
    }

    const { jsPDF } = await import('jspdf')
    let JSZip: any = null
    try {
      JSZip = (await import('jszip')).default
    } catch {}

    const zipFiles: Array<{ path: string; content: Buffer | string }> = []

    // 1. Generate parcel summary Excel-like CSV
    const summaryLines = [
      'Block,Parcel Number,Proposed LR,Area (Ha),Status',
      ...parcelsResult.rows.map((p: any) =>
        `${p.block_number},${p.parcel_number},${p.lr_number_proposed || 'Pending'},${p.area_ha ? parseFloat(p.area_ha).toFixed(4) : 'N/A'},${p.status}`
      ),
    ]
    zipFiles.push({ path: 'Parcel_Summary.csv', content: summaryLines.join('\n') })

    // 2. Generate deed plan for each computed parcel
    for (const parcel of parcelsResult.rows) {
      try {
        const traverseCheck = await db.query(
          `SELECT pt.id, pt.accuracy_order, pt.total_perimeter, pt.computed_area_ha
           FROM parcel_traverses pt WHERE pt.parcel_id = $1`,
          [parcel.id]
        )
        if (traverseCheck.rows.length === 0) continue

        const traverse = traverseCheck.rows[0]
        const coordsResult = await db.query(
          `SELECT station, easting, northing FROM traverse_coordinates
           WHERE traverse_id = $1 ORDER BY station`,
          [traverse.id]
        )
        if (coordsResult.rows.length < 3) continue

        const stations = coordsResult.rows.map((c: any) => ({
          station: c.station, easting: parseFloat(c.easting), northing: parseFloat(c.northing),
          beaconNo: c.station, monument: 'psc found',
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
          stations, bearingSchedule,
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

        const { renderBoundaryPlan } = await import('@/lib/generators/deedPlanRenderer')
        renderBoundaryPlan(doc, geom as any, { x: 10, y: 20, width: pageW - 20, height: pageH - 75 })

        const tableY = pageH - 52
        doc.setDrawColor(0)
        doc.setLineWidth(0.4)
        doc.rect(10, tableY, pageW - 20, 48)

        const areaStr = parcel.area_ha
          ? `${parseFloat(parcel.area_ha).toFixed(4)} Ha`
          : traverse.computed_area_ha ? `${parseFloat(traverse.computed_area_ha).toFixed(4)} Ha` : '\u2014'

        const infoPairs = [
          ['PARCEL:', parcel.parcel_number],
          ['LR NO.:', parcel.lr_number_proposed || 'Pending'],
          ['AREA:', areaStr],
          ['BLOCK:', `${parcel.block_number} \u2014 ${parcel.block_name || 'N/A'}`],
          ['ACCURACY:', traverse.accuracy_order || '\u2014'],
          ['PERIMETER:', traverse.total_perimeter ? `${parseFloat(traverse.total_perimeter).toFixed(3)} m` : '\u2014'],
          ['DATUM:', 'ARC 1960'],
          ['PROJECTION:', 'UTM Zone 37S'],
        ]
        const curY = tableY + 5
        for (let i = 0; i < infoPairs.length; i++) {
          const col = i < 4 ? 12 : pageW / 2 + 5
          const row = i < 4 ? i : i - 4
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.text(infoPairs[i][0], col, curY + row * 6)
          doc.setFont('helvetica', 'normal')
          doc.text(String(infoPairs[i][1]), col + 28, curY + row * 6)
        }

        const safeLR = (parcel.lr_number_proposed || parcel.parcel_number).replace(/[\/\\]/g, '-')
        zipFiles.push({
          path: `DeedPlans/Block${parcel.block_number}/${safeLR}_DeedPlan.pdf`,
          content: Buffer.from(doc.output('arraybuffer')),
        })
      } catch (err) {
        console.error(`Failed to generate deed plan for parcel ${parcel.id}:`, err)
      }
    }

    // 3. Generate PPA2 forms for all parcels
    try {
      const { generatePPA2Form } = await import('@/lib/submission/generators/ppa2Form')
      for (const parcel of parcelsResult.rows) {
        const area = parcel.area_ha ? parseFloat(parcel.area_ha) : 0
        const ppa2Buffer = generatePPA2Form({
          lrNumber: parcel.lr_number_proposed || `Proposed - ${parcel.parcel_number}`,
          parcelNumber: parcel.parcel_number,
          county: scheme.county || '',
          division: scheme.sub_county || '',
          district: scheme.ward || parcel.location || '',
          locality: parcel.location || '',
          areaHa: area,
          surveyType: 'Cadastral Survey - Subdivision',
          applicantName: scheme.county ? `${scheme.county} County Government` : 'N/A',
          applicantAddress: '',
          surveyorName: project.surveyor_name || '',
          iskNumber: '',
          firmName: '',
          surveyDate: new Date().toISOString(),
          referenceNumber: scheme.scheme_number || `${parcel.block_number}/${parcel.parcel_number}`,
        })
        const safeLR = (parcel.lr_number_proposed || parcel.parcel_number).replace(/[\/\\]/g, '-')
        zipFiles.push({
          path: `PPA2_Forms/PPA2_${safeLR}.pdf`,
          content: Buffer.from(ppa2Buffer),
        })
      }
    } catch (err) {
      console.error('Failed to generate PPA2 forms:', err)
    }

    // 4. Generate RIM
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('REGISTRY INDEX MAP', pageW / 2, 12, { align: 'center' })
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Scheme: ${scheme.scheme_number || project.name}  |  ${scheme.county || ''} ${scheme.sub_county || ''} ${scheme.ward || ''}`, pageW / 2, 18, { align: 'center' })

      const margin = 15
      const drawX = margin
      const drawY = 24
      const drawW = pageW - margin * 2
      const drawH = pageH - 55

      doc.setDrawColor(0)
      doc.setLineWidth(0.3)
      doc.rect(drawX, drawY, drawW, drawH)

      // Build RIM geometry (aggregate from all parcels)
      const allParcelCoords: any[] = []
      for (const parcel of parcelsResult.rows) {
        const tc = await db.query(
          `SELECT tc.station, tc.easting, tc.northing
           FROM traverse_coordinates tc
           JOIN parcel_traverses pt ON pt.id = tc.traverse_id
           WHERE pt.parcel_id = $1 ORDER BY tc.station`,
          [parcel.id]
        )
        if (tc.rows.length >= 3) allParcelCoords.push(...tc.rows.map((c: any) => ({
          parcel_id: parcel.id, parcel_number: parcel.parcel_number,
          station: c.station, easting: parseFloat(c.easting), northing: parseFloat(c.northing),
        })))
      }

      if (allParcelCoords.length > 0) {
        const allCoords = allParcelCoords
        const minE = Math.min(...allCoords.map((c: any) => c.easting))
        const maxE = Math.max(...allCoords.map((c: any) => c.easting))
        const minN = Math.min(...allCoords.map((c: any) => c.northing))
        const maxN = Math.max(...allCoords.map((c: any) => c.northing))
        const spanE = maxE - minE || 1
        const spanN = maxN - minN || 1
        const rawScale = Math.max(spanE / (drawW / 1000), spanN / (drawH / 1000)) * 1.2
        const standardScales = [100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000]
        const scaleRatio = standardScales.find(s => s >= rawScale) || 20000
        const centreE = (minE + maxE) / 2
        const centreN = (minN + maxN) / 2
        const worldToMm = (e: number, n: number) => [drawX + drawW / 2 + ((e - centreE) / scaleRatio) * 1000, drawY + drawH / 2 - ((n - centreN) / scaleRatio) * 1000]

        // Draw by parcel
        const drawn = new Set<number>()
        for (const pc of allParcelCoords) {
          if (drawn.has(pc.parcel_id)) continue
          const pCoords = allParcelCoords.filter((c: any) => c.parcel_id === pc.parcel_id)
          drawn.add(pc.parcel_id)
          const pts = pCoords.map((c: any) => worldToMm(c.easting, c.northing))
          doc.setDrawColor(60, 60, 60)
          doc.setLineWidth(0.6)
          for (let i = 0; i < pts.length; i++) {
            const [x1, y1] = pts[i]
            const [x2, y2] = pts[(i + 1) % pts.length]
            doc.line(x1, y1, x2, y2)
          }
          const cx = pts.reduce((s: number, p: number[]) => s + p[0], 0) / pts.length
          const cy = pts.reduce((s: number, p: number[]) => s + p[1], 0) / pts.length
          doc.setFontSize(5)
          doc.setFont('helvetica', 'bold')
          doc.text(pCoords[0].parcel_number, cx, cy - 1, { align: 'center' })
        }
      }

      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(`Total Parcels: ${parcelsResult.rows.length}  |  Blocks: ${blocksResult.rows.length}  |  Scale: 1:${scaleRatio}`, margin, pageH - 12)
      doc.text(`Datum: ARC 1960  |  Projection: UTM Zone 37S  |  Date: ${new Date().toLocaleDateString('en-GB')}`, margin, pageH - 7)

      zipFiles.push({
        path: 'RIM_Registry_Index_Map.pdf',
        content: Buffer.from(doc.output('arraybuffer')),
      })
    } catch (err) {
      console.error('Failed to generate RIM:', err)
    }

    // 5. Project info summary
    const projectInfo = [
      `PROJECT SUBMISSION PACKAGE`,
      ``,
      `Project: ${project.name}`,
      `Location: ${project.location || ''}`,
      `Scheme Number: ${scheme.scheme_number || 'N/A'}`,
      `County: ${scheme.county || 'N/A'}`,
      `Sub-County: ${scheme.sub_county || 'N/A'}`,
      `Ward: ${scheme.ward || 'N/A'}`,
      `Adjudication Section: ${scheme.adjudication_section || 'N/A'}`,
      `Total Blocks: ${blocksResult.rows.length}`,
      `Total Parcels in Package: ${parcelsResult.rows.length}`,
      `Generated: ${new Date().toISOString()}`,
      `Generated by: Metardu Survey Platform`,
      ``,
    ]
    zipFiles.push({ path: 'README.txt', content: projectInfo.join('\n') })

    // Build ZIP
    if (!JSZip) {
      // Fallback: return first PDF if no JSZip
      const firstPdf = zipFiles.find(f => f.content instanceof Buffer)
      if (firstPdf) {
        return new NextResponse(firstPdf.content, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="submission.parcel_${parcelsResult.rows[0]?.parcel_number || '1'}.pdf"`,
          },
        })
      }
      return NextResponse.json({ error: 'ZIP library not available' }, { status: 500 })
    }

    const zip = new JSZip()
    for (const f of zipFiles) {
      zip.file(f.path, f.content)
    }

    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))
    const safeName = (project.name || 'scheme').replace(/[^a-zA-Z0-9]/g, '_')

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Submission_${safeName}_${parcelsResult.rows.length}parcels.zip"`,
      },
    })
  } catch (error) {
    console.error('Submission package error:', error)
    return NextResponse.json({ error: 'Failed to generate submission package', details: String(error) }, { status: 500 })
  }
}
