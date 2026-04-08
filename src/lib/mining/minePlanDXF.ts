import Drawing from 'dxf-writer'
import { initialiseDXFLayers, DXF_LAYERS, TitleBlockData, TITLE_BLOCK_TEMPLATES } from '@/lib/drawing/dxfLayers'

export interface MinePlanOptions {
  sections?: Array<{
    station: number
    leftOffset: number
    rightOffset: number
    depth: number
  }>
  gridPoints?: Array<{
    easting: number
    northing: number
    groundElevation: number
  }>
  titleBlockData: TitleBlockData
}

export function generateMinePlanDXF(options: MinePlanOptions): string {
  const { sections = [], gridPoints = [], titleBlockData } = options

  const drawing = new Drawing()
  initialiseDXFLayers(drawing)

  drawing.setActiveLayer(DXF_LAYERS.TITLEBLOCK.name)
  const tb = {
    ...titleBlockData,
    drawingTitle: TITLE_BLOCK_TEMPLATES.mining_section.drawingTitle
  }

  drawing.setActiveLayer(DXF_LAYERS.TOPO.name)

  if (sections.length > 0) {
    const minStation = Math.min(...sections.map(s => s.station))
    const maxStation = Math.max(...sections.map(s => s.station))
    const maxDepth = Math.max(...sections.map(s => s.depth))
    
    const scale = 10
    const baseY = 50

    for (const section of sections) {
      const x = baseY + (section.station - minStation) * scale
      const leftX = x - (section.leftOffset * scale)
      const rightX = x + (section.rightOffset * scale)
      const depthY = baseY - (section.depth * scale)

      drawing.drawLine(leftX, baseY, leftX, depthY)
      drawing.drawLine(leftX, depthY, rightX, depthY)
      drawing.drawLine(rightX, depthY, rightX, baseY)

      drawing.drawText(
        leftX - 5,
        depthY - 5,
        1.5,
        0,
        `${section.depth.toFixed(2)}m`
      )
    }

    drawing.setActiveLayer(DXF_LAYERS.ANNOTATIONS.name)
    drawing.drawText(baseY - 20, baseY + 5, 2, 0, 'STATION')
    drawing.drawText(baseY - 20, baseY - 5, 1.5, 0, `Range: ${minStation.toFixed(0)} - ${maxStation.toFixed(0)}`)
  }

  if (gridPoints.length > 0) {
    const minE = Math.min(...gridPoints.map(p => p.easting))
    const maxE = Math.max(...gridPoints.map(p => p.easting))
    const minN = Math.min(...gridPoints.map(p => p.northing))
    const maxN = Math.max(...gridPoints.map(p => p.northing))
    const minZ = Math.min(...gridPoints.map(p => p.groundElevation))

    const xScale = 100 / (maxE - minE || 1)
    const yScale = 100 / (maxN - minN || 1)
    const zScale = 5

    const offsetX = 10
    const offsetY = 10

    for (const point of gridPoints) {
      const x = offsetX + (point.easting - minE) * xScale
      const y = offsetY + (point.northing - minN) * yScale
      const z = offsetY + (point.groundElevation - minZ) * zScale

      drawing.drawCircle(x, y, 1)

      drawing.drawText(
        x + 2,
        y,
        1,
        0,
        `Z:${point.groundElevation.toFixed(2)}`
      )
    }
  }

  return drawing.toDxfString()
}

export function exportMineSectionsToDXF(
  sections: Array<{station: number; leftOffset: number; rightOffset: number; depth: number}>,
  titleBlockData: TitleBlockData
): string {
  return generateMinePlanDXF({
    sections,
    titleBlockData
  })
}

export function exportGridToDXF(
  gridPoints: Array<{easting: number; northing: number; groundElevation: number}>,
  titleBlockData: TitleBlockData
): string {
  return generateMinePlanDXF({
    gridPoints,
    titleBlockData
  })
}
