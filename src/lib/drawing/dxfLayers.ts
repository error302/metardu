import Drawing from 'dxf-writer'

export const DXF_LAYERS = {
  BOUNDARY:      { name: 'BOUNDARY',      color: 7,  linetype: 'CONTINUOUS' },
  BEACONS:       { name: 'BEACONS',       color: 2,  linetype: 'CONTINUOUS' },
  ANNOTATIONS:   { name: 'ANNOTATIONS',   color: 3,  linetype: 'CONTINUOUS' },
  TITLEBLOCK:    { name: 'TITLEBLOCK',    color: 7,  linetype: 'CONTINUOUS' },
  NORTHARROW:    { name: 'NORTHARROW',    color: 7,  linetype: 'CONTINUOUS' },
  SCALEBAR:      { name: 'SCALEBAR',      color: 7,  linetype: 'CONTINUOUS' },
  GRID:          { name: 'GRID',          color: 8,  linetype: 'DASHED'     },
  CONTOURS:      { name: 'CONTOURS',      color: 4,  linetype: 'CONTINUOUS' },
  CONTOURS_IDX:  { name: 'CONTOURS_IDX',  color: 1,  linetype: 'CONTINUOUS' },
  SPOT_HEIGHTS:  { name: 'SPOT_HEIGHTS',  color: 3,  linetype: 'CONTINUOUS' },
  CENTRELINE:    { name: 'CENTRELINE',    color: 1,  linetype: 'CONTINUOUS' },
  CHAINAGES:     { name: 'CHAINAGES',     color: 3,  linetype: 'CONTINUOUS' },
  PROFILE:       { name: 'PROFILE',       color: 2,  linetype: 'CONTINUOUS' },
  XSECTION:      { name: 'XSECTION',      color: 6,  linetype: 'CONTINUOUS' },
  SETOUT_POINTS: { name: 'SETOUT_POINTS', color: 5,  linetype: 'CONTINUOUS' },
  OLD_BOUNDARY:  { name: 'OLD_BOUNDARY',  color: 8,  linetype: 'DASHED'     },
  NEW_BOUNDARY:  { name: 'NEW_BOUNDARY',  color: 7,  linetype: 'CONTINUOUS' },
  TRAVERSE:      { name: 'TRAVERSE',      color: 1,  linetype: 'CONTINUOUS' },
  CONTROL_POINTS:{ name: 'CONTROL_POINTS',color: 6,  linetype: 'CONTINUOUS' },
  TOPO:          { name: 'TOPO',          color: 4,  linetype: 'CONTINUOUS' },
} as const

export type DXFLayerKey = keyof typeof DXF_LAYERS

export function initialiseDXFLayers(drawing: Drawing): void {
  Object.values(DXF_LAYERS).forEach(layer => {
    drawing.addLayer(layer.name, layer.color, layer.linetype)
  })
}

export interface TitleBlockData {
  drawingTitle: string
  lrNumber: string
  county: string
  district: string
  locality: string
  areaHa: number
  perimeterM: number
  surveyorName: string
  registrationNumber: string
  firmName: string
  date: string
  submissionRef: string
  coordinateSystem: string
  scale: string
  sheetNumber: string
  revision: string
}

export function addStandardTitleBlock(
  drawing: Drawing,
  data: TitleBlockData,
  originX = 0,
  originY = -30
): void {
  drawing.setActiveLayer(DXF_LAYERS.TITLEBLOCK.name)

  const rows: [number, string][] = [
    [0,   `REPUBLIC OF KENYA`],
    [-4,  `SURVEY OF KENYA`],
    [-8,  data.drawingTitle],
    [-14, `LR No: ${data.lrNumber}`],
    [-18, `County: ${data.county}`],
    [-22, `District: ${data.district}`],
    [-26, `Locality: ${data.locality}`],
    [-32, `Area: ${data.areaHa.toFixed(4)} Ha (${(data.areaHa * 10000).toFixed(2)} m²)`],
    [-36, `Perimeter: ${data.perimeterM.toFixed(3)} m`],
    [-42, `Licensed Surveyor: ${data.surveyorName}`],
    [-46, `Reg. No: ${data.registrationNumber}`],
    [-50, `Firm: ${data.firmName}`],
    [-56, `Date: ${data.date}`],
    [-60, `Scale: ${data.scale}`],
    [-64, `Coord. System: ${data.coordinateSystem}`],
    [-68, `Submission Ref: ${data.submissionRef}`],
    [-72, `Sheet: ${data.sheetNumber}  Rev: ${data.revision}`],
  ]

  rows.forEach(([yOffset, text]) => {
    drawing.drawText(
      originX + 2,
      originY + yOffset,
      yOffset <= -8 && yOffset >= -8 ? 2.5 : 1.5,
      0,
      text
    )
  })
}
