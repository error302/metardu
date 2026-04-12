// ============================================================
// CLA Form 3: Community Land Boundary Description
// Community Land Act No. 27 of 2016, Section 14
// ============================================================

import jsPDF from 'jspdf'

// ── Page Constants ────────────────────────────────────────────
const PAGE_W = 210
const PAGE_H = 297
const MARGIN_L = 15
const MARGIN_R = 15
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
const DARK_BLUE: [number, number, number] = [27, 58, 92]
const LIGHT_GREY: [number, number, number] = [240, 240, 240]
const MID_GREY: [number, number, number] = [248, 248, 248]

/**
 * Single beacon entry within the beacon schedule.
 */
export interface BeaconEntry {
  /** Beacon identification number (e.g., "B1", "B2") */
  beaconNumber: string
  /** Easting coordinate value */
  easting: string
  /** Northing coordinate value */
  northing: string
  /** Physical description of the beacon (e.g., "Concrete pillar") */
  description: string
  /** Type of beacon (e.g., "Permanent", "Temporary", "Natural") */
  type: string
}

/**
 * Single boundary line entry.
 */
export interface BoundaryLine {
  /** Origin beacon number */
  fromBeacon: string
  /** Terminal beacon number */
  toBeacon: string
  /** Compass bearing of the boundary line */
  bearing: string
  /** Distance of the boundary line */
  distance: string
}

/**
 * Input data interface for CLA Form 3 — Community Land Boundary Description.
 * All fields correspond to data required under Section 14 of the Community Land Act 2016.
 */
export interface ClaForm3Data {
  /** Unique boundary description identifier */
  boundaryId: string
  /** Registered or recognized name of the community */
  communityName: string
  /** County where the community land is situated */
  county: string
  /** Sub-county within the county */
  subCounty: string
  /** Ward within the sub-county */
  ward: string
  /** Total area of the community land */
  totalArea: string
  /** Total number of beacons demarcating the boundary */
  numberOfBeacons: string
  /** Array of beacon entries in the beacon schedule */
  beacons: BeaconEntry[]
  /** Array of boundary line segments */
  boundaries: BoundaryLine[]
  /** Full name of the licensed surveyor */
  surveyorName: string
  /** Institution of Surveyors of Kenya (ISK) registration number */
  iskNumber: string
  /** Date of survey (DD/MM/YYYY) */
  surveyDate: string
  /** Name of the person making the declaration */
  declarationName: string
  /** Date of declaration (DD/MM/YYYY) */
  declarationDate: string
}

/**
 * Generates CLA Form 3: Community Land Boundary Description.
 *
 * This form provides a detailed description of community land boundaries,
 * including a beacon schedule and boundary line measurements, as required
 * under Section 14 of the Community Land Act 2016.
 *
 * @param data - Structured data conforming to {@link ClaForm3Data}
 * @returns PDF document as a Uint8Array
 */
