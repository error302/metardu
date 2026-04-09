import Drawing from 'dxf-writer'

export const DXF_LAYERS = {
  BOUNDARY:      { name: 'BOUNDARY',      color: 7,  linetype: 'CONTINUOUS' },
  BEACONS:       { name: 'BEACONS',       color: 2,  linetype: 'CONTINUOUS' },
  BEACON_LABELS:  { name: 'BEACON_LABELS', color: 7,  linetype: 'CONTINUOUS' },
  DIMENSIONS:    { name: 'DIMENSIONS',     color: 3,  linetype: 'CONTINUOUS' },
  BEARINGS:      { name: 'BEARINGS',       color: 3,  linetype: 'CONTINUOUS' },
  AREA_LABEL:    { name: 'AREA_LABEL',     color: 7,  linetype: 'CONTINUOUS' },
  TITLE_BLOCK:   { name: 'TITLE_BLOCK',  color: 7,  linetype: 'CONTINUOUS' },
  TITLEBLOCK:    { name: 'TITLEBLOCK',    color: 7,  linetype: 'CONTINUOUS' },
  NORTH_ARROW:  { name: 'NORTH_ARROW',  color: 7,  linetype: 'CONTINUOUS' },
  NORTHARROW:    { name: 'NORTHARROW',    color: 7,  linetype: 'CONTINUOUS' },
  SCALE_BAR:     { name: 'SCALE_BAR',    color: 7,  linetype: 'CONTINUOUS' },
  SCALEBAR:      { name: 'SCALEBAR',      color: 7,  linetype: 'CONTINUOUS' },
  BORDER:       { name: 'BORDER',       color: 7,  linetype: 'CONTINUOUS' },
  ANNOTATIONS:   { name: 'ANNOTATIONS',   color: 3,  linetype: 'CONTINUOUS' },
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

export interface FormNo4TitleBlockData {
  lrNumber: string
  parcelNumber: string
  county: string
  division: string
  district: string
  locality: string
  areaHa: string
  perimeterM: string
  surveyorName: string
  iskNumber: string
  firmName: string
  surveyDate: string
  scale: string
  sheet: string
  revision: string
  referenceNumber: string
}

export function formatPlanDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function formatBearingDMS(decimalDegrees: number): string {
  const normalised = ((decimalDegrees % 360) + 360) % 360
  const totalSeconds = Math.round(normalised * 3600)
  const d = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`
}

export function formatDistanceM(metres: number): string {
  return metres.toFixed(3)
}

export const TITLE_BLOCK_TEMPLATES = {
  eng_horizontal_curve: { drawingTitle: 'Horizontal Curve Layout' },
  eng_superelevation: { drawingTitle: 'Superelevation Diagram' },
  eng_volumes: { drawingTitle: 'Volume Calculation Sheet' },
  cadastral_form4: { drawingTitle: 'Form No. 4 - Plan of Survey' },
  topo_contours: { drawingTitle: 'Topographic Contour Plan' },
  mining_section: { drawingTitle: 'Mining Section' },
} as const

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
