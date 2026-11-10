// ============================================================
// METARDU — RIM PDF Generator (Resurvey and Index Map)
// Professional A3 Landscape output for Kenya cadastral use
// Survey Act Cap 299, Survey Regulations L.N. 168/1994
//
// Uses A3 Landscape (420mm × 297mm) as a close substitute for
// A1/A0 RIM sheets. jsPDF has limited large-format support;
// A3 landscape provides sufficient space for RIM content while
// remaining printable on standard large-format plotters.
//
// Styling aligns with CLA form patterns:
//   - Dark navy section headers: rgb(27, 58, 92)
//   - 15mm margins
//   - Professional border framing
// ============================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RimSection, RimParcel, RimBeacon } from './db'

// A3 Landscape dimensions in mm (420 × 297)
const PAGE_W = 420
const PAGE_H = 297
const MARGIN = 15

// Navy colour used across CLA forms and RIM headers
const NAVY: [number, number, number] = [27, 58, 92]

export function generateRimPdf(
  section: RimSection,
  parcels: RimParcel[],
  beacons: RimBeacon[],
): Uint8Array {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
  })

  const contentW = PAGE_W - MARGIN * 2
  let y = MARGIN

  // ── Outer & inner border ────────────────────────────────────
  doc.setDrawColor(0)
  doc.setLineWidth(0.6)
  doc.rect(MARGIN, MARGIN, contentW, PAGE_H - MARGIN * 2)
  doc.setLineWidth(0.25)
  doc.rect(MARGIN + 1.5, MARGIN + 1.5, contentW - 3, PAGE_H - MARGIN * 2 - 3)

  const left = MARGIN + 4
  const right = PAGE_W - MARGIN - 4
  const innerW = right - left

  // ────────────────────────────────────────────────────────────
  // 1. HEADER BLOCK
  // ────────────────────────────────────────────────────────────

  y = MARGIN + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text('METARDU | SURVEY DRAFT', PAGE_W / 2, y, { align: 'center' })

  y += 7
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Parcel register and beacon schedule | No map geometry', PAGE_W / 2, y, { align: 'center' })

  y += 7
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.line(left, y, right, y)

  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('RIM REGISTER', PAGE_W / 2, y, { align: 'center' })

  // Reset text colour
  doc.setTextColor(0, 0, 0)

  y += 9
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Section: ${section.section_name || '\u2014'}`, left, y)
  doc.text(`Registry: ${section.registry || '\u2014'}`, left + 130, y)
  doc.text(`District / County: ${section.district || '\u2014'}`, left + 230, y)

  y += 6
  doc.text(`Map Sheet No: ${section.map_sheet_number || '\u2014'}`, left, y)
  doc.text(`Scale: ${section.scale || '\u2014'}`, left + 130, y)
  doc.text(`Datum: ${section.datum || '\u2014'}`, left + 230, y)

  y += 6
  doc.text(`Projection: ${section.projection || '\u2014'}`, left, y)
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  doc.text(`Date: ${today}`, left + 130, y)
  doc.text(`Total Area: ${section.total_area.toFixed(4)} Ha`, left + 230, y)

  y += 3
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.5)
  doc.line(left, y, right, y)

  // ────────────────────────────────────────────────────────────
  // 2. PARCEL REGISTER TABLE
  // ────────────────────────────────────────────────────────────

  y += 6
  sectionHeader(doc, 'PARCEL REGISTER', left, y, innerW)
  y += 10

  if (parcels.length > 0) {
    const head = [['No.', 'Parcel Number', 'Area (Ha)', 'Land Use', 'Owner', 'Beacons']]

    const body: string[][] = parcels.map((p, i) => [
      String(i + 1),
      p.parcel_number,
      p.area.toFixed(4),
      p.land_use || '\u2014',
      p.owner_name || '\u2014',
      String(p.beacon_count),
    ])

    // Total row
    const totalArea = parcels.reduce((sum, p) => sum + p.area, 0)
    const totalBeacons = parcels.reduce((sum, p) => sum + p.beacon_count, 0)
    body.push(['', 'TOTAL', totalArea.toFixed(4), '', '', String(totalBeacons)])

    // Column widths (total = innerW ≈ 386mm)
    const colW = [12, 80, 45, 70, 110, 25] // remainder fills last column

    y = drawTable(doc, {
      head,
      body,
      startY: y,
      columnWidths: colW,
      fontSize: 8,
      headerBg: NAVY,
      alternateRowColor: [240, 244, 248] as [number, number, number],
      highlightLastRow: true,
    })

  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('No parcels recorded for this RIM section.', left + 4, y)
    doc.setTextColor(0)
    y += 10
  }

  // ────────────────────────────────────────────────────────────
  // 3. BEACON SCHEDULE
  // ────────────────────────────────────────────────────────────

  // Check if there's enough space; if not, add new page
  if (y > PAGE_H - MARGIN - 80) {
    doc.addPage()
    y = MARGIN + 10
  }

  sectionHeader(doc, 'BEACON SCHEDULE', left, y, innerW)
  y += 10

  if (beacons.length > 0) {
    const head = [['No.', 'Beacon No.', 'Easting', 'Northing', 'Type', 'Description', 'Status']]

    const body: string[][] = beacons.map((b, i) => [
      String(i + 1),
      b.beacon_number,
      b.easting.toFixed(3),
      b.northing.toFixed(3),
      b.type || 'Pillar',
      b.description || '\u2014',
      b.survey_status || 'Original',
    ])

    const colW = [12, 45, 55, 55, 35, 110, 50]

    y = drawTable(doc, {
      head,
      body,
      startY: y,
      columnWidths: colW,
      fontSize: 7.5,
      headerBg: NAVY,
      alternateRowColor: [240, 244, 248] as [number, number, number],
      // Highlight beacons with "Not Found" or "Replaced" status
      statusHighlight: {
        column: 6,
        values: ['Not Found', 'Replaced'],
        color: [255, 230, 230] as [number, number, number],
      },
    })

  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('No beacons recorded for this RIM section.', left + 4, y)
    doc.setTextColor(0)
    y += 10
  }

  // ────────────────────────────────────────────────────────────
  // 4. NOTES SECTION
  // ────────────────────────────────────────────────────────────

  if (y > PAGE_H - MARGIN - 65) {
    doc.addPage()
    y = MARGIN + 10
  }

  sectionHeader(doc, 'NOTES AND REMARKS', left, y, innerW)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(40)

  const notes = section.notes || 'No additional notes for this RIM section.'
  const notesLines = doc.splitTextToSize(notes, innerW - 8) as string[]
  notesLines.forEach((line: string) => {
    if (y > PAGE_H - MARGIN - 55) {
      doc.addPage()
      y = MARGIN + 10
    }
    doc.text(line, left + 4, y)
    y += 5
  })

  doc.setTextColor(0)

  // ────────────────────────────────────────────────────────────
  // 5. FOOTER
  // ────────────────────────────────────────────────────────────

  // Position footer at fixed location near page bottom
  const footerY = PAGE_H - MARGIN - 40

  // Separator line
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(left, footerY, right, footerY)

  // Surveyor certification block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('SURVEYOR CERTIFICATION', left, footerY + 7)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  // Name and ISK fields
  const certY = footerY + 14
  doc.text('Name: ____________________________', left, certY)
  doc.text('ISK Registration No: ____________________________', left + 180, certY)

  const sigY = certY + 10
  doc.text('Signature: ____________________________', left, sigY)
  doc.text('Date: ____________________________', left + 180, sigY)

  // Watermark / generated-by line
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(130)
  doc.text(
    'This RIM has been prepared using METARDU',
    PAGE_W / 2,
    PAGE_H - MARGIN - 6,
    { align: 'center' },
  )

  // Page number
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text(`Page ${i} of ${totalPages}`, right, PAGE_H - MARGIN - 6, { align: 'right' })
  }

  return doc.output('arraybuffer') as unknown as Uint8Array
}

// ────────────────────────────────────────────────────────────
// Helper: Navy section header bar
// ────────────────────────────────────────────────────────────

function sectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  w: number,
) {
  doc.setFillColor(...NAVY)
  doc.rect(x, y, w, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(title, x + 3, y + 5)
  doc.setTextColor(0, 0, 0)
}

// ────────────────────────────────────────────────────────────
// Helper: Draw a styled table with optional features
//
// NOTE: This is a manual table renderer to avoid requiring
// jspdf-autotable as a dependency. If autotable is available,
// this can be swapped out for autoTable() calls.
// ────────────────────────────────────────────────────────────

interface TableOptions {
  head: string[][]
  body: string[][]
  startY: number
  columnWidths: number[]
  fontSize: number
  headerBg: [number, number, number]
  alternateRowColor: [number, number, number]
  highlightLastRow?: boolean
  statusHighlight?: {
    column: number
    values: string[]
    color: [number, number, number]
  }
}

function drawTable(doc: jsPDF, opts: TableOptions): number {
  const { head, body, startY, columnWidths, fontSize, headerBg, alternateRowColor } = opts
  autoTable(doc, {
    head, body, startY, margin: { left: MARGIN + 4, right: MARGIN + 4, top: MARGIN + 10, bottom: MARGIN + 14 },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: { fontSize, overflow: 'linebreak', cellPadding: 2 },
    headStyles: { fillColor: headerBg },
    alternateRowStyles: { fillColor: alternateRowColor },
    columnStyles: Object.fromEntries(columnWidths.map((cellWidth, index) => [index, { cellWidth }])),
    didParseCell: ({ section, row, column, cell }) => {
      if (section !== 'body') return
      if (opts.highlightLastRow && row.index === body.length - 1) {
        cell.styles.fontStyle = 'bold'
        cell.styles.fillColor = [220, 230, 241]
      }
      if (opts.statusHighlight?.column === column.index && opts.statusHighlight.values.includes(String(cell.raw))) {
        cell.styles.fillColor = opts.statusHighlight.color
      }
    },
  })
  return ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6
}
