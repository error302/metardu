import { sha256Hex } from '@/lib/crypto/sha256'
import type { SurveyPlanData, PlanOptions } from './types'
import { getRoadReserveWidth } from './types'
import { reportCrs, describeVerticalDatum } from '@/lib/generators/reportCrs'
import { generateBearingScheduleCSV } from '../bearingScheduleCSV'
import { hasCrossingBoundary } from '@/lib/survey/boundaryValidity'
import { coordinateArea } from '@/lib/engine/area'
import {
  PX_PER_M,
  PAGE_WIDTH_MM, PAGE_HEIGHT_MM,
  STANDARD_SCALES, mmToPx,
  bearingFromDelta, distance,
  segmentAngle, offsetFromMidpoint,
  centroid, boundingBox, calcScaleLabel, calcScaleBarMetres,
  formatBearingDegMinSec,
  offsetPointPerpendicular, rotatePoints,
  formatChainage, computeChainageAlongAlignment,
} from './geometry'
import {
  svgFoundMonument, svgSetMonument, svgMasonryNail, svgIronPin,
  svgCornerDot, svgNorthArrow, svgScaleBar,
  svgSheetBorder, svgPanelDivider,
  svgFenceLine, svgFenceCallout,
  svgIndicatoryBeaconCallout,
  escapeXml, polylineFromPoints,
  C_BLACK, C_GREEN, C_RED, C_GRID_MINOR, C_GRID_MAJOR,
  C_LOT_FILL, C_WARNING_BG,
} from './symbols'

export class SurveyPlanRenderer {
  protected data: SurveyPlanData
  protected opts: Required<PlanOptions>
  protected pageW: number
  protected pageH: number
  protected drawingAreaW: number
  protected drawingAreaH: number
  protected drawingX: number
  protected drawingY: number
  protected panelX: number
  protected panelW: number
  protected margin = mmToPx(10)
  protected titleBlockH = mmToPx(44)
  protected scale = 500
  protected mPerPx = 1
  protected toSvgX!: (m: number) => number
  protected toSvgY!: (m: number) => number
  protected rotatedPoints: Array<{ easting: number; northing: number }> = []

  /** Single CRS path for every rendered CRS statement (reportCrs — never hard-coded fallbacks). */
  protected get crs() {
    const p = this.data.project
    return reportCrs({
      utmZone: p.utm_zone,
      hemisphere: p.hemisphere,
      datum: p.datum,
      verticalDatum: p.vertical_datum,
      verticalReference: p.vertical_reference,
      geoidModel: p.geoid_model,
      benchmarkBasis: p.benchmark_basis,
    })
  }

  constructor(data: SurveyPlanData, options?: PlanOptions) {
    this.data = data
    this.opts = {
      paperSize: options?.paperSize ?? 'a3',
      scale: options?.scale ?? 0,
      includeGrid: options?.includeGrid ?? true,
      includePanel: options?.includePanel ?? true,
      language: options?.language ?? 'en',
      watermarkPlan: options?.watermarkPlan ?? 'free',
    }
    this.pageW = mmToPx(PAGE_WIDTH_MM)
    this.pageH = mmToPx(PAGE_HEIGHT_MM)
    this.drawingAreaW = this.pageW * 0.73
    this.drawingAreaH = this.pageH - this.margin * 2 - this.titleBlockH
    this.drawingX = this.margin
    this.drawingY = this.margin
    this.panelX = this.drawingX + this.drawingAreaW
    this.panelW = this.pageW - this.panelX - this.margin
    this.rotatedPoints = this.getTransformedPoints()
    this.computeScale()
  }

  protected computeScale(): void {
    const bb = boundingBox(this.rotatedPoints)
    const drawW = this.drawingAreaW - mmToPx(20)
    const drawH = this.drawingAreaH - mmToPx(20)
    
    if (this.opts.scale > 0) {
      this.scale = this.opts.scale
    } else {
      const actualPxPerM = Math.min(drawW / bb.rangeE, drawH / bb.rangeN)
      const rawScale = PX_PER_M / actualPxPerM
      this.scale = STANDARD_SCALES.find((s: number) => s >= rawScale) || Math.ceil(rawScale / 1000) * 1000
    }
    
    const pxPerM = PX_PER_M / this.scale
    this.mPerPx = 1 / pxPerM

    const offsetX = (drawW - bb.rangeE * pxPerM) / 2
    const offsetY = (drawH - bb.rangeN * pxPerM) / 2
    
    this.toSvgX = (m) => this.drawingX + mmToPx(10) + offsetX + (m - bb.minE) * pxPerM
    this.toSvgY = (m) => this.drawingY + mmToPx(10) + offsetY + (bb.maxN - m) * pxPerM
  }


  private getTransformedPoints(): Array<{ easting: number; northing: number }> {
    const pts = this.data.parcel.boundaryPoints
    const rotDeg = this.data.project.northRotationDeg || 0
    if (rotDeg === 0) return pts
    const { minE, maxE, minN, maxN } = boundingBox(pts)
    const cx = (minE + maxE) / 2
    const cy = (minN + maxN) / 2
    return rotatePoints(pts, rotDeg, cx, cy)
  }

  protected drawBackground(): string {
    return `<rect x="0" y="0" width="${this.pageW}" height="${this.pageH}" fill="white"/>`
  }

  protected drawSheetBorder(): string {
    return svgSheetBorder(this.pageW, this.pageH, mmToPx(7), mmToPx(9))
  }

  protected drawPanelDivider(): string {
    return svgPanelDivider(this.panelX, this.pageH, this.margin, this.titleBlockH + this.margin)
  }

  protected drawGrid(): string {
    // The axis-aligned grid cannot represent a rotated display accurately.
    if (this.data.project.northRotationDeg) return ''
    const parcel = this.data.parcel
    const bb = boundingBox(parcel.boundaryPoints)
    
    // Use nice round numbers for grid lines (every 50m)
    const gridMinE = Math.floor(bb.minE / 50) * 50
    const gridMaxE = Math.ceil(bb.maxE / 50) * 50
    const gridMinN = Math.floor(bb.minN / 50) * 50
    const gridMaxN = Math.ceil(bb.maxN / 50) * 50
    
    let svg = ''
    
    // Vertical lines (Easting)
    for (let e = gridMinE; e <= gridMaxE; e += 50) {
      const x = this.toSvgX(e)
      if (x < this.drawingX + mmToPx(14) || x > this.panelX - mmToPx(5)) continue
      const y1 = this.drawingY + mmToPx(3)
      const y2 = this.drawingY + this.drawingAreaH - mmToPx(3)
      const isMajor = e % 100 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      
      svg += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      
      if (isMajor) {
        const ly = this.drawingY + this.drawingAreaH - mmToPx(1)
        svg += `<text x="${x}" y="${ly}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" opacity="0.6">${e}</text>`
      }
    }
    
    // Horizontal lines (Northing)
    for (let n = gridMinN; n <= gridMaxN; n += 50) {
      const y = this.toSvgY(n)
      if (y < this.drawingY + mmToPx(4) || y > this.drawingY + this.drawingAreaH - mmToPx(4)) continue
      const x1 = this.drawingX + mmToPx(3)
      const x2 = this.panelX - mmToPx(3)
      const isMajor = n % 100 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      
      svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      
      if (isMajor) {
        const lx = this.drawingX + mmToPx(3)
        svg += `<text x="${lx}" y="${y - 3}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" opacity="0.6">${n}</text>`
      }
    }
    
    return svg
  }


  protected drawLotFill(): string {
    const pts = this.data.parcel.boundaryPoints
    if (pts.length < 3) return ''
    const coords: string[] = []
    for (const p of pts) coords.push(`${this.toSvgX(p.easting)},${this.toSvgY(p.northing)}`)
    coords.push(`${this.toSvgX(pts[0].easting)},${this.toSvgY(pts[0].northing)}`)
    return `<polygon points="${coords.join(' ')}" fill="${C_LOT_FILL}" stroke="none"/>`
  }

