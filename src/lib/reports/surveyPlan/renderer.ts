import { bundleSurveySheets, paginateScheduleTables, type ScheduleTable } from './schedulePages'
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
  centroid, boundingBox, calcScaleBarMetres,
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
  C_BLACK, C_GRID_MINOR, C_GRID_MAJOR,
  C_LOT_FILL,
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
  protected continuationSchedules: string[] = []
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
    
    // Keep the 50 m site grid, increasing its display interval for large extents.
    // Iterate integer indices so rounded coordinate additions cannot stall a loop.
    const targetStep = Math.max(50, Math.max(bb.rangeE, bb.rangeN) / 20)
    const magnitude = 10 ** Math.floor(Math.log10(targetStep))
    const gridStep = [1, 2, 5, 10].map(factor => factor * magnitude).find(step => step >= targetStep)
    if (!gridStep || !Number.isFinite(gridStep)) throw new RangeError('Plan extent cannot be represented by the display grid')
    const gridMinE = Math.floor(bb.minE / gridStep)
    const gridMaxE = Math.ceil(bb.maxE / gridStep)
    const gridMinN = Math.floor(bb.minN / gridStep)
    const gridMaxN = Math.ceil(bb.maxN / gridStep)
    if (![gridMinE, gridMaxE, gridMinN, gridMaxN].every(Number.isSafeInteger) || gridMaxE - gridMinE > 22 || gridMaxN - gridMinN > 22) {
      throw new RangeError('Plan extent cannot be represented by the display grid')
    }
    
    let svg = ''
    
    // Vertical lines (Easting)
    for (let index = gridMinE; index <= gridMaxE; index++) {
      const e = index * gridStep
      const x = this.toSvgX(e)
      if (x < this.drawingX + mmToPx(14) || x > this.panelX - mmToPx(5)) continue
      const y1 = this.drawingY + mmToPx(3)
      const y2 = this.drawingY + this.drawingAreaH - mmToPx(3)
      const isMajor = index % 2 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      
      svg += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      
      if (isMajor && this.rotatedPoints.length <= 12) {
        const ly = this.drawingY + this.drawingAreaH - mmToPx(1)
        svg += `<text x="${x}" y="${ly}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}" opacity="0.6">${e}</text>`
      }
    }
    
    // Horizontal lines (Northing)
    for (let index = gridMinN; index <= gridMaxN; index++) {
      const n = index * gridStep
      const y = this.toSvgY(n)
      if (y < this.drawingY + mmToPx(4) || y > this.drawingY + this.drawingAreaH - mmToPx(4)) continue
      const x1 = this.drawingX + mmToPx(3)
      const x2 = this.panelX - mmToPx(3)
      const isMajor = index % 2 === 0
      const stroke = isMajor ? C_GRID_MAJOR : C_GRID_MINOR
      const width = isMajor ? 0.8 : 0.4
      const dash = isMajor ? 'none' : '2,4'
      
      svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.7"/>`
      
      if (isMajor && this.rotatedPoints.length <= 12) {
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
    if (this.rotatedPoints.length > 12) return `<text x="${this.drawingX + mmToPx(25)}" y="${mmToPx(25)}" font-family="helvetica, Arial, sans-serif" font-size="10">Dense boundary: numbered station key and complete leg dimensions are in the schedules.</text>`
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
    const dense = rawPts.length > 12
    const labelPositions = new Map<number, { x: number; y: number; anchor: string }>()
    if (dense) {
      const middle = (Math.min(...rotPts.map(point => point.easting)) + Math.max(...rotPts.map(point => point.easting))) / 2
      for (const left of [true, false]) {
        const side = rotPts.map((point, index) => ({ point, index })).filter(({ point }) => (point.easting <= middle) === left).sort((a, b) => b.point.northing - a.point.northing)
        const available = this.drawingAreaH - mmToPx(65)
        if (side.length > 1 && available / (side.length - 1) < 12) throw new Error('The numbered station leaders require an enlarged or tiled drawing at this density. The source observations are unchanged.')
        side.forEach(({ index }, row) => labelPositions.set(index, { x: left ? this.drawingX + mmToPx(16) : this.panelX - mmToPx(16), y: this.drawingY + mmToPx(35) + row * available / Math.max(1, side.length - 1), anchor: left ? 'end' : 'start' }))
      }
    }
    for (let i = 0; i < rawPts.length; i++) {
      const rawPt = rawPts[i]
      const rotPt = rotPts[i]
      const cp = this.data.controlPoints.find(
        c => c.name === rawPt.name || (Math.abs(c.easting - rawPt.easting) < 0.01 && Math.abs(c.northing - rawPt.northing) < 0.01)
      )
      const cx = this.toSvgX(rotPt.easting)
      const cy = this.toSvgY(rotPt.northing)
      svg += svgCornerDot(cx, cy)
      const label = labelPositions.get(i)
      if (label) {
        svg += `<line x1="${cx}" y1="${cy}" x2="${label.x}" y2="${label.y - 3}" stroke="#888" stroke-width="0.3"/>`
        svg += `<text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">#${i + 1}</text>`
      } else svg += `<text x="${cx + 7}" y="${cy - 7}" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${escapeXml(rawPt.name)}</text>`
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
    const [ce, cn] = centroid(pts)
    const ax = this.toSvgX(ce), ay = this.toSvgY(cn) + mmToPx(6)
    const area = this.data.parcel.area_sqm
    const ha = area / 10000
    return [
      `<text x="${ax}" y="${ay}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="11" fill="${C_BLACK}">${area.toFixed(2)} m\u00B2</text>`,
      `<text x="${ax}" y="${ay + mmToPx(4)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10" fill="${C_BLACK}">${ha.toFixed(4)} ha</text>`,
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

  protected drawRightPanel(coordinates: ScheduleTable | false | undefined = undefined, form4 = false): string {
    const x = this.panelX + mmToPx(3), width = this.panelW - mmToPx(6)
    const bottom = this.pageH - mmToPx(54)
    let y = this.margin
    let svg = '<g class="standard-plan-panel">'
    const text = (tx: number, ty: number, content: string, bold = false) => `<text x="${tx}" y="${ty}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="${bold ? 'bold' : 'normal'}" fill="${C_BLACK}">${escapeXml(content)}</text>`
    const tables: ScheduleTable[] = []
    const section = (title: string, headings: string[], rows: string[][], fractions: number[]) => { tables.push({ title, headings, rows, fractions }) }
    const p = this.data.project, crs = this.crs, points = this.data.parcel.boundaryPoints
    svg += text(x, y + mmToPx(4), 'UNVERIFIED DRAFT PLAN', true)
    svg += text(x, y + mmToPx(9), `Scale 1:${this.scale} at A3 · Distances in metres`)
    svg += text(x, y + mmToPx(14), form4 ? 'Form No. 4 — review layout' : 'Metres ÷ 0.3048 = feet')
    y += mmToPx(19)
    const info: string[][] = [
      ['Working grid', crs.verified ? `${crs.datum} / UTM ${crs.zone}${crs.hemi} (${crs.epsgCode})` : 'UNVERIFIED — project CRS not declared'],
      ['Vertical', describeVerticalDatum(crs)],
      ...(p.reference ? [['Title reference', p.reference]] : []),
      ...(p.client_name ? [['Client', p.client_name]] : []),
      ...(p.municipality ? [['Council', p.municipality]] : []),
      ...(p.firm_name ? [['Recorded firm', p.firm_name]] : []),
      ...(p.firm_phone ? [['Firm phone', p.firm_phone]] : []),
      ...(p.firm_email ? [['Firm email', p.firm_email]] : []),
      ...(form4 ? [
        ['Registration District', p.registrationDistrict || 'Not supplied'], ['Locality', p.locality || 'Not supplied'],
        ...(['lrNumber', 'folioNumber', 'registerNumber', 'firNumber', 'refMapRIM', 'registrationBlock', 'computationsNo', 'fieldBookNo', 'dateReceived', 'fileReference'] as const)
          .filter(key => Boolean(p[key])).map(key => [key, p[key] as string]),
      ] : []),
    ]
    section('PLAN INFORMATION', [], info, [0.28, 0.72])
    if (points.length > 12) tables.push({ title: 'DIAGRAM STATION KEY', headings: ['Label', 'Original station'], rows: points.map((point, index) => [`#${index + 1}`, point.name]), fractions: [0.15, 0.85], minWidth: mmToPx(200) })
    if (coordinates) tables.push(coordinates)
    else if (coordinates !== false) section('COORDINATE SCHEDULE', ['Station', 'Easting', 'Northing'], points.map(point => [point.name, point.easting.toFixed(3), point.northing.toFixed(3)]), [0.26, 0.37, 0.37])
    const schedule = p.bearingSchedule?.length ? p.bearingSchedule : points.map((point, index) => {
      const next = points[(index + 1) % points.length]
      return { from: point.name, to: next.name, bearing: formatBearingDegMinSec(bearingFromDelta(next.easting - point.easting, next.northing - point.northing)), distance: distance(point.easting, point.northing, next.easting, next.northing) }
    })
    section('BEARING SCHEDULE', ['From', 'To', 'Bearing', 'Dist (m)'], schedule.map(row => [row.from, row.to, row.bearing, row.distance.toFixed(3)]), [0.18, 0.18, 0.40, 0.24])
    const recordedTypes = Array.from(new Set(this.data.controlPoints.map(point => point.monumentType)))
    section('LEGEND / WARNING', [], [['Subject boundary', 'Continuous parcel outline'], ['Station circle', 'Coordinate position; monument evidence requires review'],
      ...recordedTypes.map(type => [`Recorded ${type.replaceAll('_', ' ')}`, 'Source classification; independent field verification required']),
      ['Field evidence', 'Verify control, monuments and dimensions on site.']], [0.35, 0.65])
    const revisions = p.revisions || []
    section('REVISIONS', revisions.length ? ['Rev', 'Date', 'Description', 'By'] : [], revisions.length ? revisions.map(row => [row.rev, row.date, row.description, row.by]) : [['No issued revision recorded']], revisions.length ? [0.12, 0.23, 0.45, 0.20] : [1])
    if (p.roadCenterLine?.length) {
      const chainage = computeChainageAlongAlignment(p.startChainage ?? 0, p.roadCenterLine)
      section('CHAINAGE SCHEDULE', ['Chainage', 'Easting', 'Northing'], chainage.map(point => [formatChainage(point.chainage), point.easting.toFixed(3), point.northing.toFixed(3)]), [0.26, 0.37, 0.37])
    }
    section('UNVERIFIED DRAFT — REVIEW REQUIRED', [], [
      ['This output does not certify a survey or legal boundary.'],
      ['Field control, monuments, measurements and tolerances require independent evidence and professional review.'],
      ['No authority approval or professional seal is established.'],
      [`Recorded preparer: ${p.surveyor_name || 'Not supplied'}`],
      [`Recorded registration: ${p.surveyor_licence || 'Not supplied'} (not verified)`],
      ...(p.iskRegNo ? [[`Recorded association registration: ${p.iskRegNo} (not verified)`]] : []),
      ...(p.notes ? [[p.notes]] : []),
    ], [1])
    const pages = paginateScheduleTables(tables, { x, top: y, bottom, width }, { x: this.margin, top: mmToPx(22), bottom, width: this.pageW - this.margin * 2 })
    this.continuationSchedules = pages.slice(1)
    return svg + pages[0] + '</g>'
  }

  protected async finishSheets(first: string): Promise<string> {
    const fingerprint = await this.drawPrintVerification()
    const continuation = this.continuationSchedules.map(page => [this.drawBackground(), this.drawSheetBorder(), page, this.drawSheetIdentity(true), fingerprint, this.drawLegalReferenceLine()].join(''))
    return bundleSurveySheets([first, ...continuation], this.pageW, this.pageH)
  }

  protected drawSheetIdentity(scheduleOnly = false): string {
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
      `${scheduleOnly ? 'Diagram on sheet 1' : 'Scale at A3'}: 1:${this.scale}`, `Working CRS: ${this.crs.verified ? this.crs.epsgCode : 'UNVERIFIED'}`,
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
    this.continuationSchedules = []

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
    return this.finishSheets(layers.join('\n'))
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

}
