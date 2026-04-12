/**
 * Bathymetric Fair Sheet DXF Generator — Phase 19
 * Generates a DXF file with depth contours and sounding markers.
 */

import Drawing from 'dxf-writer'
import {
  initialiseDXFLayers,
  addStandardTitleBlock,
  DXF_LAYERS
} from '@/lib/drawing/dxfLayers'
import { generateContours, IDWOutput } from '@/lib/topo/contourGenerator'
import type { ReducedSounding } from './types'

export interface BathymetricGrid {
  idwGrid: {
    grid: number[][]
    cols: number
    rows: number
    minX: number
    minY: number
    cellSize: number
  }
  minDepth: number
  maxDepth: number
  meanDepth: number
}

export function generateBathymetricFairSheet(params: {
  bathyGrid:       BathymetricGrid
  soundings:       ReducedSounding[]
  contourInterval: number
  hydroType:       string
  projectData:     Record<string, any>
  surveyorProfile: { fullName: string; registrationNumber: string; firmName: string }
}): string {
  const {
    bathyGrid, soundings, contourInterval,
    hydroType, projectData, surveyorProfile
  } = params

  const drawing = new Drawing()
  initialiseDXFLayers(drawing)

  addStandardTitleBlock(drawing, {
    drawingTitle:       `BATHYMETRIC FAIR SHEET — ${hydroType.toUpperCase()}`,
    lrNumber:           projectData?.lr_number    ?? 'N/A',
    county:             projectData?.county       ?? 'N/A',
    district:           projectData?.district     ?? 'N/A',
    locality:           projectData?.locality     ?? 'N/A',
    areaHa:             0,
    perimeterM:         0,
    surveyorName:       surveyorProfile.fullName,
    registrationNumber: surveyorProfile.registrationNumber,
    firmName:           surveyorProfile.firmName,
    date:               new Date().toLocaleDateString('en-KE'),
    submissionRef:      'N/A',
    coordinateSystem:   'Arc 1960 / UTM Zone 37S (SRID: 21037)',
    scale:              '1:5000',
    sheetNumber:        '1 of 1',
    revision:           'R00',
  })

  const idwOutput: IDWOutput = {
    grid: bathyGrid.idwGrid.grid,
    gridMinE: bathyGrid.idwGrid.minX,
    gridMinN: bathyGrid.idwGrid.minY,
    gridResolution: bathyGrid.idwGrid.cellSize,
    cols: bathyGrid.idwGrid.cols,
    rows: bathyGrid.idwGrid.rows,
  }

  const contours = generateContours(
    idwOutput,
    { interval: contourInterval, indexInterval: 5 }
  )

  contours.forEach(contour => {
    const layerName = contour.isIndex
      ? DXF_LAYERS.CONTOURS_IDX.name
      : DXF_LAYERS.CONTOURS.name
    drawing.setActiveLayer(layerName)

    contour.coordinates.forEach(ring => {
      for (let i = 0; i < ring.length - 1; i++) {
        drawing.drawLine(ring[i][0], ring[i][1], ring[i+1][0], ring[i+1][1])
      }
      if (ring.length > 1) {
        drawing.drawLine(
          ring[ring.length-1][0], ring[ring.length-1][1],
          ring[0][0], ring[0][1]
        )
      }
      if (contour.isIndex && ring.length > 4) {
        const mid = ring[Math.floor(ring.length / 4)]
        drawing.setActiveLayer(DXF_LAYERS.ANNOTATIONS.name)
        drawing.drawText(mid[0], mid[1], 0.8, 0, `${contour.elevation.toFixed(1)}m`)
      }
    })
  })

  drawing.setActiveLayer(DXF_LAYERS.SPOT_HEIGHTS.name)
  soundings.forEach(s => {
    drawing.drawCircle(s.x, s.y, 0.5)
    drawing.drawText(s.x + 0.8, s.y + 0.8, 0.6, 0,
      s.reducedDepthM.toFixed(2))
  })

  return drawing.toDxfString()
}
