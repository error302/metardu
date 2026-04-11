// ============================================================
// CLA Form 1: Community Land Registration Application
// Community Land Act No. 27 of 2016, Section 12
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

/**
 * Input data interface for CLA Form 1 — Application for Registration of Community Land.
 * All fields correspond to data required under Section 12 of the Community Land Act 2016.
 */
export interface ClaForm1Data {
  /** Application reference number */
  applicationNumber: string
  /** Full name of the applicant / authorized representative */
  applicantName: string
  /** National ID number of the applicant */
  idNumber: string
  /** Phone number of the applicant */
  phoneNumber: string
  /** Email address of the applicant */
  email: string
  /** Registered or recognized name of the community */
  communityName: string
  /** County where the community land is situated */
  county: string
  /** Sub-county within the county */
  subCounty: string
  /** Ward within the sub-county */
  ward: string
  /** Parcel or land reference number */
  parcelNumber: string
  /** Area of the land */
  landArea: string
  /** Unit of measurement for land area (default: Hectares) */
  landAreaUnit: string
  /** Primary land use category */
  landUse: string
  /** Total number of registered community members */
  numberOfMembers: string
  /** Ethnic community identification */
  ethnicCommunity: string
  /** Clan name within the ethnic community */
  clanName: string
  /** Date of application (DD/MM/YYYY) */
  dateOfApplication: string
  /** Name of person making the declaration */
  declarationName: string
  /** ID number of the person making the declaration */
  declarationIdNumber: string
  /** Date of declaration (DD/MM/YYYY) */
  declarationDate: string
}

/**
 * Generates CLA Form 1: Application for Registration of Community Land.
 *
 * This form is used to initiate the registration of community land under
 * Section 12 of the Community Land Act 2016. It captures applicant details,
 * community information, land description, and a declaration of accuracy.
 *
 * @param data - Structured data conforming to {@link ClaForm1Data}
 * @returns PDF document as a Uint8Array
 */
