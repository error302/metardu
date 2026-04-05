import Drawing from 'dxf-writer'
import type { SubmissionPackage } from '../types'

export function generateFormNo4DXF(pkg: SubmissionPackage): string {
  const drawing = new Drawing()

  drawing.addLayer('BOUNDARY', 7, 'CONTINUOUS')
  drawing.addLayer('BEACONS', 2, 'CONTINUOUS')
  drawing.addLayer('ANNOTATIONS', 3, 'CONTINUOUS')
  drawing.addLayer('TITLEBLOCK', 7, 'CONTINUOUS')
  drawing.addLayer('NORTHARROW', 7, 'CONTINUOUS')
  drawing.addLayer('SCALEBAR', 7, 'CONTINUOUS')
  drawing.addLayer('GRID', 8, 'DASHED')

  drawing.setActiveLayer('BOUNDARY')

  const points = pkg.traverse.points
  if (points.length >= 3) {
    for (let i = 0; i < points.length; i++) {
      const from = points[i]
      const to = points[(i + 1) % points.length]
      drawing.drawLine(
        from.adjustedEasting,
        from.adjustedNorthing,
        to.adjustedEasting,
        to.adjustedNorthing
      )
    }
  }

  drawing.setActiveLayer('BEACONS')
  points.forEach(pt => {
    const r = 0.5
    drawing.drawCircle(pt.adjustedEasting, pt.adjustedNorthing, r)
    drawing.drawLine(
      pt.adjustedEasting - r, pt.adjustedNorthing,
      pt.adjustedEasting + r, pt.adjustedNorthing
    )
    drawing.drawLine(
      pt.adjustedEasting, pt.adjustedNorthing - r,
      pt.adjustedEasting, pt.adjustedNorthing + r
    )
    drawing.drawText(
      pt.adjustedEasting + r + 0.3,
      pt.adjustedNorthing + 0.3,
      0.8,
      0,
      pt.pointName
    )
  })

  drawing.setActiveLayer('ANNOTATIONS')
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const midE = (from.adjustedEasting + to.adjustedEasting) / 2
    const midN = (from.adjustedNorthing + to.adjustedNorthing) / 2

    const bearingDeg = from.observedBearing
    const bearingStr = formatBearing(bearingDeg)
    const distStr = `${from.observedDistance.toFixed(3)}m`

    drawing.drawText(midE, midN + 0.5, 0.6, 0, bearingStr)
    drawing.drawText(midE, midN - 0.5, 0.6, 0, distStr)
  }

  drawing.setActiveLayer('TITLEBLOCK')
  addTitleBlock(drawing, pkg)

  drawing.setActiveLayer('NORTHARROW')
  addNorthArrow(drawing, pkg)

  return drawing.toDxfString()
}

function formatBearing(decimal: number): string {
  const deg = Math.floor(decimal)
  const minDecimal = (decimal - deg) * 60
  const min = Math.floor(minDecimal)
  const sec = Math.round((minDecimal - min) * 60)
  return `${deg}°${min}'${sec}"`
}

function addTitleBlock(drawing: Drawing, pkg: SubmissionPackage): void {
  const tbX = 0
  const tbY = -30

  drawing.drawText(tbX + 2, tbY - 5, 2, 0, `FORM NO. 4 — SURVEY PLAN`)
  drawing.drawText(tbX + 2, tbY - 10, 1.5, 0, `LR No: ${pkg.parcel.lrNumber}`)
  drawing.drawText(tbX + 2, tbY - 14, 1.5, 0, `County: ${pkg.parcel.county}`)
  drawing.drawText(tbX + 2, tbY - 18, 1.5, 0, `Area: ${(pkg.parcel.areaM2 / 10000).toFixed(4)} Ha`)
  drawing.drawText(tbX + 2, tbY - 22, 1.5, 0, `Surveyor: ${pkg.surveyor.fullName} (${pkg.surveyor.registrationNumber})`)
  drawing.drawText(tbX + 2, tbY - 26, 1.5, 0, `Date: ${new Date(pkg.generatedAt).toLocaleDateString('en-KE')}`)
  drawing.drawText(tbX + 2, tbY - 30, 1.5, 0, `Submission Ref: ${pkg.submissionRef}`)
  drawing.drawText(tbX + 2, tbY - 34, 1.2, 0, `Coordinate System: Arc 1960 / UTM Zone 37S`)
}

function addNorthArrow(drawing: Drawing, _pkg: SubmissionPackage): void {
  const naX = 50
  const naY = 50
  drawing.drawLine(naX, naY, naX, naY + 8)
  drawing.drawText(naX - 1, naY + 9, 2, 0, 'N')
}
