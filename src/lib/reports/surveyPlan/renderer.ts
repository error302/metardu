import type { SurveyPlanData, PlanOptions } from './types'
import {
  DPI, PX_PER_MM, PX_PER_M,
  PAGE_WIDTH_MM, PAGE_HEIGHT_MM,
  STANDARD_SCALES, mmToPx, mToPx,
  bearingFromDelta, bearingToDMS, distance, midpoint,
  segmentAngle, textAngleForSegment, offsetFromMidpoint,
  centroid, boundingBox, selectScale, calcScaleLabel, calcScaleBarMetres,
  formatBearingDegMinSec,
} from './geometry'
import {
  svgFoundMonument, svgSetMonument, svgMasonryNail, svgIronPin,
  svgCornerDot, svgNorthArrow, svgScaleBar,
  svgSheetBorder, svgPanelDivider,
  escapeXml, polylineFromPoints,
  C_BLACK, C_GREEN, C_RED, C_GRID_MINOR, C_GRID_MAJOR,
  C_LOT_FILL, C_WARNING_BG,
} from './symbols'

export class SurveyPlanRenderer {
  private data: SurveyPlanData
  private opts: Required<PlanOptions>
  private pageW: number
  private pageH: number
  private drawingAreaW: number
  private drawingAreaH: number
  private drawingX: number
  private drawingY: number
  private panelX: number
  private panelW: number
  private margin = mmToPx(10)
  private titleBlockH = mmToPx(44)
  private scale = 500
  private mPerPx = 1
  private toSvgX!: (m: number) => number
  private toSvgY!: (m: number) => number

  constructor(data: SurveyPlanData, options?: PlanOptions) {
    this.data = data
    this.opts = {
      paperSize: options?.paperSize ?? 'a3',
      scale: options?.scale ?? 0,
      includeGrid: options?.includeGrid ?? true,
      includePanel: options?.includePanel ?? true,
      language: options?.language ?? 'en',
    }
    this.pageW = mmToPx(PAGE_WIDTH_MM)
    this.pageH = mmToPx(PAGE_HEIGHT_MM)
    this.drawingAreaW = this.pageW * 0.73
    this.drawingAreaH = this.pageH - this.margin * 2 - this.titleBlockH
    this.drawingX = this.margin
    this.drawingY = this.margin
    this.panelX = this.drawingX + this.drawingAreaW
    this.panelW = this.pageW - this.panelX - this.margin
    this.computeScale()
  }

  private computeScale(): void {
    const parcel = this.data.parcel
    const bb = boundingBox(parcel.boundaryPoints)
    const drawW = this.drawingAreaW - mmToPx(20)
    const drawH = this.drawingAreaH - mmToPx(20)
    if (this.opts.scale > 0) {
      this.scale = this.opts.scale
    } else {
      const scaleByWidth = drawW / bb.rangeE
      const scaleByHeight = drawH / bb.rangeN
      const rawScale = Math.min(scaleByWidth, scaleByHeight) * PX_PER_M
      this.scale = STANDARD_SCALES.find(s => s >= rawScale) || 500
    }
    this.mPerPx = this.scale / PX_PER_M
    const offsetX = (drawW - bb.rangeE * PX_PER_M) / 2
    const offsetY = (drawH - bb.rangeN * PX_PER_M) / 2
    const minE = bb.minE
    const minN = bb.minN
    this.toSvgX = (m) => this.drawingX + mmToPx(10) + offsetX + (m - minE) * PX_PER_M
    this.toSvgY = (m) => this.drawingY + mmToPx(10) + offsetY + (m - minN) * PX_PER_M
  }

  private drawBackground(): string {
    return `<rect x="0" y="0" width="${this.pageW}" height="${this.pageH}" fill="white"/>`
  }

  private drawSheetBorder(): string {
    return svgSheetBorder(this.pageW, this.pageH)
  }

  private drawPanelDivider(): string {
    return svgPanelDivider(this.panelX, this.pageH, this.margin, this.titleBlockH + this.margin)
  }

