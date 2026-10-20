/** Form No. 4 inspired review layout. Output remains an unverified draft. */

import { sha256Hex } from '@/lib/crypto/sha256'
import { SurveyPlanRenderer } from './renderer'
import type { SurveyPlanData, PlanOptions, CoordinateScheduleEntry } from './types'
import { mmToPx } from './geometry'
import {
  escapeXml,
  C_BLACK, C_GREEN, C_RED,
} from './symbols'

/**
 * Form No. 4 inspired layout for unverified review drafts.
 */
export class FormNo4Renderer extends SurveyPlanRenderer {
  private formNo4Data: FormNo4Data

  constructor(data: SurveyPlanData, options?: PlanOptions & { submissionNumber?: string }) {
    super(data, options)
    this.formNo4Data = this.extractFormNo4Data(data, options?.submissionNumber)
  }

  private extractFormNo4Data(data: SurveyPlanData, submissionNumber?: string): FormNo4Data {
    const p = data.project
    return {
      folioNumber: p.folioNumber || '',
      registerNumber: p.registerNumber || '',
      lrNumber: p.lrNumber || '',
      plotParcelNumber: p.plotParcelNumber || '',
      refMapRIM: p.refMapRIM || '',
      registrationBlock: p.registrationBlock || '',
      registrationDistrict: p.registrationDistrict || '',
      locality: p.locality || '',
      formNumber: p.formNumber || 'Form No. 4',
      computationsNo: p.computationsNo || '',
      fieldBookNo: p.fieldBookNo || '',
      dateReceived: p.dateReceived || '',
      fileReference: p.fileReference || '',
      scale: `1:${this.getScale()}`,
      firNumber: p.firNumber || '',
      submissionNumber: submissionNumber || '',
      // Authentication block
      examinedBy: '',
      examinedDate: '',
      approvedBy: '',
      approvedDate: '',
      authenticatedBy: '',
      authenticatedDate: '',
      // Review limitations; no declaration is made on the surveyor's behalf.
      declarationText: 'Unverified draft for independent review. No certification, boundary acceptance or authority approval is established.',
      declarationDate: new Date().toLocaleDateString('en-GB'),
      letterNo: '',
      // Surveyor credentials for stamp area
      surveyorName: p.surveyor_name || '',
      surveyorLicence: p.surveyor_licence || '',
      iskRegNo: p.iskRegNo || '',
      firmName: p.firm_name || '',
    }
  }

