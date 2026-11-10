import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { readReportBlocks } from '@/lib/compute/reportExportBlocks'
import type { SectionContent } from '@/types/surveyReport'

export interface PdfGenerationOptions {
  title: string
  sections: SectionContent[]
  paperSize?: 'A4' | 'A3'
  orientation?: 'portrait' | 'landscape'
}

export async function generatePdf({ title, sections, paperSize = 'A4', orientation = 'portrait' }: PdfGenerationOptions): Promise<Buffer> {
  const pdf = new jsPDF({ format: paperSize.toLowerCase(), orientation, unit: 'mm' })
  const margin = 15, pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight()
  let y = margin
  const write = (value: string, size = 11, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    const step = size * 0.47
    const lines = pdf.splitTextToSize(value, pageWidth - 2 * margin) as string[]
    for (const line of lines) {
      if (y + step >= pageHeight - margin) { pdf.addPage(); y = margin }
      pdf.text(line, margin, y)
      y += step
    }
    y += 2
  }
  pdf.setProperties({ title, creator: 'METARDU' })
  write(title, 18, true)
  for (const section of sections) {
    if (y + 20 >= pageHeight - margin) { pdf.addPage(); y = margin }
    if (section.section !== 'TITLE_PAGE') write(section.sectionNumber + '. ' + section.title, 13, true)
    for (const block of readReportBlocks(section.content)) {
      if (block.kind === 'text') write(block.text)
      else {
        autoTable(pdf, { startY: y, margin, head: block.head, body: block.body,
          styles: { fontSize: 9, overflow: 'linebreak', cellPadding: 1.8 },
          headStyles: { fillColor: [27, 58, 92] }, rowPageBreak: 'avoid', showHead: 'everyPage' })
        const layout = pdf as jsPDF & { lastAutoTable?: { finalY: number } }
        y = (layout.lastAutoTable?.finalY ?? y) + 5
      }
    }
    y += 4
  }
  for (let page = 1, count = pdf.getNumberOfPages(); page <= count; page++) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('METARDU | Survey report draft', margin, pageHeight - 7)
    pdf.text(page + ' / ' + count, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }
  return Buffer.from(pdf.output('arraybuffer'))
}
