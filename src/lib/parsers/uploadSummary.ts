import type { ParsedInput } from './types'

export interface UploadSummary {
  success: boolean
  type: string
  confidence: number
  hasBuilding: boolean
  hasCad: boolean
  hasBoq: boolean
  errors: string[]
  warnings: string[]
  extractedTextPreview?: string
  extractedTextCharacters?: number
  building?: {
    floors: number
    walls: number
    rooms: number
    doors: number
    windows: number
  }
  cad?: {
    entities: number
    points: number
    lines: number
    polylines: number
    layers: number
    units: string | null
    coordinateReferenceSystem: string | null
  }
  boq?: {
    items: number
    total: number | null
  }
}

export function summarizeParsedInput(parsed: ParsedInput): UploadSummary {
  const confidence = Number.isFinite(parsed.confidence)
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0
  const building = parsed.building
  const cad = parsed.cad
  const boq = parsed.boq

  return {
    success: parsed.errors.length === 0,
    type: parsed.type,
    confidence,
    hasBuilding: Boolean(building),
    hasCad: Boolean(cad),
    hasBoq: Boolean(boq),
    errors: parsed.errors,
    warnings: parsed.warnings,
    ...(parsed.extractedText !== undefined ? {
      extractedTextPreview: parsed.extractedText.slice(0, 12_000),
      extractedTextCharacters: parsed.extractedText.length,
    } : {}),
    ...(building ? {
      building: {
        floors: building.floors.length,
        walls: building.walls.length,
        rooms: building.rooms.length,
        doors: building.doors.length,
        windows: building.windows.length,
      },
    } : {}),
    ...(cad ? {
      cad: {
        entities: cad.entityCount,
        points: cad.typeCounts.POINT ?? 0,
        lines: cad.typeCounts.LINE ?? 0,
        polylines: (cad.typeCounts.LWPOLYLINE ?? 0) + (cad.typeCounts.POLYLINE ?? 0),
        layers: cad.layers.length,
        units: cad.units,
        coordinateReferenceSystem: cad.coordinateReferenceSystem,
      },
    } : {}),
    ...(boq ? {
      boq: {
        items: boq.items.length,
        total: Number.isFinite(boq.total) ? boq.total : null,
      },
    } : {}),
  }
}