  /**
   * Render the Form No. 4 review layout.
   */
  async renderFormNo4(): Promise<string> {
    this.validateBoundary();
    const layers: string[] = []
    
    // Base layers
    layers.push(this.drawBackground())
    layers.push(this.drawSheetBorder())
    layers.push(this.drawPanelDivider())
    if (this.opts.includeGrid) layers.push(this.drawGrid())
    layers.push(this.drawLotFill())
    layers.push(this.drawWatermark())
    
    // Form No. 4 specific layers
    layers.push(this.drawCoordinateTables())
    layers.push(this.drawLRNumbersOnParcels())
    layers.push(this.drawRoadAnnotations())
    
    // Standard layers
    layers.push(this.drawAdjacentLots())
    layers.push(this.drawRoadTruncationLines())
    layers.push(this.drawBoundary())
    layers.push(this.drawBoundaryLabels())
    layers.push(this.drawBoundaryAdjacentLRNumbers())
    layers.push(this.drawMonuments())
    layers.push(this.drawNorthArrow())
    layers.push(this.drawScaleBar())
    
    // Form No. 4 panels and footer
    layers.push(this.drawFormNo4RightPanel())
    layers.push(this.drawFormNo4TitleBlock())
    layers.push(this.drawSubmissionNumberHeader())
    layers.push(this.drawLegalReferenceLine())
    layers.push(await this.drawPrintVerification())
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.pageW} ${this.pageH}" width="${this.pageW}" height="${this.pageH}" style="font-family: 'JetBrains Mono', 'Courier New', monospace;">${layers.join('\n')}</svg>`
  }

  /**
   * Draw coordinate tables (Form No. 4 Rule 1)
   * Split into left and right tables
   */
  private drawCoordinateTables(): string {
    const controls = this.getControlPoints()
    const controlPts: CoordinateScheduleEntry[] = this.data.parcel.boundaryPoints.map(point => controls.find(control => control.station === point.name)
      ?? { station: point.name, easting: point.easting, northing: point.northing, beaconClass: 'unverified' })
    if (controlPts.length === 0) return ''

    // Split beacons: P/K-series on left, N/D-series on right
const middle = Math.ceil(controlPts.length / 2)
const leftSideBeacons = controlPts.slice(0, middle)
const rightSideBeacons = controlPts.slice(middle)

    let svg = ''
    
    // Left table
    if (leftSideBeacons.length > 0) {
      svg += this.drawCoordinateTable(leftSideBeacons, 'left', mmToPx(30), mmToPx(20))
    }
    
    // Right table
    if (rightSideBeacons.length > 0) {
svg += this.drawCoordinateTable(rightSideBeacons, 'right',
      this.drawingX + this.drawingAreaW - mmToPx(96), mmToPx(20))
    }

    return svg
  }

  private drawCoordinateTable(
    beacons: CoordinateScheduleEntry[],
    side: 'left' | 'right',
    x: number,
    y: number
  ): string {
    const colWidths = [mmToPx(15), mmToPx(22), mmToPx(22), mmToPx(14), mmToPx(18)]
    const rowHeight = mmToPx(6)
    const tableWidth = colWidths.reduce((a, b) => a + b, 0)
    const tableHeight = rowHeight * (beacons.length + 1)

    let svg = `<g class="coordinate-table-${side}">`
    
    // Table border
    svg += `<rect x="${x}" y="${y}" width="${tableWidth}" height="${tableHeight}" fill="white" stroke="${C_BLACK}" stroke-width="0.5"/>`
    
    // Header
    const headers = ['Station', 'Northings', 'Eastings', 'Heights', 'Class']
    let hx = x
    headers.forEach((h, i) => {
      svg += `<rect x="${hx}" y="${y}" width="${colWidths[i]}" height="${rowHeight}" fill="#f0f0f0" stroke="${C_BLACK}" stroke-width="0.3"/>`
      svg += `<text x="${hx + colWidths[i]/2}" y="${y + rowHeight/2 + 2}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${h}</text>`
      hx += colWidths[i]
    })

    // Data rows
    beacons.forEach((beacon, rowIdx) => {
      const rowY = y + rowHeight * (rowIdx + 1)
      hx = x
      
      const cells = [
        beacon.station,
        beacon.northing.toFixed(4),
        beacon.easting.toFixed(4),
        beacon.height?.toFixed(3) || '—',
        this.formatBeaconClass(beacon.beaconClass)
      ]
      
      cells.forEach((cell, i) => {
        svg += `<rect x="${hx}" y="${rowY}" width="${colWidths[i]}" height="${rowHeight}" fill="white" stroke="${C_BLACK}" stroke-width="0.3"/>`
        svg += `<text x="${hx + (i < 1 ? 2 : colWidths[i]/2)}" y="${rowY + rowHeight/2 + 2}" text-anchor="${i < 1 ? 'start' : 'middle'}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(cell)}</text>`
        hx += colWidths[i]
      })
    })

    svg += '</g>'
    return svg
  }

  private formatBeaconClass(cls: string): string {
    const map: Record<string, string> = {
      'new': 'New',
      'old': 'Old',
      'theoretical': 'Theoretical',
      'IPCU': 'I.P.C.U.'
    }
    return map[cls] || cls
  }

  /**
   * Draw LR numbers on parcels (Form No. 4 Rule 4)
   */