  private drawGrid(): string {
    const parcel = this.data.parcel
    const bb = boundingBox(parcel.boundaryPoints)
    const gridMinE = Math.floor(bb.minE / 50) * 50 - 50
    const gridMaxE = Math.ceil(bb.maxE / 50) * 50 + 50
    const gridMinN = Math.floor(bb.minN / 50) * 50 - 50
    const gridMaxN = Math.ceil(bb.maxN / 50) * 50 + 50
    let svg = ''
    for (let e = gridMinE; e <= gridMaxE; e += 50) {
      const x = this.toSvgX(e)
      const isMajor = e % 100 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      svg += `<line x1="${x}" y1="${this.toSvgY(gridMinN)}" x2="${x}" y2="${this.toSvgY(gridMaxN)}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      if (isMajor) {
        const lx = this.drawingX - 4
        const ly = this.toSvgY(e) + 3
        svg += `<text x="${lx}" y="${ly}" text-anchor="end" font-family="Share Tech Mono, Courier New" font-size="8" fill="${C_BLACK}" opacity="0.6">${e}</text>`
      }
    }
    for (let n = gridMinN; n <= gridMaxN; n += 50) {
      const y = this.toSvgY(n)
      const isMajor = n % 100 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      svg += `<line x1="${this.toSvgX(gridMinE)}" y1="${y}" x2="${this.toSvgX(gridMaxE)}" y2="${y}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      if (isMajor) {
        const lx = this.toSvgX(n) - 4
        const ly = this.drawingY + this.drawingAreaH + 12
        svg += `<text x="${lx}" y="${ly}" text-anchor="end" font-family="Share Tech Mono, Courier New" font-size="8" fill="${C_BLACK}" opacity="0.6" transform="rotate(-45,${lx},${ly})">${n}</text>`
      }
    }
    return svg
  }

  private drawLotFill(): string {
    const pts = this.data.parcel.boundaryPoints
    if (pts.length < 3) return ''
    const coords: string[] = []
    for (const p of pts) coords.push(`${this.toSvgX(p.easting)},${this.toSvgY(p.northing)}`)
    coords.push(`${this.toSvgX(pts[0].easting)},${this.toSvgY(pts[0].northing)}`)
    return `<polygon points="${coords.join(' ')}" fill="${C_LOT_FILL}" stroke="none"/>`
  }

  private drawAdjacentLots(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''
    let svg = ''
    for (const lot of lots) {
      if (lot.boundaryPoints.length < 2) continue
      svg += polylineFromPoints(lot.boundaryPoints, this.toSvgX, this.toSvgY, true)
    }
    return svg
  }

  private drawBoundary(): string {
    const pts = this.data.parcel.boundaryPoints
    if (pts.length < 2) return ''
    return polylineFromPoints(pts, this.toSvgX, this.toSvgY, true).replace('stroke-width="1"', 'stroke-width="2.5"')
  }

  private drawBoundaryLabels(): string {
    const pts = this.data.parcel.boundaryPoints
    let svg = ''
    for (let i = 0; i < pts.length; i++) {
      const from = pts[i]
      const to = pts[(i + 1) % pts.length]
      const dist = distance(from.easting, from.northing, to.easting, to.northing)
      const bearing = bearingFromDelta(to.easting - from.easting, to.northing - from.northing)
      const angleDeg = segmentAngle(from.easting, from.northing, to.easting, to.northing)
      const [bx, by] = offsetFromMidpoint(from.easting, from.northing, to.easting, to.northing, 4 / PX_PER_M)
      
      const bearingStr = formatBearingDegMinSec(bearing)
      const distStr = dist.toFixed(3) + ' m'
      const bearingWidth = bearingStr.length * 5.5
      const distWidth = distStr.length * 5
      const tw = Math.max(bearingWidth, distWidth) + 8
      const th = 24
      
      let textAngle = angleDeg
      if (textAngle > 90 || textAngle < -90) textAngle += 180
      
      svg += `<g transform="translate(${bx},${by})">`
      svg += `<g transform="rotate(${textAngle})">`
      svg += `<rect x="${-tw/2}" y="${-th/2}" width="${tw}" height="${th}" fill="white" opacity="0.85" stroke="none"/>`
      svg += `<text x="0" y="-3" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="8.5" font-weight="bold" fill="#000000">${escapeXml(bearingStr)}</text>`
      svg += `<text x="0" y="8" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="8" fill="#222222">${escapeXml(distStr)}</text>`
      svg += `</g></g>`
    }
    return svg
  }

  private drawMonuments(): string {
    let svg = ''
    const pts = this.data.parcel.boundaryPoints
    for (const pt of pts) {
      const cp = this.data.controlPoints.find(
        c => c.name === pt.name || (Math.abs(c.easting - pt.easting) < 0.01 && Math.abs(c.northing - pt.northing) < 0.01)
      )
      const cx = this.toSvgX(pt.easting)
      const cy = this.toSvgY(pt.northing)
      svg += svgCornerDot(cx, cy)
      if (!cp) continue
      switch (cp.monumentType) {
        case 'found': svg += svgFoundMonument(cx, cy); break
        case 'set': svg += svgSetMonument(cx, cy); break
        case 'masonry_nail': svg += svgMasonryNail(cx, cy, 'Masonry Nail\n1-00 on production\nof boundary'); break
        case 'iron_pin': svg += svgIronPin(cx, cy); break
      }
    }
    return svg
  }

  private drawBuildings(): string {
    const buildings = this.data.buildings
    if (!buildings || buildings.length === 0) return ''
    const defs = `<defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="0.5" opacity="0.12"/></pattern></defs>`
    let svg = defs
    for (const b of buildings) {
      const cx = this.toSvgX(b.easting)
      const cy = this.toSvgY(b.northing)
      const w = b.width_m * PX_PER_M
      const h = b.height_m * PX_PER_M
      svg += `<g transform="translate(${cx},${cy}) rotate(${b.rotation_deg})">`
      svg += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="rgba(220,210,190,0.3)" stroke="${C_BLACK}" stroke-width="1"/>`
      svg += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="url(#hatch)"/>`
      if (b.label) svg += `<text x="0" y="3" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7.5" font-weight="bold" fill="${C_BLACK}">${escapeXml(b.label)}</text>`
      svg += '</g>'
    }
    return svg
  }

  private drawLotNumber(): string {
    const pts = this.data.parcel.boundaryPoints
    const [ce, cn] = centroid(pts)
    const id = this.data.project.parcel_id || this.data.project.name || 'LOT'
    return `<text x="${this.toSvgX(ce)}" y="${this.toSvgY(cn)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="28" font-weight="bold" fill="${C_BLACK}" opacity="0.12">${escapeXml(id)}</text>`
  }

  private drawAreaLabel(): string {
    const pts = this.data.parcel.boundaryPoints
    const [ax, ay] = offsetFromMidpoint(pts[0].easting, pts[0].northing, pts[1].easting, pts[1].northing, 0.4)
    const area = this.data.parcel.area_sqm
    const ha = area / 10000
    return [
      `<text x="${ax}" y="${ay}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="11" fill="${C_BLACK}">${area.toFixed(2)} m\u00B2</text>`,
      `<text x="${ax}" y="${ay + 4.5}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="9" fill="${C_BLACK}">${ha.toFixed(4)} ha</text>`,
    ].join('')
  }

  private drawAdjacentLabels(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''
    let svg = ''
    const parcelCentroid = centroid(this.data.parcel.boundaryPoints)
    for (const lot of lots) {
      const pts = lot.boundaryPoints
      if (pts.length < 2) continue
      const [ce, cn] = centroid(pts)
      const px = this.toSvgX(ce)
      const py = this.toSvgY(cn)
      const isLeft = ce < parcelCentroid[0]
      const isTop = cn > parcelCentroid[1]
      let transform = ''
      if (isLeft) transform = `transform="translate(${px},${py}) rotate(-90)"`
      else if (!isTop) transform = `transform="translate(${px},${py}) rotate(90)"`
      svg += `<text ${transform} x="${px}" y="${py}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="11" font-weight="bold" fill="${C_BLACK}" opacity="0.45">${escapeXml(lot.id)}</text>`
    }
    return svg
  }

  private drawNorthArrow(): string {
    return svgNorthArrow(this.drawingX + mmToPx(8), this.drawingY + mmToPx(10) + 30, mmToPx(15))
  }

  private drawScaleBar(): string {
    const scaleBarPx = mmToPx(40)
    const segmentMetres = calcScaleBarMetres(this.scale)
    const x = this.drawingX + mmToPx(8)
    const y = this.drawingY + this.drawingAreaH - mmToPx(15)
    return svgScaleBar(x, y, scaleBarPx, segmentMetres, 4)
  }

  private drawRightPanel(): string {
    const p = this.data.project
    const leftPad = this.panelX + mmToPx(3)
    const rightPad = this.panelX + this.panelW - mmToPx(3)
    const panelInnerW = this.panelW - mmToPx(6)
    const svgParts: string[] = []
    svgParts.push(this.drawReportHeader(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawPlanInfoBox(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawLegend(leftPad, panelInnerW))
    svgParts.push(this.drawWarningBox(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawCertificate(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawCompanyFooter(leftPad, rightPad))
    return svgParts.join('')
  }

  private drawReportHeader(leftPad: number, rightPad: number, panelInnerW: number): string {
    const p = this.data.project
    const hasMun = !!p.municipality
    let y = this.margin + mmToPx(4)
    let svg = ''
    const text = (content: string, yPos: number, size: number, weight = 'normal', color = C_BLACK) =>
      `<text x="${leftPad}" y="${yPos}" font-family="Share Tech Mono, Courier New" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(content)}</text>`
    const hline = (y1: number) =>
      `<line x1="${leftPad}" y1="${y1}" x2="${rightPad}" y2="${y1}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += text('SURVEYOR\'S REAL PROPERTY REPORT', y, 5)
    svg += text(p.plan_title || 'BOUNDARY IDENTIFICATION PLAN', y + mmToPx(6), 9, 'bold')
    if (hasMun) svg += text(p.municipality!, y + mmToPx(11), 16, 'bold')
    svg += text(`SCALE ${calcScaleLabel(this.scale)}`, y + mmToPx(hasMun ? 18 : 12), 8, 'bold')
    svg += hline(y + mmToPx(hasMun ? 21 : 15))
    svg += text(p.firm_name || '', y + mmToPx(hasMun ? 25 : 19), 8, 'bold')
    svg += text(`\u00A9 ${new Date().getFullYear()}`, y + mmToPx(hasMun ? 28.5 : 22.5), 6)
    svg += text('Distances shown are in metres.', y + mmToPx(hasMun ? 33 : 27), 7, 'normal', '#555')
    svg += text('Divide by 0.3048 for feet.', y + mmToPx(hasMun ? 36 : 30), 7, 'italic', '#555')
    return svg
  }

  private drawPlanInfoBox(leftPad: number, rightPad: number, panelInnerW: number): string {
    const p = this.data.project
    const hasMun = !!p.municipality
    const startY = this.margin + mmToPx(hasMun ? 40 : 34)
    let y = startY
    let svg = ''
    const box = (yPos: number, h: number) =>
      `<rect x="${leftPad}" y="${yPos}" width="${panelInnerW}" height="${h}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    const row = (label: string, value: string) =>
      `<text x="${leftPad}" y="${y += mmToPx(4)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="#555">${escapeXml(label)}</text><text x="${leftPad + mmToPx(22)}" y="${y}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">${escapeXml(value)}</text>`
    svg += box(y, mmToPx(4))
    svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">PLAN INFORMATION</text>`
    y += mmToPx(4)
    const info: Array<[string, string]> = [
      ['Title Ref:', p.reference || '\u2014'],
      ['Datum:', p.datum || 'WGS84'],
      ['UTM Zone:', `${p.utm_zone}${p.hemisphere}`],
      ['Area:', p.area_sqm ? `${p.area_sqm.toFixed(2)} m\u00B2` : '\u2014'],
      ['Council:', p.municipality || '\u2014'],
      ['Client:', p.client_name || '\u2014'],
      ['Drawing No:', p.drawing_no || `MD-${Date.now().toString().slice(-6)}`],
    ]
    for (const [label, value] of info) svg += row(label, value)
    return svg
  }

  private drawLegend(leftPad: number, panelInnerW: number): string {
    const hasMun = !!this.data.project.municipality
    const afterInfo = this.margin + mmToPx(hasMun ? 40 : 34) + mmToPx(7 * 4 + 4 + 6)
    let y = afterInfo
    let svg = ''
    const box = (yPos: number, h: number) =>
      `<rect x="${leftPad}" y="${yPos}" width="${panelInnerW}" height="${h}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += box(y, mmToPx(4))
    svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">LEGEND</text>`
    const items = [
      { label: 'Subject boundary', symbol: `<line x1="0" y1="0" x2="20" y2="0" stroke="${C_BLACK}" stroke-width="2.5"/>` },
      { label: 'Adjacent boundary', symbol: `<line x1="0" y1="0" x2="20" y2="0" stroke="${C_BLACK}" stroke-width="1"/>` },
      { label: 'Found monument', symbol: `<rect x="0" y="-3" width="6" height="6" fill="${C_GREEN}" stroke="${C_BLACK}" stroke-width="0.5"/>` },
      { label: 'Set monument', symbol: `<circle cx="3" cy="0" r="3" fill="none" stroke="${C_GREEN}" stroke-width="1.5"/>` },
      { label: 'Masonry Nail', symbol: `<circle cx="3" cy="0" r="2.5" fill="${C_RED}"/>` },
      { label: 'Iron Pin', symbol: `<circle cx="3" cy="0" r="2" fill="${C_RED}" stroke="${C_BLACK}" stroke-width="0.4"/>` },
    ]
    for (const item of items) {
      svg += `<g transform="translate(${leftPad}, ${y += mmToPx(4)})">${item.symbol}</g>`
      svg += `<text x="${leftPad + mmToPx(10)}" y="${y}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">${escapeXml(item.label)}</text>`
    }
    return svg
  }

  private drawWarningBox(leftPad: number, rightPad: number, panelInnerW: number): string {
    const hasMun = !!this.data.project.municipality
    const afterLegend = this.margin + mmToPx(hasMun ? 40 : 34) + mmToPx(7 * 4 + 4 + 6) + mmToPx(6 * 4 + 6)
    const y = afterLegend
    let svg = ''
    svg += `<rect x="${leftPad}" y="${y}" width="${panelInnerW}" height="${mmToPx(12)}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<rect x="${leftPad + 0.5}" y="${y + 0.5}" width="${panelInnerW - 1}" height="${mmToPx(12) - 1}" fill="${C_WARNING_BG}"/>`
    const lines = ['WARNING: Fence set-out pegs', 'must be verified on site.', 'Dimensions subject to', 'survey verification.']
    lines.forEach((line, i) => {
      svg += `<text x="${leftPad + mmToPx(2)}" y="${y + mmToPx(3) + i * mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="${i === 0 ? 'bold' : 'normal'}" fill="${C_BLACK}">${escapeXml(line)}</text>`
    })
    return svg
  }

  private drawCertificate(leftPad: number, rightPad: number, panelInnerW: number): string {
    const hasMun = !!this.data.project.municipality
    const afterWarning = this.margin + mmToPx(hasMun ? 40 : 34) + mmToPx(7 * 4 + 4 + 6) + mmToPx(6 * 4 + 6) + mmToPx(12 + 4)
    const y = afterWarning
    const p = this.data.project
    let svg = ''
    svg += `<rect x="${leftPad}" y="${y}" width="${panelInnerW}" height="${mmToPx(2)}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">CERTIFICATE</text>`
    svg += `<text x="${leftPad}" y="${y + mmToPx(7)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">1. I certify that this plan is</text>`
    svg += `<text x="${leftPad}" y="${y + mmToPx(10)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">correct and in accordance</text>`
    svg += `<text x="${leftPad}" y="${y + mmToPx(13)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">with applicable standards.</text>`
    const sigY = y + mmToPx(18)
    svg += `<line x1="${leftPad}" y1="${sigY}" x2="${leftPad + mmToPx(50)}" y2="${sigY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${leftPad}" y="${sigY + mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" font-weight="bold" fill="${C_BLACK}">${escapeXml(p.surveyor_name || 'The Professional Licensed Surveyor')}</text>`
    if (p.surveyor_licence) svg += `<text x="${leftPad}" y="${sigY + mmToPx(6)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">Licence No: ${escapeXml(p.surveyor_licence)}</text>`
    return svg
  }

  private drawCompanyFooter(leftPad: number, rightPad: number): string {
    const hasMun = !!this.data.project.municipality
    const certY = this.margin + mmToPx(hasMun ? 40 : 34) + mmToPx(7 * 4 + 4 + 6) + mmToPx(6 * 4 + 6) + mmToPx(12 + 4) + mmToPx(20)
    const y = certY
    const p = this.data.project
    let svg = `<line x1="${leftPad}" y1="${y}" x2="${rightPad}" y2="${y}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    if (p.firm_phone) svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">${escapeXml(p.firm_phone)}</text>`
    if (p.firm_email) svg += `<text x="${leftPad}" y="${y + mmToPx(6)}" font-family="Share Tech Mono, Courier New" font-size="5" fill="${C_BLACK}">${escapeXml(p.firm_email)}</text>`
    return svg
  }

  private drawSheetFooter(): string {
    const footerY = this.pageH - this.titleBlockH
    const footerH = this.titleBlockH
    const p = this.data.project
    const cols = 8
    const colW = (this.pageW - this.margin * 2) / cols
    let svg = `<rect x="${this.margin}" y="${footerY}" width="${this.pageW - this.margin * 2}" height="${footerH}" fill="#F8F8F8"/>`
    svg += `<line x1="${this.margin}" y1="${footerY}" x2="${this.pageW - this.margin}" y2="${footerY}" stroke="${C_BLACK}" stroke-width="2"/>`
    const fields: Array<[string, string]> = [
      ['Field', ''],
      ['Drawing', p.drawing_no || `MD-${Date.now().toString().slice(-6)}`],
      ['Checked', ''],
      ['Address', p.firm_address || ''],
      ['Date', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
      ['Work Order', ''],
      ['Job No.', p.reference || ''],
      [p.firm_name || 'METARDU', ''],
    ]
    let x = this.margin
    for (let i = 0; i < cols; i++) {
      const [label, value] = fields[i] || ['', '']
      const cx = x + colW / 2
      svg += `<line x1="${x}" y1="${footerY}" x2="${x}" y2="${footerY + footerH}" stroke="${C_BLACK}" stroke-width="0.5"/>`
      if (i === cols - 1) {
        svg += `<rect x="${x}" y="${footerY}" width="${colW}" height="${footerH}" fill="${C_BLACK}"/>`
        svg += `<text x="${cx}" y="${footerY + footerH / 2 + 4}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="11" font-weight="bold" fill="white">${escapeXml(label)}</text>`
      } else {
        svg += `<text x="${cx}" y="${footerY + mmToPx(4)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="5" fill="#555">${escapeXml(label)}</text>`
        svg += `<text x="${cx}" y="${footerY + mmToPx(10)}" text-anchor="middle" font-family="Share Tech Mono, Courier New" font-size="7" font-weight="bold" fill="${C_BLACK}">${escapeXml(value)}</text>`
      }
      x += colW
    }
    return svg
  }

  render(): string {
    const layers: string[] = []
    layers.push(this.drawBackground())
    layers.push(this.drawSheetBorder())
    if (this.opts.includePanel) layers.push(this.drawPanelDivider())
    if (this.opts.includeGrid) layers.push(this.drawGrid())
    layers.push(this.drawLotFill())
    layers.push(this.drawAdjacentLots())
    layers.push(this.drawBoundary())
    layers.push(this.drawBoundaryLabels())
    layers.push(this.drawMonuments())
    layers.push(this.drawLotNumber())
    layers.push(this.drawAreaLabel())
    layers.push(this.drawAdjacentLabels())
    layers.push(this.drawBuildings())
    layers.push(this.drawNorthArrow())
    layers.push(this.drawScaleBar())
    if (this.opts.includePanel) layers.push(this.drawRightPanel())
    layers.push(this.drawSheetFooter())
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.pageW} ${this.pageH}" width="${this.pageW}" height="${this.pageH}" style="font-family: 'Share Tech Mono', 'Courier New', monospace;">${layers.join('\n')}</svg>`
  }

  getScale(): number { return this.scale }
}
