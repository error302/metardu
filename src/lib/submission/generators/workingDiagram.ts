import Drawing from 'dxf-writer'
import type { SubmissionPackage } from '../types'

export function generateWorkingDiagramDXF(pkg: SubmissionPackage): string {
  const drawing = new Drawing()

  drawing.addLayer('WORKING', 7, 'CONTINUOUS')
  drawing.addLayer('ANNOTATIONS', 3, 'CONTINUOUS')
  drawing.addLayer('GRID', 8, 'DASHED')

  drawing.setActiveLayer('WORKING')

  const points = pkg.traverse.points
  
  points.forEach((pt, idx) => {
    drawing.drawCircle(pt.adjustedEasting, pt.adjustedNorthing, 0.3)
    drawing.drawText(
      pt.adjustedEasting + 0.5,
      pt.adjustedNorthing + 0.5,
      0.5,
      0,
      pt.pointName
    )
    
    const nextPt = points[(idx + 1) % points.length]
    if (nextPt) {
      const midE = (pt.adjustedEasting + nextPt.adjustedEasting) / 2
      const midN = (pt.adjustedNorthing + nextPt.adjustedNorthing) / 2
      drawing.drawText(midE, midN - 0.5, 0.4, 0, `${pt.observedDistance.toFixed(2)}m`)
    }
  })

  drawing.setActiveLayer('ANNOTATIONS')
  drawing.drawText(0, -5, 1.5, 0, `Working Diagram — ${pkg.submissionRef}`)
  drawing.drawText(0, -10, 1, 0, `LR: ${pkg.parcel.lrNumber} | Area: ${(pkg.parcel.areaM2 / 10000).toFixed(4)} Ha`)

  return drawing.toDxfString()
}