private drawLRNumbersOnParcels(): string {
  const p = this.data.project
    if (!p.lrNumber) return ''

    const boundaryPts = this.rotatedPoints
    if (boundaryPts.length < 3) return ''

    // Calculate centroid of parcel
    const centroid = this.calculateCentroid(boundaryPts)
  const cx = this.toSvgX(centroid.easting)
  const cy = this.toSvgY(centroid.northing)

  const parcelArea = this.data.parcel.area_sqm || 0
    const areaHa = (parcelArea / 10000).toFixed(4)

    let svg = ''
    
    // LR Number label
    svg += `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="11" font-weight="bold" fill="${C_BLACK}">LR No. ${escapeXml(p.lrNumber)}</text>`
    
    // Area label
    svg += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">A=co=${areaHa} Ha</text>`
    
    // DP Number if available
    if (p.plotParcelNumber) {
      svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">D.P No. ${escapeXml(p.plotParcelNumber)}</text>`
    }

    return svg
  }

  /**
   * Draw road annotations for Form No. 4.
   * Shows road reserve width annotation and truncation note using actual
   * road class data. The base class drawRoadTruncationLines() provides
   * the actual tick marks along road boundaries.
   */
  private drawRoadAnnotations(): string {
    const width = this.data.project.roadReserveWidthMetres;
    if (width === undefined) return '';
    if (!Number.isFinite(width) || width <= 0) throw new Error('Recorded road reserve width must be positive and finite.');
    const x = this.drawingX + mmToPx(8);
    const y = this.drawingY + mmToPx(8);
    return `<text x="${x}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10">Recorded road reserve width: ${width.toFixed(2)} m (review required)</text>`;
  }

  /**
   * Draw Form No. 4 right panel
   */
