/**
 * METARDU — Field-to-Finish Automated Linework Engine
 * =====================================================
 * Converts coded survey points into connected linework (polylines, polygons)
 * with proper layers, linetypes, and symbology.
 *
 * When a surveyor codes points in the field (e.g., BLD...BLD for a building,
 * FNC...FNC for a fence), this engine automatically connects them with correct
 * linetypes, symbols, and hatch patterns — the #1 time-saver in the
 * field-to-office workflow.
 *
 * Competitors:
 *   - Trimble TBC: Feature Definition Manager (FXL)
 *   - Carlson: Field-to-Finish
 *   - Leica: Code Lists
 *   - 12d Model: String Coding
 *
 * Source: Survey of Kenya drawing standards (LISCAD layer conventions)
 * Source: METARDU 45-layer DXF standard (dxfLayers.ts)
 */

import type { Point2D } from './types'

// ─── Code Table Types ────────────────────────────────────────────────

export interface FieldCodeDefinition {
  /** Feature code used in field (e.g., 'BLD', 'FNC', 'RD') */
  code: string
  /** Human-readable label */
  label: string
  /** DXF layer name from METARDU 45-layer standard */
  layer: string
  /** DXF line type name */
  lineType: 'Continuous' | 'Dashed' | 'Center' | 'Hidden' | 'Dot'
  /** DXF color index (ACI 1-255) */
  colorIndex: number
  /** Point symbol type */
  symbol: 'circle' | 'square' | 'triangle' | 'cross' | 'diamond' | 'dot' | 'none'
  /** Symbol size in map units (metres) */
  symbolSize: number
  /** Whether sequences of this code form closed polygons */
  closeable: boolean
  /** Feature category for grouping */
  category: 'monument' | 'boundary' | 'infrastructure' | 'natural' | 'topographic' | 'utility'
  /** Optional: connect mode */
  connectMode: 'sequential' | 'none'
}

export interface CodedFieldPoint extends Point2D {
  /** Point name/ID */
  name: string
  /** Feature code (e.g., 'BLD', 'FNC') */
  code: string
  /** Optional elevation */
  elevation?: number
  /** Optional description */
  description?: string
  /** Optional sequence number (for multi-feature disambiguation) */
  sequence?: number
}

export interface GeneratedFeature {
  /** Feature code */
  code: string
  /** Layer name */
  layer: string
  /** Line type */
  lineType: string
  /** Color index */
  colorIndex: number
  /** Points forming the linework */
  points: Array<{ name: string; easting: number; northing: number; elevation?: number }>
  /** Whether the feature forms a closed polygon */
  isClosed: boolean
  /** GeoJSON geometry (for map display) */
  geometry: GeoJSON.Geometry
  /** Area in square metres (only for closed polygons) */
  areaSqm?: number
  /** Perimeter in metres */
  perimeterM: number
}

export interface FieldToFinishResult {
  /** Generated linework features */
  features: GeneratedFeature[]
  /** Points that did not match any code definition (orphans) */
  unmatchedPoints: CodedFieldPoint[]
  /** Points matched to codes but with connectMode='none' (isolated symbols) */
  isolatedSymbols: Array<{
    point: CodedFieldPoint
    definition: FieldCodeDefinition
  }>
  /** Summary statistics */
  summary: {
    totalPoints: number
    matchedPoints: number
    unmatchedPoints: number
    featuresGenerated: number
    closedPolygons: number
    openPolylines: number
  }
}

// ─── Default Kenya Cadastral & Engineering Code Table ───────────────

