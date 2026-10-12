/**
 * DXF Export Generator (TypeScript-only)
 *
 * Blueprint alignment:
 * - Core exports must not depend on Python services.
 * - Uses the installed `dxf-writer` dependency to produce CAD-ready DXF.
 *
 * Notes:
 * - Coordinates are exported in the project CRS (typically UTM metres).
 * - No intermediate rounding is performed in calculations; DXF writer receives full JS float values.
 */

import Drawing from 'dxf-writer'
import { initialiseSokDXFLayers, DXF_LAYERS } from '@/lib/drawing/dxfLayers'
import type { SurveyPoint } from '@/types/surveyPoint'
import type { MapDxfEntity } from '@/lib/export/mapGeometryToDxf'

// Re-export for backwards compatibility with callers that import
// `{ SurveyPoint }` from this module. New code should import the type
// directly from '@/types/surveyPoint'.
export type { SurveyPoint }

export interface TraverseLeg {
  from: string
  to: string
  distance: number
  bearing: number
  adjEasting?: number
  adjNorthing?: number
}

export interface DXFExportOptions {
  projectName: string
  points: SurveyPoint[]
  traverseLegs?: TraverseLeg[]
  includeElevations?: boolean
  /** Optional editable map geometry already transformed into the project CRS. */
  mapEntities?: MapDxfEntity[]
}

export function generateDXF(options: DXFExportOptions): string {
  const { points, traverseLegs = [], includeElevations = true, mapEntities = [] } = options

  const drawing = new Drawing()
  initialiseSokDXFLayers(drawing)
  drawing.setUnits('Meters')

  drawing.addLineType('DASHED', 'Dashed', [-1.0, 0.5])
  drawing.addLineType('DOTTED', 'Dotted', [-0.5, 0.25])

  drawing.addLayer(DXF_LAYERS.CONTROL.name, Drawing.ACI.RED, 'CONTINUOUS')
  drawing.addLayer(DXF_LAYERS.SPOT.name, Drawing.ACI.YELLOW, 'CONTINUOUS')
  drawing.addLayer(DXF_LAYERS.CONTROL.name, Drawing.ACI.CYAN, 'CONTINUOUS')
  drawing.addLayer(DXF_LAYERS.BEACON_TXT.name, Drawing.ACI.WHITE, 'CONTINUOUS')

  const byName = new Map(points.map((p: SurveyPoint) => [p.name, p] as const))
  const standardLayerNames = new Set(Object.values(DXF_LAYERS).map((layer) => layer.name.toUpperCase()))
  standardLayerNames.add('0')
  const createdImportLayers = new Set<string>()
  const getMapLayer = (entity: MapDxfEntity, fallback: string) => {
    const requested = entity.sourceLayer?.trim()
    if (!requested) return fallback
    // DXF layer names may not contain these reserved characters. Preserve the
    // source name where possible while keeping the generated file valid.
    const safeName = requested.replace(/[<>/\\":;?*|,=\u0000-\u001f]/g, '_').trim().slice(0, 255) || '0'
    const key = safeName.toUpperCase()
    if (!standardLayerNames.has(key) && !createdImportLayers.has(key)) {
      drawing.addLayer(safeName, Drawing.ACI.WHITE, 'CONTINUOUS')
      createdImportLayers.add(key)
    }
    return safeName
  }

  // Points + labels
  for (const p of points) {
    drawing.setActiveLayer(p.is_control ? DXF_LAYERS.CONTROL.name : DXF_LAYERS.SPOT.name)
    drawing.drawPoint(p.easting, p.northing)

    drawing.setActiveLayer(DXF_LAYERS.BEACON_TXT.name)
    const label =
      includeElevations && typeof p.elevation === 'number' ? `${p.name} (${p.elevation})` : p.name
    drawing.drawText(p.easting + 0.5, p.northing + 0.5, 1.5, 0, label)
  }

  // Map geometry is exported as CAD geometry, not flattened into a coordinate
  // schedule. Point labels remain separate text entities on the label layer.
  for (const entity of mapEntities) {
    if (entity.kind === 'label') {
      drawing.setActiveLayer(getMapLayer(entity, DXF_LAYERS.NOTES_TXT.name))
      drawing.drawText(entity.coordinates[0], entity.coordinates[1], 1.5, 0, entity.text)
      continue
    }

    if (entity.kind === 'point') {
      drawing.setActiveLayer(getMapLayer(entity, DXF_LAYERS.MAP_POINT.name))
      drawing.drawPoint(entity.coordinates[0], entity.coordinates[1])
      if (entity.label) {
        drawing.setActiveLayer(DXF_LAYERS.BEACON_TXT.name)
        drawing.drawText(entity.coordinates[0] + 0.5, entity.coordinates[1] + 0.5, 1.5, 0, entity.label)
      }
      continue
    }

    drawing.setActiveLayer(getMapLayer(entity, entity.kind === 'boundary' ? DXF_LAYERS.MAP_BOUNDARY.name : DXF_LAYERS.MAP_LINE.name))
    drawing.drawPolyline(entity.coordinates, entity.kind === 'boundary')
    if (entity.label) {
      const [x, y] = entity.coordinates[0]
      drawing.setActiveLayer(DXF_LAYERS.NOTES_TXT.name)
      drawing.drawText(x + 0.5, y + 0.5, 1.5, 0, entity.label)
    }
  }

  // Traverse lines (if coordinates can be resolved)
  if (traverseLegs.length > 0) {
    drawing.setActiveLayer(DXF_LAYERS.CONTROL.name)
    for (const leg of traverseLegs) {
      const from = byName.get(leg.from)
      const to = byName.get(leg.to)
      if (!from || !to) continue
      drawing.drawLine(from.easting, from.northing, to.easting, to.northing)
    }
  }

  return drawing.toDxfString()
}

export function downloadDXF(options: DXFExportOptions): void {
  const dxfString = generateDXF(options)
  const blob = new Blob([dxfString], { type: 'application/dxf' })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().split('T')[0]
  const filename = `${options.projectName.replace(/\\s+/g, '_')}_${date}.dxf`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateDXFFromProject(
  projectName: string,
  points: SurveyPoint[],
  traverseResult?: {
    legs: Array<{
      from: string
      to: string
      adjEasting: number
      adjNorthing: number
    }>
  }
): string {
  return generateDXF({
    projectName,
    points,
    traverseLegs:
      traverseResult?.legs.map((l) => ({
        from: l.from,
        to: l.to,
        distance: 0,
        bearing: 0,
        adjEasting: l.adjEasting,
        adjNorthing: l.adjNorthing,
      })) || [],
  })
}

