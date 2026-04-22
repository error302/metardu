/**
 * Form No. 4 Survey Plan Renderer Extension
 * Kenya Land Office compliant survey plan rendering
 * Extends base SurveyPlanRenderer with Form No. 4 specific features
 */

import { SurveyPlanRenderer } from './renderer'
import type { SurveyPlanData, PlanOptions, CoordinateScheduleEntry, InsetDiagram } from './types'
import {
  DPI, PX_PER_MM, PX_PER_M,
  PAGE_WIDTH_MM, PAGE_HEIGHT_MM,
  mmToPx, mToPx,
  bearingFromDelta, bearingToDMS, distance, midpoint,
  formatBearingDegMinSec,
  boundingBox,
} from './geometry'
import {
  escapeXml,
  C_BLACK, C_GREEN, C_RED, C_GRID_MINOR, C_GRID_MAJOR,
  C_LOT_FILL, C_WARNING_BG,
} from './symbols'

/**
 * Extended SurveyPlanRenderer that produces Form No. 4 compliant output
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
      scale: p.scale || `1:${this.getScale()}`,
      firNumber: p.firNumber || '',
      submissionNumber: submissionNumber || '',
      // Authentication block
      examinedBy: '',
      examinedDate: '',
      approvedBy: '',
      approvedDate: '',
      authenticatedBy: '',
      authenticatedDate: '',
      // Surveyor declaration
      declarationText: `I, ${p.surveyor_name || '[SURVEYOR NAME]'}, a Licensed Surveyor, hereby certify that this survey was carried out under my direct supervision in accordance with the Survey Act Cap. 299 and Survey Regulations 1994.`,
      declarationDate: new Date().toLocaleDateString('en-GB'),
      letterNo: '',
    }
  }

  /**
   * Render Form No. 4 compliant survey plan
   */
  renderFormNo4(): string {
    const layers: string[] = []
    
    // Base layers
    layers.push(this.drawBackground())
    layers.push(this.drawSheetBorder())
    layers.push(this.drawPanelDivider())
    layers.push(this.drawGrid())
    layers.push(this.drawLotFill())
    
    // Form No. 4 specific layers
    layers.push(this.drawCoordinateTables())
    layers.push(this.drawLRNumbersOnParcels())
    layers.push(this.drawRoadAnnotations())
    
    // Standard layers
    layers.push(this.drawAdjacentLots())
    layers.push(this.drawBoundary())
    layers.push(this.drawBoundaryLabels())
    layers.push(this.drawMonuments())
    layers.push(this.drawNorthArrow())
    layers.push(this.drawScaleBar())
    
    // Form No. 4 panels and footer
    layers.push(this.drawFormNo4RightPanel())
    layers.push(this.drawFormNo4TitleBlock())
    layers.push(this.drawSubmissionNumberHeader())
    layers.push(this.drawLegalReferenceLine())
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.getPageWidth()} ${this.getPageHeight()}" width="${this.getPageWidth()}" height="${this.getPageHeight()}" style="font-family: 'Share Tech Mono', 'Courier New', monospace;">${layers.join('\n')}</svg>`
  }

  /**
   * Draw coordinate tables (Form No. 4 Rule 1)
   * Split into left and right tables
   */
  private drawCoordinateTables(): string {
    const controlPts = this.getControlPoints()
    if (controlPts.length === 0) return ''

    // Split beacons: P/K-series on left, N/D-series on right
    const leftSideBeacons = controlPts.filter(p => 
      p.name.startsWith('P') || p.name.startsWith('K')
    )
    const rightSideBeacons = controlPts.filter(p => 
      p.name.startsWith('N') || p.name.startsWith('D')
    )

    let svg = ''
    
    // Left table
    if (leftSideBeacons.length > 0) {
      svg += this.drawCoordinateTable(leftSideBeacons, 'left', mmToPx(15), mmToPx(25))
    }
    
    // Right table
    if (rightSideBeacons.length > 0) {
      svg += this.drawCoordinateTable(rightSideBeacons, 'right', 
        this.getPageWidth() - mmToPx(15) - mmToPx(65), mmToPx(25))
    }

    return svg
  }

  private drawCoordinateTable(
    beacons: CoordinateScheduleEntry[],
    side: 'left' | 'right',
    x: number,
    y: number
  ): string {
    const colWidths = [mmToPx(15), mmToPx(18), mmToPx(18), mmToPx(12), mmToPx(12)]
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
      svg += `<text x="${hx + colWidths[i]/2}" y="${y + rowHeight/2 + 2}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="6" font-weight="bold" fill="${C_BLACK}">${h}</text>`
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
        svg += `<text x="${hx + (i < 1 ? 2 : colWidths[i]/2)}" y="${rowY + rowHeight/2 + 2}" text-anchor="${i < 1 ? 'start' : 'middle'}" font-family="Share Tech Mono, Courier New" font-size="5.5" fill="${C_BLACK}">${escapeXml(cell)}</text>`
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
    const p = this.getData().project
    if (!p.lrNumber) return ''

    const boundaryPts = this.getRotatedPoints()
    if (boundaryPts.length < 3) return ''

    // Calculate centroid of parcel
    const centroid = this.calculateCentroid(boundaryPts)
    const cx = this.toSvgX(centroid.easting)
    const cy = this.toSvgY(centroid.northing)

    const parcelArea = this.getData().parcel.area_sqm || 0
    const areaHa = (parcelArea / 10000).toFixed(4)

    let svg = ''
    
    // LR Number label
    svg += `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="11" font-weight="bold" fill="${C_BLACK}">LR No. ${escapeXml(p.lrNumber)}</text>`
    
    // Area label
    svg += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="9" fill="${C_BLACK}">A=co=${areaHa} Ha</text>`
    
    // DP Number if available
    if (p.plotParcelNumber) {
      svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="8" fill="${C_BLACK}">D.P No. ${escapeXml(p.plotParcelNumber)}</text>`
    }

    return svg
  }

  /**
   * Draw road annotations (Form No. 4 Rule 3)
   */
  private drawRoadAnnotations(): string {
    const p = this.getData().project
    
    // Find a suitable location for annotations (bottom of drawing area)
    const minE = Math.min(...this.getRotatedPoints().map(p => p.easting))
    const maxE = Math.max(...this.getRotatedPoints().map(p => p.easting))
    const minN = Math.min(...this.getRotatedPoints().map(p => p.northing))
    
    const cx = this.toSvgX((minE + maxE) / 2)
    const cy = this.toSvgY(minN) + mmToPx(15)

    let svg = ''
    
    // Road width note
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7" fill="${C_BLACK}">All new roads are 12.00m Wide</text>`
    
    // Road truncation note
    svg += `<text x="${cx}" y="${cy + mmToPx(5)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7" fill="${C_BLACK}">All road truncations ±6mm</text>`

    return svg
  }

  /**
   * Draw Form No. 4 right panel
   */
  private drawFormNo4RightPanel(): string {
    const p = this.getData().project
    const d = this.formNo4Data
    const panelX = this.getPanelX()
    const panelW = this.getPanelWidth()
    const margin = mmToPx(10)
    
    let y = margin + mmToPx(5)
    let svg = `<g class="form-no-4-panel">`

    // Title
    svg += `<text x="${panelX + panelW/2}" y="${y}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="10" font-weight="bold" fill="${C_BLACK}">SURVEYOR'S PLAN</text>`
    y += mmToPx(6)
    
    // Form number
    svg += `<text x="${panelX + panelW/2}" y="${y}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="9" fill="${C_BLACK}">${d.formNumber}</text>`
    y += mmToPx(8)

    // Plan info box
    const infoFields = [
      ['Registration District', d.registrationDistrict || p.location?.split(',')[0] || ''],
      ['Locality', d.locality || p.location || ''],
      ['LR Number', d.lrNumber],
      ['Folio Number', d.folioNumber],
      ['Register Number', d.registerNumber],
      ['FIR Number', d.firNumber],
      ['Scale', d.scale],
      ['Datum', p.datum || 'ARC1960'],
      ['UTM Zone', `${p.utm_zone || 37}${p.hemisphere || 'S'}`],
    ]

    svg += `<rect x="${panelX + margin/2}" y="${y}" width="${panelW - margin}" height="${mmToPx(50)}" fill="#f9f9f9" stroke="${C_BLACK}" stroke-width="0.5"/>`
    
    let fieldY = y + mmToPx(5)
    infoFields.forEach(([label, value]) => {
      if (value) {
        svg += `<text x="${panelX + margin}" y="${fieldY}" font-family="Share Tech Mono, Courier New" font-size="6" fill="#555">${escapeXml(label)}:</text>`
        svg += `<text x="${panelX + panelW - margin}" y="${fieldY}" text-anchor="end" font-family="Share Tech Mono, Courier New" font-size="6" font-weight="bold" fill="${C_BLACK}">${escapeXml(value)}</text>`
        fieldY += mmToPx(5)
      }
    })
    
    y += mmToPx(55)

    // Legend
    svg += this.drawFormNo4Legend(panelX + margin/2, y, panelW - margin)
    y += mmToPx(40)

    // Surveyor certificate
    svg += this.drawSurveyorCertificate(panelX + margin/2, y, panelW - margin)

    svg += '</g>'
    return svg
  }

  private drawFormNo4Legend(x: number, y: number, w: number): string {
    let svg = `<rect x="${x}" y="${y}" width="${w}" height="${mmToPx(35)}" fill="#fafafa" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${x + w/2}" y="${y + mmToPx(5)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7" font-weight="bold" fill="${C_BLACK}">LEGEND</text>`
    
    const items = [
      { symbol: '■', color: C_GREEN, label: 'Found Monument' },
      { symbol: '○', color: C_GREEN, label: 'Set Monument' },
      { symbol: '●', color: C_RED, label: 'Masonry Nail' },
      { symbol: '---', color: C_BLACK, label: 'Boundary Line' },
    ]
    
    let itemY = y + mmToPx(10)
    items.forEach(item => {
      svg += `<text x="${x + mmToPx(3)}" y="${itemY}" font-family="Share Tech Mono, Courier New" font-size="10" fill="${item.color}">${item.symbol}</text>`
      svg += `<text x="${x + mmToPx(8)}" y="${itemY}" font-family="Share Tech Mono, Courier New" font-size="6" fill="${C_BLACK}">${item.label}</text>`
      itemY += mmToPx(6)
    })
    
    return svg
  }

  private drawSurveyorCertificate(x: number, y: number, w: number): string {
    const d = this.formNo4Data
    const h = mmToPx(45)
    
    let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${x + w/2}" y="${y + mmToPx(5)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7" font-weight="bold" fill="${C_BLACK}">SURVEYOR CERTIFICATE</text>`
    
    // Declaration text (wrapped)
    const words = d.declarationText.split(' ')
    const lines: string[] = []
    let currentLine = ''
    
    words.forEach(word => {
      if ((currentLine + word).length > 45) {
        lines.push(currentLine.trim())
        currentLine = word + ' '
      } else {
        currentLine += word + ' '
      }
    })
    if (currentLine) lines.push(currentLine.trim())
    
    let textY = y + mmToPx(12)
    lines.slice(0, 4).forEach(line => {
      svg += `<text x="${x + mmToPx(2)}" y="${textY}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">${escapeXml(line)}</text>`
      textY += mmToPx(4)
    })
    
    // Signature line
    textY += mmToPx(5)
    svg += `<line x1="${x + mmToPx(2)}" y1="${textY}" x2="${x + w - mmToPx(2)}" y2="${textY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${x + w/2}" y="${textY + mmToPx(4)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="5" fill="#555">Surveyor Signature</text>`
    
    return svg
  }

  /**
   * Draw Form No. 4 title block at bottom
   */
  private drawFormNo4TitleBlock(): string {
    const d = this.formNo4Data
    const footerY = this.getPageHeight() - mmToPx(50)
    const footerH = mmToPx(44)
    const margin = mmToPx(10)
    const cols = 6
    const colW = (this.getPageWidth() - margin * 2) / cols

    let svg = `<g class="form-no-4-title-block">`
    
    // Main title block with 6 columns
    const headers = ['Registration', 'Transaction', 'Authentication', 'Date', 'Records', 'Date']
    let x = margin
    
    headers.forEach((header, i) => {
      svg += `<rect x="${x}" y="${footerY}" width="${colW}" height="${footerH}" fill="#f8f8f8" stroke="${C_BLACK}" stroke-width="0.5"/>`
      svg += `<text x="${x + colW/2}" y="${footerY + mmToPx(4)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">${header}</text>`
      x += colW
    })

    // Folio and Register numbers (large text below)
    const folioY = footerY + footerH + mmToPx(3)
    
    if (d.folioNumber) {
      svg += `<text x="${this.getPageWidth()/2 - mmToPx(40)}" y="${folioY}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="14" font-weight="bold" fill="${C_BLACK}">Folio No. ${escapeXml(d.folioNumber)}</text>`
    }
    
    if (d.registerNumber) {
      svg += `<text x="${this.getPageWidth()/2 + mmToPx(40)}" y="${folioY}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="14" font-weight="bold" fill="${C_BLACK}">Register No. ${escapeXml(d.registerNumber)}</text>`
    }
    
    if (d.firNumber) {
      svg += `<text x="${this.getPageWidth()/2}" y="${folioY + mmToPx(6)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="10" fill="${C_BLACK}">FIR No. ${escapeXml(d.firNumber)}</text>`
    }

    svg += '</g>'
    return svg
  }

  /**
   * Draw submission number in header
   */
  private drawSubmissionNumberHeader(): string {
    const d = this.formNo4Data
    if (!d.submissionNumber) return ''

    const y = mmToPx(8)
    const cx = this.getPageWidth() / 2

    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="8" font-weight="bold" fill="${C_BLACK}">Submission: ${escapeXml(d.submissionNumber)}</text>`
  }

  // Helper methods to access private parent properties
  private getPageWidth(): number { return (this as any).pageW }
  private getPageHeight(): number { return (this as any).pageH }
  private getPanelX(): number { return (this as any).panelX }
  private getPanelWidth(): number { return (this as any).panelW }
  private getControlPoints(): CoordinateScheduleEntry[] {
    const data = this.getData()
    return data.controlPoints.map(cp => ({
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
  
  private getRotatedPoints(): Array<{ easting: number; northing: number }> {
    return (this as any).rotatedPoints
  }
  
  private getData(): SurveyPlanData {
    return (this as any).data
  }
  
  private toSvgX(m: number): number {
    return (this as any).toSvgX(m)
  }
  
  private toSvgY(m: number): number {
    return (this as any).toSvgY(m)
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
}

export default FormNo4Renderer
