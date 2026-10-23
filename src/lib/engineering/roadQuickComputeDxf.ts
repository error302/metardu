import Drawing from 'dxf-writer'
import { curveSetOut, horizontalCurveElements, type HorizontalCurveInput } from '@/lib/computations/roadDesignEngine'
import { superelevationDesign, type SuperelevationInput } from '@/lib/computations/roadSafetyCriteria'

export type LocalCurveDirection = 'left' | 'right'

function draftDrawing() {
  const drawing = new Drawing()
  drawing.setUnits('Meters')
  for (const [name, color] of [['GEOMETRY', 1], ['TANGENTS', 8], ['SET_OUT', 3], ['NOTES', 7]] as const) drawing.addLayer(name, color, 'CONTINUOUS')
  return drawing
}

// DXF text records are line-delimited; user criteria must stay inside one value.
function oneLine(value: string) { return value.replace(/[\u0000-\u001f\u007f]/g, ' ') }

export function horizontalCurveDraftDxf(input: HorizontalCurveInput, interval: number, direction: LocalCurveDirection): string {
  if (direction !== 'left' && direction !== 'right') throw new Error('Declare left or right curve direction before exporting.')
  const curve = horizontalCurveElements(input)
  const setout = curveSetOut({ ...input, tcChainage: curve.tcChainage, ctChainage: curve.ctChainage, interval })
  const drawing = draftDrawing()
  const sign = direction === 'left' ? 1 : -1
  const angle = curve.delta * 180 / Math.PI
  const r = input.radius
  drawing.setActiveLayer('GEOMETRY')
  // TC=(0,0), incoming tangent=+X. An ARC retains exact model-space radius;
  // right turns use the reversed CCW arc to represent the same TC-to-CT sweep.
  drawing.drawArc(0, sign * r, r, direction === 'left' ? 270 : (450 - angle) % 360, direction === 'left' ? (270 + angle) % 360 : 90)
  const endX = r * Math.sin(curve.delta)
  const endY = sign * 2 * r * Math.sin(curve.delta / 2) ** 2
  drawing.setActiveLayer('TANGENTS')
  drawing.drawLine(0, 0, curve.tangentLength, 0)
  drawing.drawLine(curve.tangentLength, 0, endX, endY)
  drawing.setActiveLayer('SET_OUT')
  for (const row of setout.rows) {
    const theta = (row.chainage - curve.tcChainage) / r
    drawing.drawPoint(r * Math.sin(theta), sign * 2 * r * Math.sin(theta / 2) ** 2)
  }
  drawing.setActiveLayer('NOTES')
  const h = r / 50
  const notes = [
    'LOCAL CALCULATION DRAFT - metres, full-size model geometry',
    `TC=(0,0); incoming tangent=+X; turn=${direction}; no CRS, bearing or project placement`,
    `R=${r}; angle=${angle} deg; PI station=${input.ipChainage}; peg interval=${interval}`,
    `TC station=${curve.tcChainage}; CT station=${curve.ctChainage}`,
    'Visibility, standards compliance, field control and design approval NOT ASSESSED',
  ]
  notes.forEach((note, i) => drawing.drawText(0, -(i + 2) * h * 2, h, 0, note))
  return drawing.toDxfString()
}

export function bankingSectionDraftDxf(input: SuperelevationInput): string {
  const result = superelevationDesign(input)
  const drawing = draftDrawing()
  const width = result.rotatedWidth
  drawing.setActiveLayer('GEOMETRY')
  drawing.drawLine(0, 0, width, width * result.designE)
  drawing.setActiveLayer('TANGENTS')
  drawing.drawLine(0, 0, width, 0)
  drawing.drawLine(0, 0, width, width * input.initialCrossfall)
  drawing.setActiveLayer('NOTES')
  const h = width / 30
  const criteria = result.criteria
  const notes = [
    'LOCAL BANKING SECTION DRAFT - metres, full-size model geometry',
    'Origin=rotation axis; +X=width rotated; +Y=rise; no CRS, absolute level or project placement',
    `V=${input.designSpeed} km/h; R=${input.radius} m; rotated width=${width} m`,
    `Provided=${result.designE * 100}%; initial=${input.initialCrossfall * 100}%; rotation length=${result.transitionLength} m`,
    `Declared criteria: ${oneLine(result.criteriaReference)}`,
    `Side friction=${criteria.lateralFriction}; maximum e=${criteria.maximumSuperelevation * 100}%; relative gradient=${criteria.maximumRelativeGradient * 100}%`,
    `Banking checks=${result.status}; standard compliance=${result.standardCompliance}`,
    'Declared criteria independently unverified; spiral, drainage, visibility and approval NOT ASSESSED',
  ]
  notes.forEach((note, i) => drawing.drawText(0, -(i + 2) * h * 2, h, 0, note))
  return drawing.toDxfString()
}