private drawFormNo4RightPanel(): string {
  const d = this.formNo4Data
  const panelX = this.panelX
  const panelW = this.panelW
    const margin = mmToPx(10)
    
    let y = margin + mmToPx(5)
    let svg = `<g class="form-no-4-panel">`

    // Title
    svg += `<text x="${panelX + panelW/2}" y="${y}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">UNVERIFIED DRAFT PLAN</text>`
    y += mmToPx(6)
    
    // Form number
    svg += `<text x="${panelX + panelW/2}" y="${y}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(d.formNumber)} — review layout</text>`
    y += mmToPx(8)

    // Plan info box
    const infoFields = [
      ['Registration District', d.registrationDistrict || 'Not supplied'],
      ['Locality', d.locality || 'Not supplied'],
      ['LR Number', d.lrNumber],
      ['Folio Number', d.folioNumber],
      ['Register Number', d.registerNumber],
      ['FIR Number', d.firNumber],
      ['Scale', d.scale],
      ['Datum', this.crs.datum],
      ['UTM Zone', this.crs.verified ? `${this.crs.zone}${this.crs.hemi}` : 'UNVERIFIED'],
    ].filter(([, value]) => Boolean(value))
    const infoHeight = mmToPx(infoFields.length * 5 + 7)

    svg += `<rect x="${panelX + margin/2}" y="${y}" width="${panelW - margin}" height="${infoHeight}" fill="#f9f9f9" stroke="${C_BLACK}" stroke-width="0.5"/>`
    
    let fieldY = y + mmToPx(5)
    infoFields.forEach(([label, value]) => {
      if (value) {
        svg += `<text x="${panelX + margin}" y="${fieldY}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">${escapeXml(label)}:</text>`
        svg += `<text x="${panelX + panelW - margin}" y="${fieldY}" text-anchor="end" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${escapeXml(value)}</text>`
        fieldY += mmToPx(5)
      }
    })
    
    y += infoHeight + mmToPx(5)

    // Legend
    svg += this.drawFormNo4Legend(panelX + margin/2, y, panelW - margin)
    y += mmToPx(40)

    // Revision history
    svg += this.drawFormNo4RevisionHistory(panelX + margin/2, y, panelW - margin)
    y += mmToPx(22)

    // Surveyor certificate
    svg += this.drawSurveyorCertificateInternal(panelX + margin/2, y, panelW - margin)

    svg += '</g>'
    return svg
  }

  private drawFormNo4Legend(x: number, y: number, w: number): string {
    let svg = `<rect x="${x}" y="${y}" width="${w}" height="${mmToPx(35)}" fill="#fafafa" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${x + w/2}" y="${y + mmToPx(5)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">LEGEND</text>`
    
    const items = [
      { symbol: `<rect x="-3" y="-6" width="6" height="6" fill="${C_GREEN}"/>`, label: 'Found Monument' },
      { symbol: `<circle cx="0" cy="-3" r="3" fill="none" stroke="${C_GREEN}"/>`, label: 'Set Monument' },
      { symbol: `<circle cx="0" cy="-3" r="2.5" fill="${C_RED}"/>`, label: 'Masonry Nail' },
      { symbol: `<line x1="-4" y1="-3" x2="4" y2="-3" stroke="${C_BLACK}"/>`, label: 'Boundary Line' },
    ]
    
    let itemY = y + mmToPx(10)
    items.forEach(item => {
      svg += `<g transform="translate(${x + mmToPx(3)},${itemY})">${item.symbol}</g>`
      svg += `<text x="${x + mmToPx(8)}" y="${itemY}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${item.label}</text>`
      itemY += mmToPx(6)
    })
    
    return svg
  }

  /**
   * Draw revision history table (Form No. 4 Rule 7)
   * Shows all revisions to the plan with date, description, and surveyor.
   * Per Survey Act Cap. 299, every amendment to a registered plan must
   * be recorded with a revision entry.
   */
  private drawFormNo4RevisionHistory(x: number, y: number, w: number): string {
    const p = this.data.project
    const revisions = p.revisions || []
    const h = mmToPx(20)

    let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${x + w/2}" y="${y + mmToPx(4)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">REVISION HISTORY</text>`
    svg += `<line x1="${x}" y1="${y + mmToPx(5.5)}" x2="${x + w}" y2="${y + mmToPx(5.5)}" stroke="${C_BLACK}" stroke-width="0.3"/>`

    // Column headers
    const colWidths = [mmToPx(8), mmToPx(18), mmToPx(32), mmToPx(18)]
    const headers = ['Rev', 'Date', 'Description', 'By']
    let hx = x
    headers.forEach((h, i) => {
      svg += `<text x="${hx + 1}" y="${y + mmToPx(8)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#555">${h}</text>`
      hx += colWidths[i]
    })

    svg += `<line x1="${x}" y1="${y + mmToPx(9)}" x2="${x + w}" y2="${y + mmToPx(9)}" stroke="${C_BLACK}" stroke-width="0.2"/>`

    // Revision rows — if none, show "Initial Issue"
    const rows = revisions.length > 0 ? revisions.slice(0, 3) : [
      { rev: '—', date: '', description: 'No issued revision recorded', by: '' }
    ]

    let rowY = y + mmToPx(11.5)
    rows.forEach((row) => {
      hx = x
      const cells = [row.rev, row.date, row.description.length > 25 ? row.description.slice(0, 23) + '..' : row.description, row.by]
      cells.forEach((cell, ci) => {
        svg += `<text x="${hx + 1}" y="${rowY}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(cell)}</text>`
        hx += colWidths[ci]
      })
      rowY += mmToPx(3)
    })

    return svg
  }

  private drawSurveyorCertificateInternal(x: number, y: number, w: number): string {
    return this.drawReviewRecord(x, y, w, mmToPx(105));
  }

  private drawFormNo4TitleBlock(): string {
    return this.drawSheetIdentity()
  }

  /**
   * Draw submission number in header
   */
  private drawSubmissionNumberHeader(): string {
    const d = this.formNo4Data
    if (!d.submissionNumber) return ''

  const y = mmToPx(8)
  const cx = this.pageW / 2

    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">Submission: ${escapeXml(d.submissionNumber)}</text>`
  }

  // drawRoadTruncationLines() — inherited from SurveyPlanRenderer base class

  /**
   * Draw print verification hash at the bottom of the plan.
   * Overrides base class to include Form No. 4 specific data (folio, register).
   * Uses SHA-256 cryptographic hash for production-grade verification.
   */
  protected async drawPrintVerification(): Promise<string> {
    const d = this.formNo4Data
    const pts = this.rotatedPoints
    const p = this.data.project

    // Build a verification string from key plan data (includes Form No. 4 fields)
    const coordString = pts.map(pt => `${pt.easting.toFixed(4)},${pt.northing.toFixed(4)}`).join('|')
    const areaVal = this.data.parcel.area_sqm.toFixed(4)
    const lrNum = d.lrNumber || 'UNKNOWN'
    const scaleVal = this.scale
    const dateStr = d.declarationDate || new Date().toISOString().split('T')[0]
    const folio = d.folioNumber || ''
    const register = d.registerNumber || ''
    const surveyorLicence = p.surveyor_licence || ''
    const revisionsCount = (p.revisions || []).length

    // SHA-256 cryptographic hash for deterministic verification code
    const rawString = `${coordString}|${areaVal}|${lrNum}|${scaleVal}|${dateStr}|${folio}|${register}|${surveyorLicence}|${revisionsCount}`
    const verCode = (await sha256Hex(rawString)).toUpperCase().slice(0, 16)

    const y = this.pageH - mmToPx(14.5)
    const cx = this.pageW / 2

    let svg = ''
    svg += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#999">Content fingerprint: ${verCode} | Generated: ${escapeXml(dateStr)} | Scale: 1:${scaleVal}</text>`
    svg += `<text x="${cx}" y="${y + mmToPx(3.5)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">Selected plan data only; not certification, a signature or authority approval.</text>`

    return svg
  }

private getControlPoints(): CoordinateScheduleEntry[] {
    return this.data.controlPoints.map(cp => ({
      station: cp.name,
      northing: cp.northing,
      easting: cp.easting,
      height: cp.elevation,
      beaconClass: this.mapMonumentTypeToClass(cp.monumentType),
      description: cp.beaconDescription
    }))
  }

  private mapMonumentTypeToClass(mt: string): 'new' | 'old' | 'theoretical' | 'IPCU' {
    if (mt === 'set') return 'new'
    if (mt === 'found') return 'old'
    return 'theoretical'
  }
  
  private calculateCentroid(points: Array<{ easting: number; northing: number }>): { easting: number; northing: number } {
    const sumE = points.reduce((sum, p) => sum + p.easting, 0)
    const sumN = points.reduce((sum, p) => sum + p.northing, 0)
    return {
      easting: sumE / points.length,
      northing: sumN / points.length
    }
  }
}

interface FormNo4Data {
  folioNumber: string
  registerNumber: string
  lrNumber: string
  plotParcelNumber: string
  refMapRIM: string
  registrationBlock: string
  registrationDistrict: string
  locality: string
  formNumber: string
  computationsNo: string
  fieldBookNo: string
  dateReceived: string
  fileReference: string
  scale: string
  firNumber: string
  submissionNumber: string
  // Authentication
  examinedBy: string
  examinedDate: string
  approvedBy: string
  approvedDate: string
  authenticatedBy: string
  authenticatedDate: string
  // Declaration
  declarationText: string
  declarationDate: string
  letterNo: string
  // Surveyor credentials for stamp and certificate
  surveyorName: string
  surveyorLicence: string
  iskRegNo: string
  firmName: string
}

export default FormNo4Renderer