export function generateClaForm1(data: ClaForm1Data): Uint8Array {
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

    // Left column
    doc.setFillColor(...LIGHT_GREY)
    doc.rect(MARGIN_L, y, colW * 0.45, rowH, 'F')
    doc.rect(MARGIN_L + colW * 0.45, y, colW * 0.55, rowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label, MARGIN_L + 2, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '\u2014', MARGIN_L + colW * 0.45 + 2, y + 5.5)

    // Right column (optional)
    if (col2Label !== undefined) {
      doc.rect(MARGIN_L + colW, y, colW * 0.45, rowH, 'F')
      doc.rect(MARGIN_L + colW + colW * 0.45, y, colW * 0.55, rowH, 'F')
      doc.setFont('helvetica', 'bold')
      doc.text(col2Label, MARGIN_L + colW + 2, y + 5.5)
      doc.setFont('helvetica', 'normal')
      doc.text(col2Value || '\u2014', MARGIN_L + colW + colW * 0.45 + 2, y + 5.5)
    }

    // Row borders
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

  // ── Helper: checkbox item ───────────────────────────────────
  function checkboxItem(label: string, checked: boolean): void {
    if (y > 272) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const marker = checked ? '\u2611' : '\u2610'
    doc.text(`${marker}  ${label}`, MARGIN_L + 5, y + 5)
    y += 7
  }

  // ── Helper: add page number footer ──────────────────────────
  function addFooter(pdfDoc: jsPDF, pageNum: number): void {
    pdfDoc.setFont('helvetica', 'italic')
    pdfDoc.setFontSize(7.5)
    pdfDoc.setTextColor(120, 120, 120)
    pdfDoc.text(
      `Community Land Act 2016 — CLA Form 1  |  Page ${pageNum}`,
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
  doc.text('CLA FORM 1 \u2014 Application for Registration of Community Land', PAGE_W / 2, y + 7, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += 14

  // Reference info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(`Application No: ${data.applicationNumber}`, MARGIN_L, y)
  doc.text(`Date: ${data.dateOfApplication}`, PAGE_W - MARGIN_R, y, { align: 'right' })
  y += 8

  rule(y, 0.2)
  y += 6

  // ════════════════════════════════════════════════════════════
  // SECTION A — APPLICANT DETAILS
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION A: APPLICANT DETAILS')
  tableRow('Applicant Name:', data.applicantName, 'ID Number:', data.idNumber)
  tableRow('Phone Number:', data.phoneNumber, 'Email:', data.email)
  y += 4

  // ════════════════════════════════════════════════════════════
  // SECTION B — COMMUNITY / LAND DETAILS
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION B: COMMUNITY / LAND DETAILS')
  tableRow('Community Name:', data.communityName, 'County:', data.county)
  tableRow('Sub-County:', data.subCounty, 'Ward:', data.ward)
  fullRow('Number of Members:', data.numberOfMembers)
  tableRow('Ethnic Community:', data.ethnicCommunity, 'Clan Name:', data.clanName)
  y += 4

  // ════════════════════════════════════════════════════════════
  // SECTION C — LAND DESCRIPTION
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION C: LAND DESCRIPTION')

  const cRowH = 8
  const cLabelW = CONTENT_W * 0.4

  // Row 1: Parcel Number
  doc.setFillColor(...LIGHT_GREY)
  doc.rect(MARGIN_L, y, cLabelW, cRowH, 'F')
  doc.rect(MARGIN_L + cLabelW, y, CONTENT_W - cLabelW, cRowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Parcel Number:', MARGIN_L + 2, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.parcelNumber || '\u2014', MARGIN_L + cLabelW + 2, y + 5.5)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.15)
  doc.rect(MARGIN_L, y, CONTENT_W, cRowH, 'S')
  doc.line(MARGIN_L + cLabelW, y, MARGIN_L + cLabelW, y + cRowH)
  y += cRowH

  // Row 2: Land Area (with unit)
  doc.setFillColor(...LIGHT_GREY)
  doc.rect(MARGIN_L, y, cLabelW, cRowH, 'F')
  doc.rect(MARGIN_L + cLabelW, y, CONTENT_W * 0.45, cRowH, 'F')
  doc.rect(MARGIN_L + cLabelW + CONTENT_W * 0.45, y, CONTENT_W * 0.15, cRowH, 'F')
  doc.rect(MARGIN_L + cLabelW + CONTENT_W * 0.60, y, CONTENT_W - cLabelW - CONTENT_W * 0.60, cRowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Land Area:', MARGIN_L + 2, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.landArea || '\u2014', MARGIN_L + cLabelW + 2, y + 5.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Unit:', MARGIN_L + cLabelW + CONTENT_W * 0.45 + 2, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.landAreaUnit || 'Hectares', MARGIN_L + cLabelW + CONTENT_W * 0.60 + 2, y + 5.5)
  doc.setDrawColor(180, 180, 180)
  doc.rect(MARGIN_L, y, CONTENT_W, cRowH, 'S')
  doc.line(MARGIN_L + cLabelW, y, MARGIN_L + cLabelW, y + cRowH)
  doc.line(MARGIN_L + cLabelW + CONTENT_W * 0.45, y, MARGIN_L + cLabelW + CONTENT_W * 0.45, y + cRowH)
  doc.line(MARGIN_L + cLabelW + CONTENT_W * 0.60, y, MARGIN_L + cLabelW + CONTENT_W * 0.60, y + cRowH)
  doc.setDrawColor(0, 0, 0)
  y += cRowH

  // Row 3: Land Use
  doc.setFillColor(...LIGHT_GREY)
  doc.rect(MARGIN_L, y, cLabelW, cRowH, 'F')
  doc.rect(MARGIN_L + cLabelW, y, CONTENT_W - cLabelW, cRowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Land Use:', MARGIN_L + 2, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.text(data.landUse || '\u2014', MARGIN_L + cLabelW + 2, y + 5.5)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.15)
  doc.rect(MARGIN_L, y, CONTENT_W, cRowH, 'S')
  doc.line(MARGIN_L + cLabelW, y, MARGIN_L + cLabelW, y + cRowH)
  doc.setDrawColor(0, 0, 0)
  y += cRowH + 4

  // ════════════════════════════════════════════════════════════
  // SECTION D — SUPPORTING DOCUMENTS CHECKLIST
  // ════════════════════════════════════════════════════════════
  sectionHeader('SECTION D: SUPPORTING DOCUMENTS CHECKLIST')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.text('Please indicate all documents attached to this application:', MARGIN_L, y)
  y += 7

  checkboxItem('Copy of Community Constitution', true)
  checkboxItem('Community Membership Register', true)
  checkboxItem('Minutes of Community Assembly Meeting', true)
  checkboxItem('Community Boundary Description (CLA Form 3)', true)
  checkboxItem('Copy of National ID of Applicant', true)
  checkboxItem('Passport-size Photographs of Community Leaders', false)
  checkboxItem('Resolution by County Assembly (if applicable)', false)
  checkboxItem('Any other relevant document (specify below)', false)

  y += 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Other documents:', MARGIN_L + 5, y)
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.15)
  doc.line(MARGIN_L + 40, y + 1, PAGE_W - MARGIN_R, y + 1)
  doc.setDrawColor(0, 0, 0)
  y += 8

  // ════════════════════════════════════════════════════════════
  // DECLARATION SECTION
  // ════════════════════════════════════════════════════════════
  if (y > 230) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }

  sectionHeader('DECLARATION')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const declLines = [
    'I, the undersigned, hereby declare that the information provided in this application is',
    'true and correct to the best of my knowledge and belief. I understand that any false or',
    'misleading information may result in the rejection of this application and may constitute',
    'an offence under the laws of Kenya.',
  ]
  declLines.forEach((line: string) => {
    if (y > 275) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
    doc.text(line, MARGIN_L, y)
    y += 5
  })
  y += 4

  // Declaration details
  tableRow('Declaration By:', data.declarationName, 'ID Number:', data.declarationIdNumber)
  fullRow('Declaration Date:', data.declarationDate)
  y += 6

  // Signature block
  if (y > 260) { doc.addPage(); addFooter(doc, doc.getNumberOfPages()); y = 20 }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('Signature:', MARGIN_L, y)
  doc.setLineWidth(0.1)
  doc.line(MARGIN_L + 22, y + 1, MARGIN_L + 100, y + 1)
  doc.text('Date:', MARGIN_L + 110, y)
  doc.line(MARGIN_L + 122, y + 1, PAGE_W - MARGIN_R, y + 1)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('(This space is reserved for the official use of the Ministry of Lands and Physical Planning)', MARGIN_L, y)
  y += 8

  // Official use section
  doc.setDrawColor(...DARK_BLUE)
  doc.setLineWidth(0.3)
  doc.rect(MARGIN_L, y, CONTENT_W, 20, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_BLUE)
  doc.text('FOR OFFICIAL USE ONLY', PAGE_W / 2, y + 6, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('Received by: ________________________    Date: ________________    Stamp: ________________________', MARGIN_L + 5, y + 14)
  doc.setDrawColor(0, 0, 0)

  // ── Footer on every page ────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    addFooter(doc, p)
  }

  return doc.output('arraybuffer') as unknown as Uint8Array
}
