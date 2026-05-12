import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { jsPDF } from 'jspdf'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // Fetch project and scheme details
    const { rows: projects } = await db.query(
      `SELECT p.*, sd.scheme_number, sd.county, sd.sub_county, sd.ward, 
              sd.adjudication_section, sd.planned_parcels
       FROM projects p
       LEFT JOIN scheme_details sd ON sd.project_id = p.id
       WHERE p.id = $1`,
      [projectId]
    )

    if (projects.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = projects[0]
    const { rows: parcels } = await db.query(
      `SELECT p.*, b.block_number
       FROM parcels p
       JOIN blocks b ON b.id = p.block_id
       WHERE b.project_id = $1
       ORDER BY b.block_number, p.parcel_number`,
      [projectId]
    )

    // Generate Form No. 4 PDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15

    // Title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('FORM NO. 4 â€” SURVEY PLAN', pageWidth / 2, 25, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('(Regulation 13(1) of the Survey Act, Cap 299)', pageWidth / 2, 32, { align: 'center' })

    // Scheme info table
    let y = 45
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('PARTICULARS OF THE SURVEY', margin, y)
    y += 8

    const info = [
      ['Scheme Number', project.scheme_number || '-'],
      ['County', project.county || '-'],
      ['Sub-County', project.sub_county || '-'],
      ['Ward', project.ward || '-'],
      ['Adjudication Section', project.adjudication_section || '-'],
      ['Total Parcels', String(project.planned_parcels || parcels.length)],
      ['Project Name', project.name],
      ['Survey Type', project.survey_type || '-'],
      ['Datum', project.datum || 'ARC 1960'],
      ['UTM Zone', `${project.utm_zone || '37S'}`],
    ]

    doc.setFontSize(9)
    info.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold')
      doc.text(`${label}:`, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.text(value, margin + 60, y)
      y += 6
    })

    // Parcel summary table
    y += 5
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('PARCEL SUMMARY', margin, y)
    y += 8

    doc.setFontSize(8)
    const tableHeaders = ['Block', 'Parcel No.', 'LR No.', 'Area (ha)', 'Status']
    const colWidths = [25, 30, 40, 30, 30]
    let x = margin

    // Header row
    doc.setFillColor(50, 50, 50)
    doc.rect(x, y - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    tableHeaders.forEach((h, i) => {
      doc.text(h, x + 2, y)
      x += colWidths[i]
    })
    doc.setTextColor(0, 0, 0)
    y += 7

    // Data rows
    doc.setFont('helvetica', 'normal')
    parcels.forEach((p: any) => {
      if (y > pageHeight - 30) {
        doc.addPage()
        y = 20
      }
      x = margin
      const row = [p.block_number, p.parcel_number, p.lr_number_proposed || '-', 
                   p.area_ha ? Number(p.area_ha).toFixed(4) : '-', p.status || 'pending']
      row.forEach((val, i) => {
        doc.text(String(val), x + 2, y)
        x += colWidths[i]
      })
      y += 5
    })

    // Certificate section
    y += 15
    if (y > pageHeight - 60) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('CERTIFICATE', margin, y)
    y += 10
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('I certify that the survey described above has been carried out by me in accordance', margin, y)
    y += 5
    doc.text('with the Survey Act (Cap 299) and the Regulations made thereunder, and that all', margin, y)
    y += 5
    doc.text('particulars shown on this plan are correct to the best of my knowledge and belief.', margin, y)

    y += 20
    doc.text('.....................................................', margin + 20, y)
    doc.text('.....................................................', margin + 180, y)
    y += 5
    doc.text('Licensed Surveyor', margin + 20, y)
    doc.text('Date', margin + 180, y)
    y += 5
    doc.text(`Name: ${session.user.name || 'Surveyor'}`, margin + 20, y)
    y += 5
    doc.text(`ISK No: ${(session.user as any).isk_number || '...................'}`, margin + 20, y)

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Form_4_${project.scheme_number || project.name}.pdf"`,
      },
    })
  } catch (err: any) {
    console.error('[GET form-no-4] Error:', err.message)
    return NextResponse.json({ error: 'Failed to generate Form No. 4' }, { status: 500 })
  }
}