  protected drawAdjacentLots(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''
    let svg = ''
    for (const lot of lots) {
      if (lot.boundaryPoints.length < 2) continue
      svg += polylineFromPoints(lot.boundaryPoints, this.toSvgX, this.toSvgY, true)
    }
    return svg
  }

  protected drawBoundary(): string {
    const pts = this.data.parcel.boundaryPoints
    if (pts.length < 2) return ''
    return polylineFromPoints(pts, this.toSvgX, this.toSvgY, true).replace('stroke-width="1"', 'stroke-width="2.5"')
  }

  protected drawBoundaryLabels(): string {
    const pts = this.rotatedPoints
    let svg = ''
    for (let i = 0; i < pts.length; i++) {
      const from = pts[i]
      const to = pts[(i + 1) % pts.length]
      const dist = distance(from.easting, from.northing, to.easting, to.northing)
      const rawFrom = this.data.parcel.boundaryPoints[i]
      const rawTo = this.data.parcel.boundaryPoints[(i + 1) % pts.length]
      const bearing = bearingFromDelta(rawTo.easting - rawFrom.easting, rawTo.northing - rawFrom.northing)
      const angleDeg = Math.atan2(this.toSvgY(to.northing) - this.toSvgY(from.northing), this.toSvgX(to.easting) - this.toSvgX(from.easting)) * 180 / Math.PI
      const [labelE, labelN] = offsetFromMidpoint(from.easting, from.northing, to.easting, to.northing, mmToPx(4) * this.mPerPx)
      const bx = this.toSvgX(labelE), by = this.toSvgY(labelN)
      
      const bearingStr = formatBearingDegMinSec(bearing)
      const distStr = dist.toFixed(2) + ' m'
      const bearingWidth = bearingStr.length * 5.5
      const distWidth = distStr.length * 5
      const tw = Math.max(bearingWidth, distWidth) + 8
      const th = 24
      
      let textAngle = angleDeg
      if (textAngle > 90 || textAngle < -90) textAngle += 180
      
      svg += `<g transform="translate(${bx},${by})">`
      svg += `<g transform="rotate(${textAngle})">`
      svg += `<rect x="${-tw/2}" y="${-th/2}" width="${tw}" height="${th}" fill="white" opacity="0.85" stroke="none"/>`
      svg += `<text x="0" y="-3" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#000000">${escapeXml(bearingStr)}</text>`
      svg += `<text x="0" y="8" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#222222">${escapeXml(distStr)}</text>`
      svg += `</g></g>`
    }
    return svg
  }

  protected drawMonuments(): string {
    let svg = ''
    const rawPts = this.data.parcel.boundaryPoints
    const rotPts = this.rotatedPoints
    for (let i = 0; i < rawPts.length; i++) {
      const rawPt = rawPts[i]
      const rotPt = rotPts[i]
      const cp = this.data.controlPoints.find(
        c => c.name === rawPt.name || (Math.abs(c.easting - rawPt.easting) < 0.01 && Math.abs(c.northing - rawPt.northing) < 0.01)
      )
      const cx = this.toSvgX(rotPt.easting)
      const cy = this.toSvgY(rotPt.northing)
      svg += svgCornerDot(cx, cy)
      svg += `<text x="${cx + 7}" y="${cy - 7}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(rawPt.name)}</text>`
      if (!cp) continue
      switch (cp.monumentType) {
        case 'found': svg += svgFoundMonument(cx, cy); break
        case 'set': svg += svgSetMonument(cx, cy); break
        case 'masonry_nail': svg += svgMasonryNail(cx, cy, 'Masonry nail'); break
        case 'iron_pin': svg += svgIronPin(cx, cy); break
        case 'indicatory_beacon': {
          const cornerX = this.toSvgX(rotPt.easting)
          const cornerY = this.toSvgY(rotPt.northing)
          const offsetPx = 20
          const ibx = cornerX + offsetPx
          const iby = cornerY + offsetPx
          svg += svgIndicatoryBeaconCallout(ibx, iby, cornerX, cornerY, this.scale)
          break
        }
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
      if (b.label) svg += `<text x="0" y="3" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${escapeXml(b.label)}</text>`
      svg += '</g>'
    }
    return svg
  }

  private drawLotNumber(): string {
    const pts = this.rotatedPoints
    const [ce, cn] = centroid(pts)
    const id = this.data.project.parcel_id || this.data.project.name || 'LOT'
    return `<text x="${this.toSvgX(ce)}" y="${this.toSvgY(cn)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="28" font-weight="bold" fill="${C_BLACK}" opacity="0.12">${escapeXml(id)}</text>`
  }

  private drawAreaLabel(): string {
    const pts = this.rotatedPoints
    const [ax, ay] = offsetFromMidpoint(pts[0].easting, pts[0].northing, pts[1].easting, pts[1].northing, 0.4)
    const area = this.data.parcel.area_sqm
    const ha = area / 10000
    return [
      `<text x="${ax}" y="${ay}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="11" fill="${C_BLACK}">${area.toFixed(2)} m\u00B2</text>`,
      `<text x="${ax}" y="${ay + 4.5}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${ha.toFixed(4)} ha</text>`,
    ].join('')
  }

  private drawPinLabel(): string {
    const pin = this.data.parcel.pin
    if (!pin) return ''
    const pts = this.rotatedPoints
    if (pts.length === 0) return ''
    const { minE, maxE, minN, maxN } = boundingBox(pts)
    const cx = this.toSvgX((minE + maxE) / 2)
    const cy = this.toSvgY((minN + maxN) / 2)
    const tw = pin.length * 7 + 8
    const th = 12
    let svg = `<rect x="${cx - tw/2}" y="${cy - th/2}" width="${tw}" height="${th}" fill="#FFF8DC" stroke="${C_BLACK}" stroke-width="0.5" opacity="0.7"/>`
    svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">PIN: ${escapeXml(pin)}</text>`
    return svg
  }

  private drawPartLabels(): string {
    const parts = this.data.parcel.parts
    if (!parts || parts.length === 0) return ''
    const pts = this.rotatedPoints
    if (pts.length === 0) return ''
    const { minE, maxE, minN, maxN } = boundingBox(pts)
    const cx = this.toSvgX((minE + maxE) / 2)
    const cy = this.toSvgY((minN + maxN) / 2)
    let svg = ''
    parts.forEach((part, i) => {
      const offset = (i - (parts.length - 1) / 2) * 15
      svg += `<text x="${cx}" y="${cy + offset}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}" opacity="0.5">${escapeXml(part)}</text>`
    })
    return svg
  }

  private drawAdjacentLabels(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''
    let svg = ''
    const parcelCentroid = centroid(this.rotatedPoints)
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
      svg += `<text ${transform} x="${px}" y="${py}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="11" font-weight="bold" fill="${C_BLACK}" opacity="0.45">${escapeXml(lot.id)}</text>`
    }
    return svg
  }

  protected drawNorthArrow(): string {
    const rotDeg = this.data.project.northRotationDeg || 0
    const nx = this.drawingX + mmToPx(8)
    const ny = this.drawingY + mmToPx(10) + 30
    const svg = svgNorthArrow(nx, ny, mmToPx(15)).replace('>N</text>', '>GN</text>')
    if (rotDeg !== 0) {
      return [
        `<g transform="translate(${nx},${ny})">`,
        `<g transform="rotate(${rotDeg})">`,
        `<rect x="-1" y="${-mmToPx(15)}" width="2" height="${mmToPx(15)}" fill="${C_BLACK}"/>`,
        `<polygon points="0,${-mmToPx(15)} -3,${-mmToPx(15) + 5} 3,${-mmToPx(15) + 5}" fill="${C_BLACK}"/>`,
        `</g>`,
        `</g>`,
        `<text x="${nx}" y="${ny + mmToPx(15) + 8}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">${rotDeg.toFixed(1)}°</text>`,
        `<text x="${nx}" y="${ny + mmToPx(15) + 14}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">GN</text>`,
      ].join('')
    }
    return svg
  }