export const KENYA_FIELD_CODE_TABLE: FieldCodeDefinition[] = [
  // Monuments
  { code: 'MB', label: 'Concrete Beacon', layer: 'BEACONS', lineType: 'Continuous', colorIndex: 1, symbol: 'circle', symbolSize: 1.5, closeable: true, category: 'monument', connectMode: 'sequential' },
  { code: 'IP', label: 'Iron Pin', layer: 'BEACONS', lineType: 'Continuous', colorIndex: 1, symbol: 'diamond', symbolSize: 1.0, closeable: true, category: 'monument', connectMode: 'sequential' },
  { code: 'CP', label: 'Control Point', layer: 'CONTROL', lineType: 'Continuous', colorIndex: 5, symbol: 'triangle', symbolSize: 2.0, closeable: false, category: 'monument', connectMode: 'none' },
  { code: 'BS', label: 'Backsight', layer: 'CONTROL', lineType: 'Continuous', colorIndex: 5, symbol: 'triangle', symbolSize: 2.0, closeable: false, category: 'monument', connectMode: 'none' },
  { code: 'BM', label: 'Bench Mark', layer: 'BMARK', lineType: 'Continuous', colorIndex: 5, symbol: 'cross', symbolSize: 2.0, closeable: false, category: 'monument', connectMode: 'none' },

  // Boundary
  { code: 'BDY', label: 'Boundary Line', layer: 'PARCEL_BDY', lineType: 'Continuous', colorIndex: 1, symbol: 'none', symbolSize: 0, closeable: true, category: 'boundary', connectMode: 'sequential' },
  { code: 'FNC', label: 'Fence Line', layer: 'FENCE', lineType: 'Dashed', colorIndex: 8, symbol: 'dot', symbolSize: 0.5, closeable: true, category: 'boundary', connectMode: 'sequential' },
  { code: 'WL', label: 'Wall', layer: 'WALL', lineType: 'Continuous', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: true, category: 'boundary', connectMode: 'sequential' },
  { code: 'HG', label: 'Hedge', layer: 'HEDGE', lineType: 'Dashed', colorIndex: 3, symbol: 'none', symbolSize: 0, closeable: true, category: 'boundary', connectMode: 'sequential' },

  // Infrastructure
  { code: 'BLD', label: 'Building', layer: 'BUILDINGS', lineType: 'Continuous', colorIndex: 7, symbol: 'square', symbolSize: 1.0, closeable: true, category: 'infrastructure', connectMode: 'sequential' },
  { code: 'RD', label: 'Road Edge', layer: 'ROAD_EDGE', lineType: 'Continuous', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: false, category: 'infrastructure', connectMode: 'sequential' },
  { code: 'RCL', label: 'Road Centreline', layer: 'ROAD_CENT', lineType: 'Center', colorIndex: 6, symbol: 'none', symbolSize: 0, closeable: false, category: 'infrastructure', connectMode: 'sequential' },
  { code: 'KRB', label: 'Kerb', layer: 'KERB', lineType: 'Continuous', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: false, category: 'infrastructure', connectMode: 'sequential' },
  { code: 'FP', label: 'Footpath', layer: 'FOOTPATH', lineType: 'Dashed', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: false, category: 'infrastructure', connectMode: 'sequential' },

  // Utilities
  { code: 'MH', label: 'Manhole', layer: 'SEWER', lineType: 'Continuous', colorIndex: 4, symbol: 'circle', symbolSize: 1.0, closeable: false, category: 'utility', connectMode: 'none' },
  { code: 'PP', label: 'Power Pole', layer: 'POWER', lineType: 'Continuous', colorIndex: 2, symbol: 'cross', symbolSize: 1.5, closeable: false, category: 'utility', connectMode: 'sequential' },
  { code: 'PWR', label: 'Power Line', layer: 'POWER', lineType: 'Dashed', colorIndex: 2, symbol: 'none', symbolSize: 0, closeable: false, category: 'utility', connectMode: 'sequential' },
  { code: 'WP', label: 'Water Pipe', layer: 'WATER', lineType: 'Hidden', colorIndex: 4, symbol: 'none', symbolSize: 0, closeable: false, category: 'utility', connectMode: 'sequential' },
  { code: 'CUL', label: 'Culvert', layer: 'DRAINAGE', lineType: 'Continuous', colorIndex: 4, symbol: 'square', symbolSize: 1.0, closeable: false, category: 'utility', connectMode: 'none' },

  // Natural features
  { code: 'TR', label: 'Tree', layer: 'TREES', lineType: 'Continuous', colorIndex: 3, symbol: 'circle', symbolSize: 2.0, closeable: false, category: 'natural', connectMode: 'none' },
  { code: 'RIV', label: 'River/Stream', layer: 'RIVER', lineType: 'Continuous', colorIndex: 4, symbol: 'none', symbolSize: 0, closeable: false, category: 'natural', connectMode: 'sequential' },
  { code: 'SH', label: 'Spot Height', layer: 'SPOT_HT', lineType: 'Continuous', colorIndex: 6, symbol: 'cross', symbolSize: 0.8, closeable: false, category: 'topographic', connectMode: 'none' },
  { code: 'TF', label: 'Top of Feature', layer: 'TOPO', lineType: 'Continuous', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: false, category: 'topographic', connectMode: 'sequential' },
  { code: 'BF', label: 'Bottom of Feature', layer: 'TOPO', lineType: 'Dashed', colorIndex: 8, symbol: 'none', symbolSize: 0, closeable: false, category: 'topographic', connectMode: 'sequential' },
]

