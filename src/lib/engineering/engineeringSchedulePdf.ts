import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface EngineeringScheduleSection {
  title: string
  headers: string[]
  rows: unknown[][]
}

export interface EngineeringSchedulePdfOptions {
  title: string
  projectName: string
  coordinateReference?: string
  sections: EngineeringScheduleSection[]
  notes?: string[]
  generatedAt?: Date
}

function pdfCell(value: unknown): string {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return '—'
  return String(value)
}

/** Build a reviewable A3 landscape schedule report from saved project values. */
export function generateEngineeringSchedulePdf(options: EngineeringSchedulePdfOptions): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12

  doc.setProperties({
    title: options.title,
    subject: 'Engineering calculation schedules for review',
    author: 'METARDU',
    creator: 'METARDU',
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(27, 58, 92)
  doc.text(options.title, margin, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(50, 58, 68)
  doc.text(`Project: ${options.projectName || 'Unnamed project'}`, margin, 22)
  doc.text(`Coordinate reference: ${options.coordinateReference || 'NOT DECLARED'}`, margin, 27)
  doc.text(`Generated: ${(options.generatedAt ?? new Date()).toISOString()}`, pageWidth - margin, 22, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(150, 62, 20)
  doc.text('DRAFT - REVIEW REQUIRED - NOT APPROVED FOR CONSTRUCTION', margin, 34)

  let cursorY = 42
  for (const section of options.sections) {
    if (cursorY > pageHeight - 25) {
      doc.addPage()
      cursorY = 18
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(27, 58, 92)
    doc.text(section.title, margin, cursorY)

    if (section.rows.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(90, 90, 90)
      doc.text('No rows available in the saved project data.', margin, cursorY + 6)
      cursorY += 14
      continue
    }

    autoTable(doc, {
      startY: cursorY + 3,
      margin: { left: margin, right: margin, bottom: 14 },
      head: [section.headers],
      body: section.rows.map(row => row.map(pdfCell)),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', textColor: [35, 42, 50] },
      headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [242, 245, 248] },
      rowPageBreak: 'avoid',
    })
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 12
    cursorY = finalY + 9
  }

  if (options.notes?.length) {
    if (cursorY > pageHeight - 35) {
      doc.addPage()
      cursorY = 18
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(27, 58, 92)
    doc.text('Review notes', margin, cursorY)
    cursorY += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(50, 58, 68)
    for (const note of options.notes) {
      const lines = doc.splitTextToSize(`- ${note}`, pageWidth - margin * 2)
      for (const line of lines) {
        if (cursorY > pageHeight - 18) {
          doc.addPage()
          cursorY = 18
        }
        doc.text(line, margin, cursorY)
        cursorY += 4
      }
    }
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(190, 198, 208)
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(90, 98, 108)
    doc.text('METARDU | Preliminary engineering schedule | Verify against approved project documents and field conditions', margin, pageHeight - 6)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}