  protected drawScaleBar(): string {
    const scaleBarPx = mmToPx(40)
    const segmentMetres = calcScaleBarMetres(this.scale)
    const x = this.drawingX + mmToPx(8)
    const y = this.drawingY + this.drawingAreaH - mmToPx(15)
    return svgScaleBar(x, y, scaleBarPx, segmentMetres, 4)
  }

  private drawDatumNote(leftPad: number, _panelInnerW: number): string {
    const crs = this.crs
    const note = crs.verified
      ? `Grid: UTM ${crs.zone}${crs.hemi}, ${crs.datum} (${crs.epsgCode})`
      : `Coordinates: UNVERIFIED — project CRS not declared`
    const vertical = `Vertical: ${describeVerticalDatum(crs)}`
    const y = this.margin + mmToPx(25)
    return `<text x="${leftPad}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" font-style="italic" fill="#555">${escapeXml(note)}</text><text x="${leftPad}" y="${y + mmToPx(4)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-style="italic" fill="#555">${escapeXml(vertical)}</text>`
  }

  private drawCoordinateSchedule(leftPad: number, panelInnerW: number): string {
    const crs = this.crs
    const pts = this.data.parcel.boundaryPoints
    const startY = this.margin + mmToPx(42)
    const colW = panelInnerW / 4
    const rowH = mmToPx(3.5)
    const headerH = mmToPx(5)
    const maxRows = Math.min(pts.length, 12)
    const tableH = headerH + maxRows * rowH

    let svg = `<rect x="${leftPad}" y="${startY}" width="${panelInnerW}" height="${tableH}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    // Label from the CRS registry — one path for zone, hemisphere and EPSG;
    // never a hard-coded zone or EPSG family.
    const label = crs.verified
      ? `COORDINATE SCHEDULE (${crs.datum} / UTM ${crs.zone}${crs.hemi} ${crs.epsgCode})`
      : `COORDINATE SCHEDULE (UNVERIFIED — project CRS not declared)`
    svg += `<text x="${leftPad + 2}" y="${startY + mmToPx(3.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${escapeXml(label)}</text>`
    const hY = startY + headerH
    svg += `<line x1="${leftPad}" y1="${hY}" x2="${leftPad + panelInnerW}" y2="${hY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    const headers = ['Point', 'Easting', 'Northing', '']
    headers.forEach((h, i) => {
      svg += `<text x="${leftPad + i * colW + 2}" y="${hY + mmToPx(2.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#555">${h}</text>`
    })
    pts.slice(0, maxRows).forEach((pt, i) => {
      const ry = hY + rowH * (i + 1)
      if (i > 0) svg += `<line x1="${leftPad}" y1="${ry}" x2="${leftPad + panelInnerW}" y2="${ry}" stroke="${C_BLACK}" stroke-width="0.25" opacity="0.3"/>`
      svg += `<text x="${leftPad + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(pt.name)}</text>`
      svg += `<text x="${leftPad + colW + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${pt.easting.toFixed(3)}</text>`
      svg += `<text x="${leftPad + colW * 2 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${pt.northing.toFixed(3)}</text>`
    })
    return svg
  }

  private drawMetricNote(leftPad: number, _rightPad: number): string {
    const y = this.margin + mmToPx(30)
    return `<text x="${leftPad}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" font-style="italic" fill="#555">Distances in metres. Divide by 0.3048 for feet.</text>`
  }

  private drawBearingSchedule(leftPad: number, panelInnerW: number): string {
    const p = this.data.project
    const entries = p.bearingSchedule || []
    const pts = this.data.parcel.boundaryPoints
    const schedule: Array<{ from: string; to: string; bearing: string; distance: number }> = entries.length > 0 ? entries : pts.map((pt, i) => {
      const to = pts[(i + 1) % pts.length]
      const dist = distance(pt.easting, pt.northing, to.easting, to.northing)
      const bearingDeg = bearingFromDelta(to.easting - pt.easting, to.northing - pt.northing)
      return {
        from: pt.name,
        to: to.name,
        bearing: formatBearingDegMinSec(bearingDeg),
        distance: dist,
      }
    })

    const startY = this.margin + mmToPx(42)
    const colW = panelInnerW / 4
    const rowH = mmToPx(3.5)
    const headerH = mmToPx(5)
    const maxRows = 15
    const tableH = headerH + Math.min(schedule.length, maxRows) * rowH

    let svg = `<rect x="${leftPad}" y="${startY}" width="${panelInnerW}" height="${tableH}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${leftPad + 2}" y="${startY + mmToPx(3.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">BEARING SCHEDULE</text>`
    const hY = startY + headerH
    svg += `<line x1="${leftPad}" y1="${hY}" x2="${leftPad + panelInnerW}" y2="${hY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    const headers = ['From', 'To', 'Bearing', 'Dist (m)']
    headers.forEach((h, i) => {
      svg += `<text x="${leftPad + i * colW + 2}" y="${hY + mmToPx(2.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#555">${h}</text>`
    })
    const rows = schedule.slice(0, maxRows)
    rows.forEach((row, i) => {
      const ry = hY + rowH * (i + 1)
      if (i > 0) svg += `<line x1="${leftPad}" y1="${ry}" x2="${leftPad + panelInnerW}" y2="${ry}" stroke="${C_BLACK}" stroke-width="0.25" opacity="0.3"/>`
      svg += `<text x="${leftPad + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.from)}</text>`
      svg += `<text x="${leftPad + colW + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.to)}</text>`
      svg += `<text x="${leftPad + colW * 2 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.bearing)}</text>`
      svg += `<text x="${leftPad + colW * 3 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${row.distance.toFixed(3)}</text>`
    })
    return svg
  }

  private drawRevisionBlock(leftPad: number, panelInnerW: number): string {
    const p = this.data.project
    const revisions = p.revisions || []
    const startY = this.margin + mmToPx(42 + 6 * 4 + 6 + 6)
    const colW = panelInnerW / 4
    const rowH = mmToPx(3.5)
    const headerH = mmToPx(5)
    const maxRows = Math.max(revisions.length, 1)
    const tableH = headerH + maxRows * rowH

    let svg = `<rect x="${leftPad}" y="${startY}" width="${panelInnerW}" height="${tableH}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${leftPad + 2}" y="${startY + mmToPx(3.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">REVISIONS</text>`
    const hY = startY + headerH
    svg += `<line x1="${leftPad}" y1="${hY}" x2="${leftPad + panelInnerW}" y2="${hY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    const headers = ['Rev', 'Date', 'Description', 'By']
    headers.forEach((h, i) => {
      svg += `<text x="${leftPad + i * colW + 2}" y="${hY + mmToPx(2.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#555">${h}</text>`
    })
    const rows = revisions.slice(0, 10)
    if (rows.length === 0) {
      rows.push({ rev: '—', date: '', description: 'No issued revision recorded', by: '' })
    }
    // Column separator lines for better readability
    for (let c = 1; c < 4; c++) {
      const colX = leftPad + colW * c
      svg += `<line x1="${colX}" y1="${hY}" x2="${colX}" y2="${hY + rows.length * rowH}" stroke="${C_BLACK}" stroke-width="0.15" opacity="0.25"/>`
    }
    rows.forEach((row, i) => {
      const ry = hY + rowH * (i + 1)
      if (i > 0) svg += `<line x1="${leftPad}" y1="${ry}" x2="${leftPad + panelInnerW}" y2="${ry}" stroke="${C_BLACK}" stroke-width="0.25" opacity="0.3"/>`
      svg += `<text x="${leftPad + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.rev)}</text>`
      svg += `<text x="${leftPad + colW + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.date)}</text>`
      const desc = row.description.length > 20 ? row.description.slice(0, 18) + '…' : row.description
      svg += `<text x="${leftPad + colW * 2 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(desc)}</text>`
      svg += `<text x="${leftPad + colW * 3 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(row.by)}</text>`
    })
    return svg
  }

  private drawSurveyorCertificate(leftPad: number, _rightPad: number, panelInnerW: number): string {
    const y = this.margin + mmToPx(140);
    return this.drawReviewRecord(leftPad, y, panelInnerW, mmToPx(90));
  }

  protected drawReviewRecord(x: number, y: number, width: number, height: number): string {
    const p = this.data.project;
    const lines = [
      'UNVERIFIED DRAFT — REVIEW REQUIRED',
      'This output does not certify a survey or legal boundary.',
      'Field control, monuments, measurements and tolerances',
      'require independent evidence and professional review.',
      'No authority approval or professional seal is established.',
      `Project: ${p.name}`,
      `Recorded preparer: ${p.surveyor_name || 'Not supplied'}`,
      `Recorded registration: ${p.surveyor_licence || 'Not supplied'} (not verified)`,
      ...(p.iskRegNo ? [`Recorded association registration: ${p.iskRegNo} (not verified)`] : []),
      `Grid: ${this.crs.crsName}`,
      `Vertical: ${describeVerticalDatum(this.crs)}`,
      ...(p.notes ? [p.notes] : []),
    ];
    const wrapped: string[] = [];
    for (const line of lines) {
      let part = '';
      for (const word of line.split(/\s+/)) {
        if ((part + ' ' + word).trim().length > 50 && part) { wrapped.push(part); part = ''; }
        part = (part + ' ' + word).trim();
      }
      if (part) wrapped.push(part);
    }
    return `<g class="draft-review-record"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${C_BLACK}" stroke-width="0.5"/>`
      + wrapped.slice(0, Math.floor(height / mmToPx(4)) - 2).map((line, index) => `<text x="${x + mmToPx(2)}" y="${y + mmToPx(6 + index * 4)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(line)}</text>`).join('') + '</g>';
  }

  private drawStreetInfo(): string {
    const street = this.data.project.street || ''
    if (!street) return ''
    const y1 = this.margin
    const y2 = y1 + mmToPx(4)
    const cx = this.drawingX + this.drawingAreaW / 2
    let svg = `<line x1="${this.drawingX}" y1="${y2}" x2="${this.drawingX + this.drawingAreaW}" y2="${y2}" stroke="${C_BLACK}" stroke-width="2"/>`
    svg += `<line x1="${this.drawingX}" y1="${y1}" x2="${this.drawingX + this.drawingAreaW}" y2="${y1}" stroke="${C_BLACK}" stroke-width="0.8"/>`
    svg += `<text x="${cx}" y="${y1 + mmToPx(2.5)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="12" font-weight="bold" fill="${C_BLACK}">${escapeXml(street.toUpperCase())}</text>`
    return svg
  }

  private drawAdjacentLotPlanRefs(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''
    const parcelCentroid = centroid(this.data.parcel.boundaryPoints)
    let svg = ''
    for (const lot of lots) {
      const pts = lot.boundaryPoints
      if (pts.length < 2) continue
      const [ce, cn] = centroid(pts)
      const px = this.toSvgX(ce)
      const py = this.toSvgY(cn)
      const ref = lot.planReference || ''
      if (!ref) continue
      const isLeft = ce < parcelCentroid[0]
      const isTop = cn > parcelCentroid[1]
      let transform = ''
      if (isLeft) transform = `transform="translate(${px},${py}) rotate(-90)"`
      else if (!isTop) transform = `transform="translate(${px},${py}) rotate(90)"`
      svg += `<text ${transform} x="${px}" y="${py}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}" opacity="0.4">${escapeXml(ref)}</text>`
    }
    return svg
  }

  /**
   * Draw adjacent LR numbers directly on the boundary lines of the subject parcel.
   * Per Kenya cadastral practice, each shared boundary shows the neighbour's
   * LR number on the OUTSIDE of the subject parcel.
   * Source: Survey Act Cap. 299, Form No. 3 & 4 standard practice
   */
  protected drawBoundaryAdjacentLRNumbers(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''

    const parcelPts = this.rotatedPoints
    if (parcelPts.length < 3) return ''

    const [parcelCe, parcelCn] = centroid(parcelPts)
    let svg = ''

    // For each boundary segment of the subject parcel, find matching adjacent lot
    for (let segIdx = 0; segIdx < parcelPts.length; segIdx++) {
      const segFrom = parcelPts[segIdx]
      const segTo = parcelPts[(segIdx + 1) % parcelPts.length]

      // Find which adjacent lot has a segment matching this one (reversed)
      const matchingLot = lots.find(lot => {
        const lpts = lot.boundaryPoints
        for (let j = 0; j < lpts.length; j++) {
          const lpFrom = lpts[j]
          const lpTo = lpts[(j + 1) % lpts.length]
          // Match if the adjacent lot segment runs in reverse (shared boundary)
          const d1 = Math.abs(lpFrom.easting - segTo.easting) + Math.abs(lpFrom.northing - segTo.northing)
          const d2 = Math.abs(lpTo.easting - segFrom.easting) + Math.abs(lpTo.northing - segFrom.northing)
          if (d1 < 0.5 && d2 < 0.5) return true
        }
        return false
      })

      if (!matchingLot || !matchingLot.id) continue

      // Compute midpoint of the boundary segment
      const midE = (segFrom.easting + segTo.easting) / 2
      const midN = (segFrom.northing + segTo.northing) / 2

      // Offset the label AWAY from the parcel centroid (to the outside)
      // Direction: from parcel centroid toward midpoint, then extend further
      const awayDirE = midE - parcelCe
      const awayDirN = midN - parcelCn
      const awayLen = Math.sqrt(awayDirE * awayDirE + awayDirN * awayDirN)
      const offsetDist = 8 / PX_PER_M // 8mm offset in ground units
      const awayNormE = awayLen > 0 ? awayDirE / awayLen : 0
      const awayNormN = awayLen > 0 ? awayDirN / awayLen : 0

      const labelE = midE + awayNormE * offsetDist
      const labelN = midN + awayNormN * offsetDist

      const px = this.toSvgX(labelE)
      const py = this.toSvgY(labelN)

      // Rotate text to align with boundary direction
      const angleDeg = segmentAngle(segFrom.easting, segFrom.northing, segTo.easting, segTo.northing)
      let textAngle = angleDeg
      if (textAngle > 90 || textAngle < -90) textAngle += 180

      const lrLabel = matchingLot.id
      const planRef = matchingLot.planReference || ''
      const label = planRef ? `${lrLabel} (${planRef})` : lrLabel

      svg += `<g transform="translate(${px},${py})">`
      svg += `<g transform="rotate(${textAngle})">`
      svg += `<rect x="${-label.length * 2.8}" y="${-5}" width="${label.length * 5.6}" height="${10}" fill="white" opacity="0.75" stroke="none"/>`
      svg += `<text x="0" y="3" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}" opacity="0.6">${escapeXml(label)}</text>`
      svg += `</g></g>`
    }

    return svg
  }

  private drawFenceOffsets(): string {
    const fenceOffsets = this.data.fenceOffsets
    if (!fenceOffsets || fenceOffsets.length === 0) return ''
    const pts = this.rotatedPoints
    if (pts.length < 2) return ''
    let svg = ''
    const renderedTypes = new Set<string>()

    for (const fo of fenceOffsets) {
      if (fo.segmentIndex < 0 || fo.segmentIndex >= pts.length) continue
      const from = pts[fo.segmentIndex]
      const to = pts[(fo.segmentIndex + 1) % pts.length]
      const fenceType = fo.type as 'fence_on_boundary' | 'chain_link' | 'board_fence' | 'iron_fence' | 'galv_iron' | 'no_fence' | 'end_of_fence' | 'end_of_bf'
      renderedTypes.add(fo.type)

      if (fo.type === 'end_of_fence' || fo.type === 'end_of_bf') {
        const cx = this.toSvgX((from.easting + to.easting) / 2)
        const cy = this.toSvgY((from.northing + to.northing) / 2)
        svg += `<line x1="${cx - 4}" y1="${cy - 4}" x2="${cx + 4}" y2="${cy + 4}" stroke="#666666" stroke-width="0.5"/>`
        svg += `<line x1="${cx + 4}" y1="${cy - 4}" x2="${cx - 4}" y2="${cy + 4}" stroke="#666666" stroke-width="0.5"/>`
        continue
      }

      const fencePts = [
        offsetPointPerpendicular(from, to, fo.offsetMetres),
        offsetPointPerpendicular(to, pts[(fo.segmentIndex + 1) % pts.length], fo.offsetMetres),
      ]
      svg += svgFenceLine(fencePts, this.toSvgX.bind(this), this.toSvgY.bind(this), fenceType)

      if (fo.offsetMetres > 0) {
        const midE = (from.easting + to.easting) / 2
        const midN = (from.northing + to.northing) / 2
        const sx = this.toSvgX(midE)
        const sy = this.toSvgY(midN)
        const offPt = offsetPointPerpendicular(from, to, fo.offsetMetres)
        const ex = this.toSvgX(offPt.easting)
        const ey = this.toSvgY(offPt.northing)
        svg += svgFenceCallout(sx, sy, ex, ey, fo.offsetMetres)
      }
    }

    if (renderedTypes.size > 0) {
      svg += this.drawFenceLegend(Array.from(renderedTypes))
    }
    return svg
  }

  private drawFenceLegend(types: string[]): string {
    const x = this.drawingX + this.drawingAreaW - mmToPx(32)
    const y = this.drawingY + mmToPx(5)
    let svg = `<rect x="${x - mmToPx(1)}" y="${y - mmToPx(3)}" width="${mmToPx(30)}" height="${mmToPx(4 + types.length * 4.5)}" fill="white" fill-opacity="0.9" stroke="${C_BLACK}" stroke-width="0.3"/>`
    svg += `<text x="${x}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">FENCE TYPES</text>`
    types.forEach((t, i) => {
      svg += `<text x="${x}" y="${y + (i + 1) * mmToPx(4)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">${t.replace(/_/g, ' ')}</text>`
    })
    return svg
  }

  private drawRightPanel(): string {
    const leftPad = this.panelX + mmToPx(3)
    const rightPad = this.panelX + this.panelW - mmToPx(3)
    const panelInnerW = this.panelW - mmToPx(6)
    const svgParts: string[] = []
    svgParts.push(this.drawReportHeader(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawDatumNote(leftPad, panelInnerW))
    svgParts.push(this.drawMetricNote(leftPad, rightPad))
    svgParts.push(this.drawPlanInfoBox(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawCoordinateSchedule(leftPad, panelInnerW))
    if (this.data.project.roadCenterLine) {
      svgParts.push(this.drawChainageSchedule(leftPad, panelInnerW))
    }
    svgParts.push(this.drawBearingSchedule(leftPad, panelInnerW))
    svgParts.push(this.drawLegend(leftPad, panelInnerW))
    svgParts.push(this.drawWarningBox(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawRevisionBlock(leftPad, panelInnerW))
    svgParts.push(this.drawSurveyorCertificate(leftPad, rightPad, panelInnerW))
    svgParts.push(this.drawCompanyFooter(leftPad, rightPad))
    return svgParts.join('')
  }

  private drawReportHeader(leftPad: number, rightPad: number, _panelInnerW: number): string {
    const p = this.data.project
    const hasMun = !!p.municipality
    const y = this.margin + mmToPx(4)
    let svg = ''
    const text = (content: string, yPos: number, size: number, weight = 'normal', color = C_BLACK) =>
      `<text x="${leftPad}" y="${yPos}" font-family="helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(content)}</text>`
    const hline = (y1: number) =>
      `<line x1="${leftPad}" y1="${y1}" x2="${rightPad}" y2="${y1}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += text('SURVEYOR\'S REAL PROPERTY REPORT', y, 5)
    svg += text(p.plan_title || 'BOUNDARY IDENTIFICATION PLAN', y + mmToPx(6), 9, 'bold')
    if (p.municipality) svg += text(p.municipality, y + mmToPx(11), 16, 'bold')
    svg += text(`SCALE ${calcScaleLabel(this.scale)}`, y + mmToPx(hasMun ? 18 : 12), 8, 'bold')
    svg += hline(y + mmToPx(hasMun ? 21 : 15))
    svg += text(p.firm_name || '', y + mmToPx(hasMun ? 25 : 19), 8, 'bold')
    if (p.firm_name) {
      svg += text('SURVEYORS ASSOCIATION STAMP', y + mmToPx(hasMun ? 27 : 21), 5, 'normal', '#888')
    }
    svg += text(`\u00A9 ${new Date().getFullYear()}`, y + mmToPx(hasMun ? 28.5 : 22.5), 6)
    svg += text('Survey Act Cap. 299 | Survey Regulations 1994 | RDM 1.3 (2023)', y + mmToPx(hasMun ? 32 : 26), 4.5, 'normal', '#888')
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
      `<text x="${leftPad}" y="${y += mmToPx(4)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">${escapeXml(label)}</text><text x="${leftPad + mmToPx(22)}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${escapeXml(value)}</text>`
    svg += box(y, mmToPx(4))
    svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">PLAN INFORMATION</text>`
    y += mmToPx(4)
    const crs = this.crs
    const info: Array<[string, string]> = [
      ['Title Ref:', p.reference || '\u2014'],
      ['Datum:', crs.verified
        ? `${crs.datum} / UTM Zone ${crs.zone}${crs.hemi} (${crs.epsgCode})`
        : 'UNVERIFIED — project CRS not declared'],
      ['Vertical:', describeVerticalDatum(crs)],
      ['Area:', p.area_sqm ? `${p.area_sqm.toFixed(2)} m\u00B2` : '\u2014'],
      ['Council:', p.municipality || '\u2014'],
      ['Client:', p.client_name || '\u2014'],
      ['Drawing No:', p.drawing_no || 'Not supplied'],
    ]
    for (const [label, value] of info) svg += row(label, value)

    const residual = this.data.traverse?.linearError;
    if (residual !== undefined && Number.isFinite(residual)) {
      svg += row('Leg misclosure:', `${residual.toFixed(4)} m (unverified)`);
    }

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
    svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">LEGEND</text>`
    const items = [
      { label: 'Subject boundary', symbol: `<line x1="0" y1="0" x2="20" y2="0" stroke="${C_BLACK}" stroke-width="2.5"/>` },
      { label: 'Adjacent boundary', symbol: `<line x1="0" y1="0" x2="20" y2="0" stroke="${C_BLACK}" stroke-width="1"/>` },
      { label: 'Found monument', symbol: `<rect x="0" y="-3" width="6" height="6" fill="${C_GREEN}" stroke="${C_BLACK}" stroke-width="0.5"/>` },
      { label: 'Set monument', symbol: `<circle cx="3" cy="0" r="3" fill="none" stroke="${C_GREEN}" stroke-width="1.5"/>` },
      { label: 'Masonry Nail', symbol: `<circle cx="3" cy="0" r="2.5" fill="${C_RED}"/>` },
      { label: 'Iron Pin', symbol: `<circle cx="3" cy="0" r="2" fill="${C_RED}" stroke="${C_BLACK}" stroke-width="0.4"/>` },
      { label: '\u25C7 Indicatory Beacon (Cap. 299 Reg. 45)', symbol: `<polygon points="3,0 6,3 3,6 0,3" fill="none" stroke="${C_GREEN}" stroke-width="1.2" transform="scale(0.6) translate(1.5,1.5)"/>` },
    ]
    for (const item of items) {
      svg += `<g transform="translate(${leftPad}, ${y += mmToPx(4)})">${item.symbol}</g>`
      svg += `<text x="${leftPad + mmToPx(10)}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(item.label)}</text>`
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
      svg += `<text x="${leftPad + mmToPx(2)}" y="${y + mmToPx(3) + i * mmToPx(3)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="${i === 0 ? 'bold' : 'normal'}" fill="${C_BLACK}">${escapeXml(line)}</text>`
    })
    return svg
  }

  private drawCompanyFooter(leftPad: number, rightPad: number): string {
    const hasMun = !!this.data.project.municipality
    const afterCert = this.margin + mmToPx(hasMun ? 40 : 34) + mmToPx(7 * 4 + 4 + 6) + mmToPx(6 * 4 + 6) + mmToPx(12 + 4) + mmToPx(20)
    const y = afterCert
    const p = this.data.project
    let svg = `<line x1="${leftPad}" y1="${y}" x2="${rightPad}" y2="${y}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    if (p.firm_phone) svg += `<text x="${leftPad}" y="${y + mmToPx(3)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(p.firm_phone)}</text>`
    if (p.firm_email) svg += `<text x="${leftPad}" y="${y + mmToPx(6)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(p.firm_email)}</text>`
    if (p.iskRegNo) svg += `<text x="${leftPad}" y="${y + mmToPx(9)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">ISK (Chapter of Land Surveyors) Membership No. ${escapeXml(p.iskRegNo)}</text>`
    return svg
  }

  protected drawSheetIdentity(): string {
    const x = this.margin, y = this.pageH - mmToPx(49)
    const w = this.pageW - this.margin * 2, h = mmToPx(27)
    const nameW = mmToPx(220), cellW = (w - nameW) / 2, rowH = h / 3
    const p = this.data.project
    const text = (tx: number, ty: number, value: string, bold = false) => `<text x="${tx}" y="${ty}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="${bold ? 'bold' : 'normal'}" fill="${C_BLACK}">${escapeXml(value)}</text>`
    let svg = `<g class="sheet-identity"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fafafa" stroke="${C_BLACK}" stroke-width="0.8"/>`
    svg += text(x + mmToPx(3), y + mmToPx(4), 'PROJECT · UNVERIFIED DRAFT')
    // Explicit line wrapping keeps long project names inside their paper cell.
    const chunks = (p.name || 'Untitled project').match(/.{1,90}(?:\s|$)|.{1,90}/g) || []
    chunks.slice(0, 3).forEach((line, i) => { svg += text(x + mmToPx(3), y + mmToPx(9 + i * 4), line.trim(), true) })
    if (p.location) svg += text(x + mmToPx(3), y + mmToPx(23), `Location: ${p.location.length > 90 ? p.location.slice(0, 87) + '…' : p.location}`)
    const reference = p.drawing_no || p.reference || 'Not assigned'
    const cells = [
      `Scale at A3: 1:${this.scale}`, `Working CRS: ${this.crs.verified ? this.crs.epsgCode : 'UNVERIFIED'}`,
      `Grid area: ${this.data.parcel.area_sqm.toFixed(3)} m²`, `Grid perimeter: ${this.data.parcel.perimeter_m.toFixed(3)} m`,
      `Drawing: ${reference}`, `Revision: ${p.version || 'Not assigned'}`,
    ]
    cells.forEach((value, i) => {
      const cx = x + nameW + (i % 2) * cellW, cy = y + Math.floor(i / 2) * rowH
      svg += `<rect x="${cx}" y="${cy}" width="${cellW}" height="${rowH}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
      svg += text(cx + mmToPx(2), cy + mmToPx(5), value.length > 52 ? value.slice(0, 49) + '…' : value)
    })
    return svg + '</g>'
  }

  private drawSheetFooter(): string {
    return this.drawSheetIdentity()
  }

  protected drawLegalReferenceLine(): string {
    const crs = this.crs
    const y = this.pageH - mmToPx(18)
    const coords = crs.verified
      ? `UTM Zone ${crs.zone}${crs.hemi}, ${crs.datum}`
      : 'UNVERIFIED (project CRS not declared)'
    const ref = `UNVERIFIED DRAFT | Coordinates: ${coords} | Field evidence and professional acceptance required`
    return `<text x="${this.margin}" y="${y}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">${escapeXml(ref)}</text>`
  }

  /**
   * Draw road truncation lines on boundary segments that abut roads.
   * Per Kenya cadastral practice, road boundaries are shown with short
   * perpendicular tick marks (truncation lines) at regular intervals along
   * the boundary edge, indicating the road reserve extent.
   * Now includes road reserve width annotation labels.
   * Source: Survey Act Cap. 299, Form No. 3 & 4 — Road Truncation Lines
   */
  protected drawRoadTruncationLines(): string {
    const lots = this.data.adjacentLots
    if (!lots || lots.length === 0) return ''

    const parcelPts = this.rotatedPoints
    if (parcelPts.length < 3) return ''

    let svg = ''
    const [parcelCe, parcelCn] = centroid(parcelPts)

    // Compute road reserve width from project road_class
    const roadWidth = this.data.project.roadReserveWidthMetres ?? 0

    // For each boundary segment, check if the adjacent lot is a road
    for (let segIdx = 0; segIdx < parcelPts.length; segIdx++) {
      const segFrom = parcelPts[segIdx]
      const segTo = parcelPts[(segIdx + 1) % parcelPts.length]

      // Find adjacent lot for this segment
      const matchingLot = lots.find(lot => {
        const lpts = lot.boundaryPoints
        for (let j = 0; j < lpts.length; j++) {
          const lpFrom = lpts[j]
          const lpTo = lpts[(j + 1) % lpts.length]
          const d1 = Math.abs(lpFrom.easting - segTo.easting) + Math.abs(lpFrom.northing - segTo.northing)
          const d2 = Math.abs(lpTo.easting - segFrom.easting) + Math.abs(lpTo.northing - segFrom.northing)
          if (d1 < 0.5 && d2 < 0.5) return true
        }
        return false
      })

      // Road-edge symbology requires the explicit adjoining-boundary flag.
      const isRoad = matchingLot?.roadReserveEdge === true

      if (!isRoad) continue

      // Draw perpendicular tick marks along this boundary segment
      const dE = segTo.easting - segFrom.easting
      const dN = segTo.northing - segFrom.northing
      const segLen = Math.sqrt(dE * dE + dN * dN)
      if (segLen < 0.001) continue

      // Unit perpendicular vector (pointing outward from parcel)
      let perpE = -dN / segLen
      let perpN = dE / segLen
      // Ensure perpendicular points AWAY from parcel centroid
      const midE = (segFrom.easting + segTo.easting) / 2
      const midN = (segFrom.northing + segTo.northing) / 2
      const toMidE = midE - parcelCe
      const toMidN = midN - parcelCn
      if (perpE * toMidE + perpN * toMidN < 0) {
        perpE = -perpE
        perpN = -perpN
      }

      const tickSpacing = mmToPx(5) * this.mPerPx // 5mm spacing in ground units
      const tickLength = mmToPx(3) * this.mPerPx   // 3mm tick length in ground units
      const numTicks = Math.max(2, Math.floor(segLen / tickSpacing))

      for (let t = 1; t < numTicks; t++) {
        const frac = t / numTicks
        const tickBaseE = segFrom.easting + dE * frac
        const tickBaseN = segFrom.northing + dN * frac
        const tickEndE = tickBaseE + perpE * tickLength
        const tickEndN = tickBaseN + perpN * tickLength

        const x1 = this.toSvgX(tickBaseE)
        const y1 = this.toSvgY(tickBaseN)
        const x2 = this.toSvgX(tickEndE)
        const y2 = this.toSvgY(tickEndN)

        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C_BLACK}" stroke-width="0.5" opacity="0.7"/>`
      }

      // Road width annotation label along the road segment
      if (roadWidth > 0) {
        const labelOffset = tickLength * 1.5 // Place label beyond tick ends
        const labelE = midE + perpE * labelOffset
        const labelN = midN + perpN * labelOffset
        const lx = this.toSvgX(labelE)
        const ly = this.toSvgY(labelN)
        const widthLabel = `${roadWidth.toFixed(2)}m`

        // Rotate label to align with road segment direction
        const angleDeg = segmentAngle(segFrom.easting, segFrom.northing, segTo.easting, segTo.northing)
        let textAngle = angleDeg
        if (textAngle > 90 || textAngle < -90) textAngle += 180

        svg += `<g transform="translate(${lx},${ly})">`
        svg += `<g transform="rotate(${textAngle})">`
        svg += `<rect x="${-widthLabel.length * 2.5}" y="${-4}" width="${widthLabel.length * 5}" height="8" fill="white" opacity="0.8" stroke="none"/>`
        svg += `<text x="0" y="2" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}" opacity="0.7">${widthLabel}</text>`
        svg += `</g></g>`
      }
    }

    return svg
  }

  /**
   * Draw print verification hash at the bottom of the plan.
   * Generates a deterministic SHA-256 verification code from the plan's key
   * data (coordinates, area, LR number, scale, date, surveyor licence, revisions)
   * and displays it alongside a generation timestamp. This fingerprint covers
   * selected inputs only; it is neither a document signature nor field or
   * authority verification.
   */
  protected async drawPrintVerification(): Promise<string> {
    const pts = this.rotatedPoints
    const p = this.data.project

    // Build a verification string from key plan data
    const coordString = pts.map(pt => `${pt.easting.toFixed(4)},${pt.northing.toFixed(4)}`).join('|')
    const areaVal = this.data.parcel.area_sqm.toFixed(4)
    const lrNum = p.lrNumber || p.parcel_id || p.name || 'UNKNOWN'
    const scaleVal = this.scale
    const dateStr = new Date().toISOString().split('T')[0]
    const surveyorLicence = p.surveyor_licence || ''
    const revisionsCount = (p.revisions || []).length

    // Deterministic verification code using SHA-256 (cryptographic hash)
    const rawString = `${coordString}|${areaVal}|${lrNum}|${scaleVal}|${dateStr}|${surveyorLicence}|${revisionsCount}`
    const verCode = (await sha256Hex(rawString)).toUpperCase().slice(0, 16)

    const y = this.pageH - mmToPx(14.5)
    const cx = this.pageW / 2

    let svg = ''
    svg += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#999">Content fingerprint: ${verCode} | Generated: ${escapeXml(dateStr)} | Scale: 1:${scaleVal}</text>`
    svg += `<text x="${cx}" y="${y + mmToPx(3.5)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">Fingerprint identifies selected plan data only; not a signature, field verification or authority approval.</text>`

    return svg
  }

  protected drawWatermark(): string {
    const cx = this.drawingX + this.drawingAreaW / 2
    const cy = this.drawingY + this.drawingAreaH / 2
    return [
      `<g transform="translate(${cx},${cy}) rotate(-45)">`,
      `<text x="0" y="-40" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="48" font-weight="bold" fill="#000" opacity="0.12">UNVERIFIED DRAFT</text>`,
      `<text x="0" y="10" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="18" fill="#000" opacity="0.10">Independent field and professional review required</text>`,
      `<text x="0" y="35" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="18" fill="#000" opacity="0.04">metardu.space</text>`,
      `</g>`,
    ].join('')
  }

  protected validateBoundary(): void {
    const points = this.data.parcel.boundaryPoints;
    if (points.length < 3 || points.some(point => !point.name?.trim() || !Number.isFinite(point.easting) || !Number.isFinite(point.northing))
      || new Set(points.map(point => point.name)).size !== points.length || coordinateArea(points).areaSqm <= 0 || hasCrossingBoundary(points)) {
      throw new Error('A complete ordered boundary with at least three distinct finite stations and positive area is required.');
    }
    if (!Number.isFinite(this.scale) || this.scale <= 0 || !Number.isFinite(this.opts.scale) || this.opts.scale < 0) throw new Error('The drawing scale must be positive and finite.');
  }

  async render(): Promise<string> {
    this.validateBoundary();
    const totalSheets = parseInt(this.data.project.totalSheets || '1', 10)
    if (totalSheets > 1) return this.renderMultiSheet()

    const layers: string[] = []
    layers.push(this.drawBackground())
    layers.push(this.drawSheetBorder())
    if (this.opts.includePanel) layers.push(this.drawPanelDivider())
    if (this.opts.includeGrid) layers.push(this.drawGrid())
    layers.push(this.drawLotFill())
    layers.push(this.drawWatermark())
    layers.push(this.drawAdjacentLots())
    layers.push(this.drawStreetInfo())
    layers.push(this.drawRoadTruncationLines())
    layers.push(this.drawBoundary())
    layers.push(this.drawBoundaryLabels())
    layers.push(this.drawBoundaryAdjacentLRNumbers())
    layers.push(this.drawMonuments())
    layers.push(this.drawAdjacentLotPlanRefs())
    layers.push(this.drawFenceOffsets())
    layers.push(this.drawLotNumber())
    layers.push(this.drawPinLabel())
    layers.push(this.drawPartLabels())
    layers.push(this.drawAreaLabel())
    layers.push(this.drawAdjacentLabels())
    layers.push(this.drawBuildings())
    layers.push(this.drawRoadReserveBoundaries())
    layers.push(this.drawChainageMarkers())
    layers.push(this.drawNorthArrow())
    layers.push(this.drawScaleBar())
    if (this.opts.includePanel) layers.push(this.drawRightPanel())
    layers.push(this.drawSheetFooter())
    layers.push(await this.drawPrintVerification())
    layers.push(this.drawLegalReferenceLine())
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.pageW} ${this.pageH}" width="${this.pageW}" height="${this.pageH}" style="font-family: 'JetBrains Mono', 'Courier New', monospace;">${layers.join('\n')}</svg>`
  }

  private async renderMultiSheet(): Promise<string> {
    const totalSheets = parseInt(this.data.project.totalSheets || '1', 10)
    if (totalSheets <= 1) return this.render()

    const cols = Math.ceil(Math.sqrt(totalSheets))
    const rows = Math.ceil(totalSheets / cols)
    const sheetW = this.pageW * cols
    const sheetH = this.pageH * rows

    const sheets: string[] = []
    for (let i = 0; i < totalSheets; i++) {
      const sheetCol = i % cols
      const sheetRow = Math.floor(i / cols)
      const originX = sheetCol * this.pageW
      const originY = sheetRow * this.pageH
      const sheetNum = i + 1
      const label = `Sheet ${sheetNum} of ${totalSheets}`

      const layers: string[] = []
      layers.push(`<g transform="translate(${originX},${originY})">`)
      layers.push(this.drawBackground())
      layers.push(this.drawSheetBorder())
      if (this.opts.includePanel) layers.push(this.drawPanelDivider())
      if (this.opts.includeGrid) layers.push(this.drawGrid())
      layers.push(this.drawLotFill())
      layers.push(this.drawWatermark())
      layers.push(this.drawAdjacentLots())
      layers.push(this.drawStreetInfo())
      layers.push(this.drawRoadTruncationLines())
      layers.push(this.drawBoundary())
      layers.push(this.drawBoundaryLabels())
      layers.push(this.drawBoundaryAdjacentLRNumbers())
      layers.push(this.drawMonuments())
      layers.push(this.drawAdjacentLotPlanRefs())
      layers.push(this.drawFenceOffsets())
      layers.push(this.drawLotNumber())
      layers.push(this.drawPinLabel())
      layers.push(this.drawPartLabels())
      layers.push(this.drawAreaLabel())
      layers.push(this.drawAdjacentLabels())
      layers.push(this.drawBuildings())
      layers.push(this.drawRoadReserveBoundaries())
      layers.push(this.drawNorthArrow())
      layers.push(this.drawScaleBar())
        if (this.opts.includePanel) layers.push(this.drawRightPanel())
      layers.push(this.drawSheetFooter())
      layers.push(await this.drawPrintVerification())
      layers.push(this.drawLegalReferenceLine())
      layers.push(`<text x="${this.drawingX + this.drawingAreaW / 2}" y="${this.margin + mmToPx(3)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">${escapeXml(label)}</text>`)
      layers.push('</g>')
      sheets.push(layers.join('\n'))
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}" style="font-family: 'JetBrains Mono', 'Courier New', monospace; background: white;">${sheets.join('\n')}</svg>`
  }

  getScale(): number { return this.scale }

  exportToCSV(): string {
    return generateBearingScheduleCSV(this.data)
  }

  private drawRoadReserveBoundaries(): string {
    const roadClass = this.data.project.road_class
    if (!roadClass) return ''
    const pts = this.rotatedPoints
    if (pts.length < 2) return ''
    const reserveWidth = getRoadReserveWidth(roadClass, true)
    if (reserveWidth <= 0) return ''

    const roadCenter = this.data.project.roadCenterLine
    if (!roadCenter || roadCenter.length < 2) return ''

    const leftPts: Array<{ easting: number; northing: number }> = []
    const rightPts: Array<{ easting: number; northing: number }> = []

    for (let i = 0; i < roadCenter.length; i++) {
      const from = roadCenter[i]
      const to = roadCenter[(i + 1) % roadCenter.length]
      const dx = to.easting - from.easting
      const dy = to.northing - from.northing
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len === 0) continue
      const halfWidth = reserveWidth / 2
      const perpX = -dy / len * halfWidth
      const perpY = dx / len * halfWidth
      leftPts.push({ easting: from.easting + perpX, northing: from.northing + perpY })
      rightPts.push({ easting: from.easting - perpX, northing: from.northing - perpY })
    }

    if (leftPts.length < 2) return ''

    let svg = polylineFromPoints(leftPts, this.toSvgX.bind(this), this.toSvgY.bind(this), true)
      .replace(`stroke="${C_BLACK}"`, `stroke="${C_BLACK}" stroke-width="0.5" stroke-dasharray="8,4"`)
    svg += polylineFromPoints(rightPts, this.toSvgX.bind(this), this.toSvgY.bind(this), true)
      .replace(`stroke="${C_BLACK}"`, `stroke="${C_BLACK}" stroke-width="0.5" stroke-dasharray="8,4"`)

    const leftCentroid = centroid(leftPts)
    const rightCentroid = centroid(rightPts)
    const label = `ROAD RESERVE BOUNDARY (RDM 1.3 TABLE 2-3)`
    svg += `<text x="${this.toSvgX(leftCentroid[0])}" y="${this.toSvgY(leftCentroid[1])}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" transform="rotate(-45,${this.toSvgX(leftCentroid[0])},${this.toSvgY(leftCentroid[1])})">${escapeXml(label)}</text>`
    svg += `<text x="${this.toSvgX(rightCentroid[0])}" y="${this.toSvgY(rightCentroid[1])}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" transform="rotate(-45,${this.toSvgX(rightCentroid[0])},${this.toSvgY(rightCentroid[1])})">${escapeXml(label)}</text>`

    return svg
  }

  private drawChainageMarkers(): string {
    const roadCenter = this.data.project.roadCenterLine
    if (!roadCenter || roadCenter.length < 2) return ''

    const startCh = this.data.project.startChainage ?? 0
    const intervalM = 100

    const chainagePoints = computeChainageAlongAlignment(startCh, roadCenter)
    let svg = ''

    for (let i = 0; i < chainagePoints.length - 1; i++) {
      const from = roadCenter[i]
      const to = roadCenter[i + 1]
      const ch0 = chainagePoints[i]
      const ch1 = chainagePoints[i + 1]
      const dx = to.easting - from.easting
      const dy = to.northing - from.northing
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (segLen === 0) continue

      const steps = Math.floor(segLen / intervalM)
      for (let j = 1; j <= steps; j++) {
        const t = j / steps
        const x = from.easting + dx * t
        const y = from.northing + dy * t
        const chainage = ch0.chainage + (ch1.chainage - ch0.chainage) * t

        const perpX = -dy / segLen
        const perpY = dx / segLen
        const tickLenM = 2
        const x1 = this.toSvgX(x - perpX * tickLenM)
        const y1 = this.toSvgY(y - perpY * tickLenM)
        const x2 = this.toSvgX(x + perpX * tickLenM)
        const y2 = this.toSvgY(y + perpY * tickLenM)
        const svgX = this.toSvgX(x)
        const svgY = this.toSvgY(y)

        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C_BLACK}" stroke-width="0.5"/>`
        svg += `<text x="${svgX}" y="${svgY - 1.5}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" font-weight="bold">${formatChainage(chainage)}</text>`
      }
    }

    return svg
  }

  private drawChainageSchedule(leftPad: number, panelInnerW: number): string {
    const roadCenter = this.data.project.roadCenterLine
    if (!roadCenter || roadCenter.length < 2) return ''

    const startCh = this.data.project.startChainage ?? 0
    const chainagePts = computeChainageAlongAlignment(startCh, roadCenter)
    const roadName = this.data.project.roadName || 'Road'

    const colW = panelInnerW / 4
    const rowH = mmToPx(3.5)
    const headerH = mmToPx(5)
    const maxRows = Math.min(chainagePts.length, 20)
    const startY = this.margin + mmToPx(8)
    const tableH = headerH + maxRows * rowH

    let svg = `<rect x="${leftPad}" y="${startY}" width="${panelInnerW}" height="${tableH}" fill="none" stroke="${C_BLACK}" stroke-width="0.5"/>`
    svg += `<text x="${leftPad + 2}" y="${startY + mmToPx(3.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="${C_BLACK}">CHAINAGE SCHEDULE — ${escapeXml(roadName)}</text>`

    const hY = startY + headerH
    svg += `<line x1="${leftPad}" y1="${hY}" x2="${leftPad + panelInnerW}" y2="${hY}" stroke="${C_BLACK}" stroke-width="0.5"/>`
    const headers = ['Chainage', 'Easting', 'Northing', 'Label']
    headers.forEach((h, i) => {
      svg += `<text x="${leftPad + i * colW + 2}" y="${hY + mmToPx(2.5)}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#555">${h}</text>`
    })

    chainagePts.slice(0, maxRows).forEach((pt, i) => {
      const ry = hY + rowH * (i + 1)
      if (i > 0) svg += `<line x1="${leftPad}" y1="${ry}" x2="${leftPad + panelInnerW}" y2="${ry}" stroke="${C_BLACK}" stroke-width="0.25" opacity="0.3"/>`
      svg += `<text x="${leftPad + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" font-weight="bold">${formatChainage(pt.chainage)}</text>`
      svg += `<text x="${leftPad + colW + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${pt.easting.toFixed(3)}</text>`
      svg += `<text x="${leftPad + colW * 2 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${pt.northing.toFixed(3)}</text>`
      svg += `<text x="${leftPad + colW * 3 + 2}" y="${ry + mmToPx(2)}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555">km+m</text>`
    })

    svg += `<text x="${leftPad}" y="${startY + tableH + 8}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="#555" font-style="italic">Chainage format: km+m (RDM 1.1 §5.6.4) · Interval: 100m markers</text>`
    return svg
  }
}