// ─── Code Lookup ─────────────────────────────────────────────────────

/**
 * Build a fast lookup map from a code table.
 * Codes are matched case-insensitively.
 */
function buildCodeMap(
  codeTable: FieldCodeDefinition[]
): Map<string, FieldCodeDefinition> {
  const map = new Map<string, FieldCodeDefinition>()
  for (const def of codeTable) {
    map.set(def.code.toUpperCase(), def)
  }
  return map
}

/**
 * Extract the base feature code from a point description.
 *
 * Surveyors often append sequence numbers or modifiers:
 *   'BLD1', 'BLD 2', 'BLD-3', 'FNC_A', 'MB01'
 *
 * This function strips trailing digits, spaces, hyphens, and underscores
 * to find the base code.
 */
function extractBaseCode(description: string): { baseCode: string; sequence: string } {
  const trimmed = description.trim().toUpperCase()
  // Try exact match first
  // Then try stripping trailing digits/modifiers
  const match = trimmed.match(/^([A-Z]+)[\s_-]?(\d*[A-Za-z]?)$/)
  if (match) {
    return { baseCode: match[1], sequence: match[2] || '' }
  }
  return { baseCode: trimmed, sequence: '' }
}

// ─── Geometry Helpers ────────────────────────────────────────────────

function computeDistance(p1: Point2D, p2: Point2D): number {
  const de = p2.easting - p1.easting
  const dn = p2.northing - p1.northing
  return Math.sqrt(de * de + dn * dn)
}

/**
 * Compute area using the Shoelace formula (Gauss's area formula).
 * Returns positive area in square metres.
 * Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 12
 */
function shoelaceArea(points: Point2D[]): number {
  const n = points.length
  if (n < 3) return 0
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].easting * points[j].northing
    area -= points[j].easting * points[i].northing
  }
  return Math.abs(area) / 2
}

function computePerimeter(points: Point2D[], isClosed: boolean): number {
  let perimeter = 0
  for (let i = 0; i < points.length - 1; i++) {
    perimeter += computeDistance(points[i], points[i + 1])
  }
  if (isClosed && points.length >= 3) {
    perimeter += computeDistance(points[points.length - 1], points[0])
  }
  return perimeter
}

function toGeoJSONCoords(
  points: Array<{ easting: number; northing: number }>
): [number, number][] {
  return points.map((p) => [p.easting, p.northing])
}

// ─── Main Engine ─────────────────────────────────────────────────────

/**
 * Field-to-Finish: generates linework from coded field points.
 *
 * Algorithm:
 * 1. Parse each point's code/description to extract the base feature code
 * 2. Group points by feature code + sequence string
 * 3. For each group, look up the code table to get layer, linetype, etc.
 * 4. Connect points in each group sequentially (in observation order)
 * 5. Close polygons where the code definition says closeable=true
 * 6. Compute area for closed polygons, perimeter for all
 * 7. Generate GeoJSON geometry for map display
 *
 * @param points - Array of coded field points in observation order
 * @param codeTable - Code table definitions (defaults to Kenya standard)
 * @returns Generated features, unmatched points, and summary statistics
 */
