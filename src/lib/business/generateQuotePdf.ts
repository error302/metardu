/**
 * generateQuotePdf.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Generates a clean, vector-crisp client proposal & statutory fee quotation PDF.
 * Uses jsPDF + jspdf-autotable for universal Node.js and browser compatibility.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FeeQuoteInput, FeeQuoteResult, computeSurveyFee } from './surveyFeeCalculator'

export function generateQuotePdf(input: FeeQuoteInput): Buffer {
  const quote = computeSurveyFee(input)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  // 1. Header Banner
  doc.setFillColor(32, 32, 36)
  doc.rect(0, 0, pageWidth, 38, 'F')

  doc.setTextColor(245, 158, 11) // Accent gold
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(input.firmName || 'METARDU SURVEY PRACTICE', margin, 16)

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('LICENSED LAND SURVEYORS & GEOMATICS CONSULTANTS', margin, 23)
  doc.setTextColor(180, 180, 190)
  doc.text(`Surveyor: ${input.surveyorName || 'Licensed Land Surveyor'} | ISK Reg: ${input.iskNumber || 'MISK/2026/001'}`, margin, 29)

  // Document Title & Reference
  doc.setTextColor(245, 158, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PROFESSIONAL FEE QUOTATION', pageWidth - margin, 16, { align: 'right' })

  const quoteRef = `QT-${Date.now().toString().slice(-6)}`
  const quoteDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.setTextColor(200, 200, 210)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Ref: ${quoteRef}`, pageWidth - margin, 23, { align: 'right' })
  doc.text(`Date: ${quoteDate}`, pageWidth - margin, 29, { align: 'right' })

  // 2. Client & Project Metadata Box
  doc.setDrawColor(220, 220, 230)
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(margin, 44, contentWidth, 28, 2, 2, 'FD')

  doc.setTextColor(60, 60, 70)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CLIENT INSTRUCTION DETAILS:', margin + 4, 50)
  doc.text('SURVEY PROPERTY EXTENT:', margin + (contentWidth / 2) + 4, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 30)
  doc.text(`Client: ${input.clientName || 'Valued Landowner / Client'}`, margin + 4, 57)
  doc.text(`Project: ${input.projectName || 'Cadastral Boundary Survey'}`, margin + 4, 64)

  const lrDisplay = input.lrNumber ? `LR / Parcel: ${input.lrNumber}` : 'LR / Parcel: To be confirmed'
  doc.text(lrDisplay, margin + (contentWidth / 2) + 4, 57)
  doc.text(`Area: ${quote.areaHa.toFixed(2)} Ha (${quote.areaAcres.toFixed(2)} Acres)`, margin + (contentWidth / 2) + 4, 64)

  // 3. Statutory Scope of Work Table
  const tableRows = quote.items.map((item, idx) => [
    (idx + 1).toString(),
    item.label + '\n' + item.description,
    `${item.quantity} ${item.unit}`,
    `${quote.currency} ${item.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `${quote.currency} ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ])

  autoTable(doc, {
    startY: 78,
    margin: { left: margin, right: margin },
    head: [['#', 'Item & Statutory Scope of Service', 'Quantity', 'Rate', 'Amount']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [32, 32, 36],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 40],
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentY = (doc as any).lastAutoTable.finalY + 4

  // 4. Totals Summary Box
  const summaryX = pageWidth - margin - 75
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(summaryX, currentY, 75, 26, 1, 1, 'FD')

  doc.setFontSize(8)
  doc.setTextColor(60, 60, 70)
  doc.text('Subtotal:', summaryX + 4, currentY + 6)
  doc.text(`${quote.currency} ${quote.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 4, currentY + 6, { align: 'right' })

  doc.text(`VAT (16%):`, summaryX + 4, currentY + 13)
  doc.text(`${quote.currency} ${quote.vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 4, currentY + 13, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(180, 83, 9)
  doc.text('TOTAL QUOTATION:', summaryX + 4, currentY + 21)
  doc.text(`${quote.currency} ${quote.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 4, currentY + 21, { align: 'right' })

  currentY += 32

  // 5. Milestone Payment Schedule Table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 30, 40)
  doc.text('PAYMENT MILESTONE TERMS', margin, currentY)

  currentY += 3
  const milestoneRows = quote.milestones.map((m) => [
    m.phase,
    `${m.percentage}%`,
    `${quote.currency} ${m.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    m.description,
  ])

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Milestone Stage', 'Split', 'Payable Amount', 'Deliverable Condition']],
    body: milestoneRows,
    theme: 'plain',
    headStyles: {
      fillColor: [240, 240, 245],
      textColor: [50, 50, 60],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [50, 50, 60],
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 32, fontStyle: 'bold' },
      3: { cellWidth: 92 },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = (doc as any).lastAutoTable.finalY + 8

  // 6. Signatures & Acceptance
  if (currentY > 240) {
    doc.addPage()
    currentY = 20
  }

  doc.setDrawColor(180, 180, 190)
  doc.setLineWidth(0.3)

  // Surveyor sign line
  doc.line(margin, currentY + 16, margin + 65, currentY + 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 90)
  doc.text('Signed for Survey Firm / Practising Surveyor', margin, currentY + 21)
  doc.text('Official Seal & Date Stamp', margin, currentY + 25)

  // Client accept line
  const clientSignX = pageWidth - margin - 65
  doc.line(clientSignX, currentY + 16, pageWidth - margin, currentY + 16)
  doc.text('Client Acceptance Signature', clientSignX, currentY + 21)
  doc.text('Date: ________________________', clientSignX, currentY + 25)

  // Footer note
  doc.setFontSize(7)
  doc.setTextColor(140, 140, 150)
  doc.text(
    'This fee proposal complies with the Survey Act Cap 299 & the Surveyors Registration Board (SRB) statutory scale. Valid for 30 days.',
    pageWidth / 2,
    288,
    { align: 'center' }
  )

  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
