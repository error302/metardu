import Drawing from 'dxf-writer'
import type { SubmissionPackage } from '../types'
import {
  initialiseDXFLayers,
  addStandardTitleBlock,
  DXF_LAYERS
} from '@/lib/drawing/dxfLayers'

export function generateFormNo4DXF(pkg: SubmissionPackage): string {
  const drawing = new Drawing()

  initialiseDXFLayers(drawing)

  drawing.setActiveLayer(DXF_LAYERS.BOUNDARY.name)

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
  addStandardTitleBlock(drawing, {
    drawingTitle: 'FORM NO. 4 — SURVEY PLAN',
    lrNumber: pkg.parcel.lrNumber,
    county: pkg.parcel.county,
    district: pkg.parcel.district,
    locality: pkg.parcel.locality,
    areaHa: pkg.parcel.areaM2 / 10000,
    perimeterM: pkg.parcel.perimeterM,
    surveyorName: pkg.surveyor.fullName,
    registrationNumber: pkg.surveyor.registrationNumber,
    firmName: pkg.surveyor.firmName,
    date: new Date(pkg.generatedAt).toLocaleDateString('en-KE'),
    submissionRef: pkg.submissionRef,
    coordinateSystem: 'Arc 1960 / UTM Zone 37S (SRID: 21037)',
    scale: '1:2500',
    sheetNumber: '1 of 1',
    revision: `R${String(pkg.revision).padStart(2, '0')}`
  })

  drawing.setActiveLayer(DXF_LAYERS.NORTHARROW.name)
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

function addNorthArrow(drawing: Drawing, _pkg: SubmissionPackage): void {
  const naX = 50
  const naY = 50
  drawing.drawLine(naX, naY, naX, naY + 8)
  drawing.drawText(naX - 1, naY + 9, 2, 0, 'N')
}