export function generateClaForm3(data: ClaForm3Data): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = 0

  // ── Helper: draw a full-width horizontal rule ───────────────
  function rule(yPos: number, lineWidth = 0.4): void {
    doc.setLineWidth(lineWidth)
    doc.line(MARGIN_L, yPos, PAGE_W - MARGIN_R, yPos)
  }

  // ── Helper: draw a section header bar ───────────────────────
  function sectionHeader(title: string): void {
    if (y > 260) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    doc.setFillColor(...DARK_BLUE)
    doc.rect(MARGIN_L, y, CONTENT_W, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(title, MARGIN_L + 3, y + 5.5)
    doc.setTextColor(0, 0, 0)
    y += 12
  }

  // ── Helper: draw a two-column table row ─────────────────────
  function tableRow(label: string, value: string, col2Label?: string, col2Value?: string): void {
    if (y > 272) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    const rowH = 8
    const colW = CONTENT_W / 2

    doc.setFillColor(...LIGHT_GREY)
    doc.rect(MARGIN_L, y, colW * 0.45, rowH, 'F')
    doc.rect(MARGIN_L + colW * 0.45, y, colW * 0.55, rowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label, MARGIN_L + 2, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '\u2014', MARGIN_L + colW * 0.45 + 2, y + 5.5)

    if (col2Label !== undefined) {
      doc.rect(MARGIN_L + colW, y, colW * 0.45, rowH, 'F')
      doc.rect(MARGIN_L + colW + colW * 0.45, y, colW * 0.55, rowH, 'F')
      doc.setFont('helvetica', 'bold')
      doc.text(col2Label, MARGIN_L + colW + 2, y + 5.5)
      doc.setFont('helvetica', 'normal')
      doc.text(col2Value || '\u2014', MARGIN_L + colW + colW * 0.45 + 2, y + 5.5)
    }

    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.15)
    doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'S')
    if (col2Label !== undefined) {
      doc.line(MARGIN_L + colW, y, MARGIN_L + colW, y + rowH)
    }
    doc.line(MARGIN_L + colW * 0.45, y, MARGIN_L + colW * 0.45, y + rowH)
    if (col2Label !== undefined) {
      doc.line(MARGIN_L + colW + colW * 0.45, y, MARGIN_L + colW + colW * 0.45, y + rowH)
    }
    doc.setDrawColor(0, 0, 0)

    y += rowH
  }

  // ── Helper: draw a full-width table row ─────────────────────
  function fullRow(label: string, value: string): void {
    if (y > 272) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    const rowH = 8
    const labelW = CONTENT_W * 0.4
    const valW = CONTENT_W * 0.6

    doc.setFillColor(...LIGHT_GREY)
    doc.rect(MARGIN_L, y, labelW, rowH, 'F')
    doc.rect(MARGIN_L + labelW, y, valW, rowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label, MARGIN_L + 2, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '\u2014', MARGIN_L + labelW + 2, y + 5.5)

    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.15)
    doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'S')
    doc.line(MARGIN_L + labelW, y, MARGIN_L + labelW, y + rowH)
    doc.setDrawColor(0, 0, 0)

    y += rowH
  }

  // ── Helper: add page number footer ──────────────────────────
  function addFooter(pdfDoc: jsPDF, pageNum: number): void {
    pdfDoc.setFont('helvetica', 'italic')
    pdfDoc.setFontSize(7.5)
    pdfDoc.setTextColor(120, 120, 120)
    pdfDoc.text(
      `Community Land Act 2016 — CLA Form 3  |  Page ${pageNum}`,
      PAGE_W / 2,
      PAGE_H - 10,
      { align: 'center' }
    )
    pdfDoc.setTextColor(0, 0, 0)
  }

  // ════════════════════════════════════════════════════════════
  // PAGE 1 — HEADER
  // ════════════════════════════════════════════════════════════
  y = 15

  // Coat of arms placeholder
  doc.setDrawColor(...DARK_BLUE)
  doc.setLineWidth(0.3)
  doc.rect(PAGE_W / 2 - 10, y, 20, 20, 'S')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(120, 120, 120)
  doc.text('COAT OF ARMS', PAGE_W / 2, y + 11, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += 24

  // Government header text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('REPUBLIC OF KENYA', PAGE_W / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(11)
  doc.text('Ministry of Lands and Physical Planning', PAGE_W / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.text('Community Land Act, 2016', PAGE_W / 2, y, { align: 'center' })
  y += 8

  rule(y, 0.6)
  y += 5

  // Form title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setFillColor(...DARK_BLUE)
  doc.rect(MARGIN_L, y, CONTENT_W, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text('CLA FORM 3 \u2014 Community Land Boundary Description', PAGE_W / 2, y + 7, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += 14

  // Reference info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(`Boundary ID: ${data.boundaryId}`, MARGIN_L, y)
  doc.text(`Survey Date: ${data.surveyDate}`, PAGE_W - MARGIN_R, y, { align: 'right' })
  y += 8

  rule(y, 0.2)
  y += 6

  // ════════════════════════════════════════════════════════════
  // SECTION A — COMMUNITY AND LOCATION DETAILS
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION A: COMMUNITY AND LOCATION DETAILS')
  tableRow('Community Name:', data.communityName, 'County:', data.county)
  tableRow('Sub-County:', data.subCounty, 'Ward:', data.ward)
  y += 4

  // ════════════════════════════════════════════════════════════
  // SECTION B — LAND AREA SUMMARY
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION B: LAND AREA SUMMARY')
  tableRow('Total Area:', data.totalArea, 'No. of Beacons:', data.numberOfBeacons)
  y += 4

  // ════════════════════════════════════════════════════════════
  // SECTION C — BEACON SCHEDULE
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION C: BEACON SCHEDULE')

  // Table header
  if (y > 250) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
  const bCols = [MARGIN_L, MARGIN_L + 10, MARGIN_L + 38, MARGIN_L + 78, MARGIN_L + 118, MARGIN_L + 155]
  const bHeaders = ['No.', 'Beacon', 'Easting', 'Northing', 'Description', 'Type']

  // Header row
  doc.setFillColor(...DARK_BLUE)
  doc.rect(MARGIN_L, y, CONTENT_W, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  bHeaders.forEach((h, i) => doc.text(h, bCols[i] + 2, y + 5))
  doc.setTextColor(0, 0, 0)
  y += 7

  // Vertical separators
  const vLines = [MARGIN_L + 10, MARGIN_L + 38, MARGIN_L + 78, MARGIN_L + 118, MARGIN_L + 155]

  // Data rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  const beacons = data.beacons.length > 0 ? data.beacons : []
  for (let i = 0; i < Math.max(beacons.length, 5); i++) {
    if (y > 270) {
      doc.addPage()
      addFooter(doc, doc.getNumberOfPages())
      y = 20
      // Reprint header on new page
      doc.setFillColor(...DARK_BLUE)
      doc.rect(MARGIN_L, y, CONTENT_W, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(255, 255, 255)
      bHeaders.forEach((h, ci) => doc.text(h, bCols[ci] + 2, y + 5))
      doc.setTextColor(0, 0, 0)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
    }

    const rowH = 7
    const beacon = beacons[i]

    // Alternate row shading
    if (i % 2 === 0) {
      doc.setFillColor(...MID_GREY)
      doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'F')
    }

    doc.text(`${i + 1}`, bCols[0] + 2, y + 5)
    doc.text(beacon?.beaconNumber || '', bCols[1] + 2, y + 5)
    doc.text(beacon?.easting || '', bCols[2] + 2, y + 5)
    doc.text(beacon?.northing || '', bCols[3] + 2, y + 5)
    doc.text(beacon?.description || '', bCols[4] + 2, y + 5)
    doc.text(beacon?.type || '', bCols[5] + 2, y + 5)

    // Row border and vertical lines
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.1)
    doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'S')
    vLines.forEach((vx) => doc.line(vx, y, vx, y + rowH))
    doc.setDrawColor(0, 0, 0)

    y += rowH
  }
  y += 6

  // ════════════════════════════════════════════════════════════
  // SECTION D — BOUNDARY LINES
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION D: BOUNDARY LINES')

  // Table header
  if (y > 250) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
  const dCols = [MARGIN_L, MARGIN_L + 10, MARGIN_L + 50, MARGIN_L + 90, MARGIN_L + 130]
  const dHeaders = ['No.', 'From', 'To', 'Bearing', 'Distance']

  // Header row
  doc.setFillColor(...DARK_BLUE)
  doc.rect(MARGIN_L, y, CONTENT_W, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  dHeaders.forEach((h, i) => doc.text(h, dCols[i] + 2, y + 5))
  doc.setTextColor(0, 0, 0)
  y += 7

  // Vertical separators for boundary lines table
  const dVLines = [MARGIN_L + 10, MARGIN_L + 50, MARGIN_L + 90, MARGIN_L + 130]

  // Data rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  const boundaries = data.boundaries.length > 0 ? data.boundaries : []
  for (let i = 0; i < Math.max(boundaries.length, 5); i++) {
    if (y > 270) {
      doc.addPage()
      addFooter(doc, doc.getNumberOfPages())
      y = 20
      // Reprint header on new page
      doc.setFillColor(...DARK_BLUE)
      doc.rect(MARGIN_L, y, CONTENT_W, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(255, 255, 255)
      dHeaders.forEach((h, ci) => doc.text(h, dCols[ci] + 2, y + 5))
      doc.setTextColor(0, 0, 0)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
    }

    const rowH = 7
    const bnd = boundaries[i]

    // Alternate row shading
    if (i % 2 === 0) {
      doc.setFillColor(...MID_GREY)
      doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'F')
    }

    doc.text(`${i + 1}`, dCols[0] + 4, y + 5)
    doc.text(bnd?.fromBeacon || '', dCols[1] + 2, y + 5)
    doc.text(bnd?.toBeacon || '', dCols[2] + 2, y + 5)
    doc.text(bnd?.bearing || '', dCols[3] + 2, y + 5)
    doc.text(bnd?.distance || '', dCols[4] + 2, y + 5)

    // Row border and vertical lines
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.1)
    doc.rect(MARGIN_L, y, CONTENT_W, rowH, 'S')
    dVLines.forEach((vx) => doc.line(vx, y, vx, y + rowH))
    doc.setDrawColor(0, 0, 0)

    y += rowH
  }
  y += 6

  // ════════════════════════════════════════════════════════════
  // SECTION E — SURVEYOR CERTIFICATION
  // ════════════════════════════════════════════════════════════
  if (y > 230) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }

  sectionHeader('SECTION E: SURVEYOR CERTIFICATION')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const certLines = [
    `I, ${data.surveyorName} (ISK No. ${data.iskNumber}), a Licensed Surveyor duly registered`,
    'under the Survey Act (Cap 299) of the Laws of Kenya, hereby certify that:',
    '',
    '1. I have personally conducted a survey of the community land described in this form.',
    '2. The beacon schedule and boundary lines accurately represent the surveyed boundary.',
    '3. The coordinates are based on the Kenyan datum as required by law.',
    '4. The total area computation is correct based on the surveyed boundaries.',
    '5. This boundary description conforms to the requirements of the Community Land Act 2016.',
  ]
  certLines.forEach((line: string) => {
    if (y > 275) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    if (line === '') { y += 3; return }
    doc.text(line, MARGIN_L, y)
    y += 5
  })
  y += 4

  tableRow('Surveyor Name:', data.surveyorName, 'ISK Number:', data.iskNumber)
  fullRow('Survey Date:', data.surveyDate)
  y += 4

  // ════════════════════════════════════════════════════════════
  // DECLARATION AND SIGNATURES
  // ════════════════════════════════════════════════════════════
  if (y > 225) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }

  sectionHeader('DECLARATION')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const declLines = [
    'I, the undersigned, hereby declare that the boundary description provided in this form',
    'is accurate and has been prepared in accordance with the Community Land Act 2016 and',
    'the Survey Act (Cap 299). I confirm that the beacons and boundary lines described',
    'herein have been verified on the ground.',
  ]
  declLines.forEach((line: string) => {
    if (y > 275) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    doc.text(line, MARGIN_L, y)
    y += 5
  })
  y += 4

  tableRow('Declaration By:', data.declarationName, 'Date:', data.declarationDate)
  y += 8

  // Signature lines
  if (y > 245) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }

  // Signature 1 — Licensed Surveyor
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('1. Licensed Surveyor', MARGIN_L, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setLineWidth(0.1)
  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN_L, y + 1, MARGIN_L + 80, y + 1)
  doc.text('Signature', MARGIN_L, y + 5)
  doc.text('Name: ' + data.surveyorName, MARGIN_L + 90, y + 5)
  y += 12

  // Signature 2 — Community Representative
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('2. Community Representative', MARGIN_L, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.line(MARGIN_L, y + 1, MARGIN_L + 80, y + 1)
  doc.text('Signature', MARGIN_L, y + 5)
  doc.line(MARGIN_L + 90, y + 1, PAGE_W - MARGIN_R, y + 1)
  doc.text('Date', MARGIN_L + 90, y + 5)
  y += 12

  // Signature 3 — County Director of Lands
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('3. County Director of Lands', MARGIN_L, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.line(MARGIN_L, y + 1, MARGIN_L + 80, y + 1)
  doc.text('Signature & Stamp', MARGIN_L, y + 5)
  doc.line(MARGIN_L + 90, y + 1, PAGE_W - MARGIN_R, y + 1)
  doc.text('Date', MARGIN_L + 90, y + 5)
  y += 12

  // Official seal placeholder
  doc.setDrawColor(...DARK_BLUE)
  doc.setLineWidth(0.3)
  doc.rect(PAGE_W - MARGIN_R - 40, y - 50, 30, 30, 'S')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(120, 120, 120)
  doc.text('OFFICIAL SEAL', PAGE_W - MARGIN_R - 25, y - 34, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)

  // ── Footer on every page ────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    addFooter(doc, p)
  }

  return doc.output('arraybuffer') as unknown as Uint8Array
}