export function fieldToFinish(
  points: CodedFieldPoint[],
  codeTable: FieldCodeDefinition[] = KENYA_FIELD_CODE_TABLE
): FieldToFinishResult {
  const codeMap = buildCodeMap(codeTable)
  const unmatchedPoints: CodedFieldPoint[] = []
  const isolatedSymbols: FieldToFinishResult['isolatedSymbols'] = []

  // Group points by feature code + sequence
  // Key format: 'BLD_1', 'FNC_A', 'BLD_2', etc.
  const groups = new Map<string, { definition: FieldCodeDefinition; points: CodedFieldPoint[] }>()

  for (const point of points) {
    const { baseCode, sequence } = extractBaseCode(point.code)
    const definition = codeMap.get(baseCode)

    if (!definition) {
      unmatchedPoints.push(point)
      continue
    }

    // Isolated symbols (no connecting)
    if (definition.connectMode === 'none') {
      isolatedSymbols.push({ point, definition })
      continue
    }

    const groupKey = `${baseCode}_${sequence}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { definition, points: [] })
    }
    groups.get(groupKey)!.points.push(point)
  }

  // Generate features from groups
  const features: GeneratedFeature[] = []

  for (const [, group] of groups) {
    const { definition, points: groupPoints } = group

    if (groupPoints.length < 2) {
      // Single point can't form a line — treat as isolated
      if (groupPoints.length === 1) {
        isolatedSymbols.push({ point: groupPoints[0], definition })
      }
      continue
    }

    // Determine closure: close if definition says closeable AND we have 3+ points
    const isClosed = definition.closeable && groupPoints.length >= 3

    // Build coordinate array
    const featurePoints = groupPoints.map((p) => ({
      name: p.name,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation,
    }))

    // Compute metrics
    const perimeterM = computePerimeter(groupPoints, isClosed)
    const areaSqm = isClosed ? shoelaceArea(groupPoints) : undefined

    // Build GeoJSON geometry
    let geometry: GeoJSON.Geometry
    if (isClosed) {
      const coords = toGeoJSONCoords(groupPoints)
      // Close the ring by repeating the first point
      coords.push(coords[0])
      geometry = { type: 'Polygon', coordinates: [coords] }
    } else {
      geometry = { type: 'LineString', coordinates: toGeoJSONCoords(groupPoints) }
    }

    features.push({
      code: definition.code,
      layer: definition.layer,
      lineType: definition.lineType,
      colorIndex: definition.colorIndex,
      points: featurePoints,
      isClosed,
      geometry,
      areaSqm,
      perimeterM,
    })
  }

  // Count stats
  const matchedCount = points.length - unmatchedPoints.length
  const closedCount = features.filter((f) => f.isClosed).length

  return {
    features,
    unmatchedPoints,
    isolatedSymbols,
    summary: {
      totalPoints: points.length,
      matchedPoints: matchedCount,
      unmatchedPoints: unmatchedPoints.length,
      featuresGenerated: features.length,
      closedPolygons: closedCount,
      openPolylines: features.length - closedCount,
    },
  }
}

/**
 * Export Field-to-Finish results as DXF string.
 *
 * Generates a DXF file with proper layers, linetypes, colors, and
 * both LWPOLYLINE entities for linework and INSERT/CIRCLE entities
 * for point symbols.
 *
 * Source: AutoCAD DXF Reference (Autodesk, 2025)
 * Source: Survey of Kenya LISCAD layer standards
 */
export function fieldToFinishDXF(result: FieldToFinishResult): string {
  const lines: string[] = []

  // HEADER section
  lines.push('0', 'SECTION', '2', 'HEADER')
  lines.push('9', '$ACADVER', '1', 'AC1015') // AutoCAD 2000 format
  lines.push('0', 'ENDSEC')

  // TABLES section (layers + linetypes)
  lines.push('0', 'SECTION', '2', 'TABLES')

  // Linetype table
  lines.push('0', 'TABLE', '2', 'LTYPE', '70', '5')
  lines.push('0', 'LTYPE', '2', 'Continuous', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0')
  lines.push('0', 'LTYPE', '2', 'Dashed', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '6.0', '49', '3.0', '49', '-3.0')
  lines.push('0', 'LTYPE', '2', 'Center', '70', '0', '3', '____ _ ____', '72', '65', '73', '4', '40', '12.0', '49', '6.0', '49', '-1.5', '49', '1.5', '49', '-1.5')
  lines.push('0', 'LTYPE', '2', 'Hidden', '70', '0', '3', '_ _ _ _', '72', '65', '73', '2', '40', '4.0', '49', '2.0', '49', '-2.0')
  lines.push('0', 'LTYPE', '2', 'Dot', '70', '0', '3', '. . . .', '72', '65', '73', '2', '40', '2.0', '49', '0.0', '49', '-2.0')
  lines.push('0', 'ENDTAB')

  // Layer table — collect unique layers from features
  const usedLayers = new Set<string>()
  for (const f of result.features) usedLayers.add(f.layer)
  for (const s of result.isolatedSymbols) usedLayers.add(s.definition.layer)

  lines.push('0', 'TABLE', '2', 'LAYER', '70', String(usedLayers.size + 1))
  lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'Continuous') // Default layer
  for (const layerName of usedLayers) {
    // Find the first definition using this layer to get its color
    const def = result.features.find((f) => f.layer === layerName) ??
                result.isolatedSymbols.find((s) => s.definition.layer === layerName)
    const colorIdx = def
      ? ('colorIndex' in def ? def.colorIndex : def.definition.colorIndex)
      : 7
    lines.push('0', 'LAYER', '2', layerName, '70', '0', '62', String(colorIdx), '6', 'Continuous')
  }
  lines.push('0', 'ENDTAB')
  lines.push('0', 'ENDSEC')

  // ENTITIES section
  lines.push('0', 'SECTION', '2', 'ENTITIES')

  // Linework features as LWPOLYLINE
  for (const feature of result.features) {
    const pts = feature.points
    if (pts.length < 2) continue

    lines.push('0', 'LWPOLYLINE')
    lines.push('8', feature.layer)         // Layer
    lines.push('6', feature.lineType)       // Linetype
    lines.push('62', String(feature.colorIndex)) // Color
    lines.push('90', String(pts.length))    // Number of vertices
    lines.push('70', feature.isClosed ? '1' : '0') // Closed flag

    for (const pt of pts) {
      lines.push('10', pt.easting.toFixed(3))  // X
      lines.push('20', pt.northing.toFixed(3)) // Y
      if (pt.elevation !== undefined) {
        lines.push('30', pt.elevation.toFixed(3)) // Z
      }
    }
  }

  // Isolated symbols as CIRCLE entities
  for (const { point, definition } of result.isolatedSymbols) {
    lines.push('0', 'CIRCLE')
    lines.push('8', definition.layer)
    lines.push('62', String(definition.colorIndex))
    lines.push('10', point.easting.toFixed(3))
    lines.push('20', point.northing.toFixed(3))
    lines.push('30', (point.elevation ?? 0).toFixed(3))
    lines.push('40', definition.symbolSize.toFixed(1)) // Radius

    // Point label as TEXT
    lines.push('0', 'TEXT')
    lines.push('8', definition.layer)
    lines.push('62', String(definition.colorIndex))
    lines.push('10', (point.easting + definition.symbolSize * 1.5).toFixed(3))
    lines.push('20', point.northing.toFixed(3))
    lines.push('30', (point.elevation ?? 0).toFixed(3))
    lines.push('40', '1.5') // Text height
    lines.push('1', point.name) // Text content
  }

  // Unmatched points as plain POINTs on layer 0
  for (const point of result.unmatchedPoints) {
    lines.push('0', 'POINT')
    lines.push('8', '0')
    lines.push('10', point.easting.toFixed(3))
    lines.push('20', point.northing.toFixed(3))
    lines.push('30', (point.elevation ?? 0).toFixed(3))
  }

  lines.push('0', 'ENDSEC')
  lines.push('0', 'EOF')

  return lines.join('\n')
}
