import type { BoundingBox2D, CadCoordinate, ExtractedCadEntity, ParsedInput } from './types'

interface DxfPair {
  code: number
  value: string
}

type CadEntity = ExtractedCadEntity

interface DxfSection {
  name: string
  pairs: DxfPair[]
}

const UNIT_NAMES: Record<number, string> = {
  0: 'unitless',
  1: 'inches',
  2: 'feet',
  3: 'miles',
  4: 'millimeters',
  5: 'centimeters',
  6: 'meters',
  7: 'kilometers',
  8: 'microinches',
  9: 'mils',
  10: 'yards',
  11: 'angstroms',
  12: 'nanometers',
  13: 'microns',
  14: 'decimeters',
  15: 'dekameters',
  16: 'hectometers',
  17: 'gigameters',
  18: 'astronomical units',
  19: 'light years',
  20: 'parsecs',
  21: 'US survey feet',
  22: 'US survey inches',
  23: 'US survey yards',
  24: 'US survey miles',
}

const SPATIAL_ENTITY_KINDS = new Set([
  'POINT', 'LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'TEXT', 'MTEXT',
])

function readPairs(content: string): { pairs: DxfPair[]; malformedLines: number } {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const pairs: DxfPair[] = []
  let malformedLines = 0

  for (let i = 0; i < lines.length;) {
    const codeText = lines[i]?.trim() ?? ''
    if (codeText === '' && i === lines.length - 1) break
    const code = Number(codeText)
    const value = lines[i + 1]
    if (!/^-?\d+$/.test(codeText) || !Number.isInteger(code) || code < -5 || code > 1071 || value === undefined) {
      malformedLines += 1
      i += value === undefined ? 1 : 2
      continue
    }
    pairs.push({ code, value: value.trim() })
    i += 2
  }

  return { pairs, malformedLines }
}

function readSections(pairs: DxfPair[]): DxfSection[] {
  const sections: DxfSection[] = []
  let i = 0

  while (i < pairs.length - 1) {
    if (pairs[i]?.code !== 0 || pairs[i]?.value !== 'SECTION') {
      i += 1
      continue
    }

    const sectionName = pairs[i + 1]?.code === 2 ? pairs[i + 1].value.toUpperCase() : ''
    const start = i + 2
    let end = start
    while (end < pairs.length && !(pairs[end]?.code === 0 && pairs[end]?.value === 'ENDSEC')) end += 1
    sections.push({ name: sectionName, pairs: pairs.slice(start, end) })
    i = end + 1
  }

  return sections
}

function firstValue(pairs: DxfPair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value
}

function numberValue(pairs: DxfPair[], code: number): number | undefined {
  const value = firstValue(pairs, code)
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function makeCoordinate(x: number | undefined, y: number | undefined, z?: number): CadCoordinate | undefined {
  if (x === undefined || y === undefined) return undefined
  return { easting: x, northing: y, ...(z !== undefined ? { elevation: z } : {}) }
}

function getExtrusion(pairs: DxfPair[]): [number, number, number] | undefined {
  const x = numberValue(pairs, 210)
  const y = numberValue(pairs, 220)
  const z = numberValue(pairs, 230)
  if (x === undefined && y === undefined && z === undefined) return undefined
  return [x ?? 0, y ?? 0, z ?? 1]
}

function readLightweightPolyline(pairs: DxfPair[]): CadCoordinate[] {
  const xs = pairs.filter((pair) => pair.code === 10).map((pair) => Number(pair.value))
  const ys = pairs.filter((pair) => pair.code === 20).map((pair) => Number(pair.value))
  const elevation = numberValue(pairs, 38)
  const coordinates: CadCoordinate[] = []

  for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
    const coordinate = makeCoordinate(xs[i], ys[i], elevation)
    if (coordinate) coordinates.push(coordinate)
  }

  return coordinates
}

function readVertex(pairs: DxfPair[]): CadCoordinate | undefined {
  return makeCoordinate(numberValue(pairs, 10), numberValue(pairs, 20), numberValue(pairs, 30))
}

function readEntity(kind: string, pairs: DxfPair[], polylineVertices?: CadCoordinate[]): CadEntity {
  const layer = firstValue(pairs, 8)
  const coordinates: CadCoordinate[] = []
  const extrusion = getExtrusion(pairs)
  const entity: CadEntity = {
    kind,
    ...(layer ? { layer } : {}),
    coordinates,
    ...(extrusion ? { extrusion } : {}),
  }

  switch (kind) {
    case 'LINE': {
      const start = makeCoordinate(numberValue(pairs, 10), numberValue(pairs, 20), numberValue(pairs, 30))
      const end = makeCoordinate(numberValue(pairs, 11), numberValue(pairs, 21), numberValue(pairs, 31))
      if (start) coordinates.push(start)
      if (end) coordinates.push(end)
      break
    }
    case 'LWPOLYLINE':
      coordinates.push(...readLightweightPolyline(pairs))
      entity.closed = ((numberValue(pairs, 70) ?? 0) & 1) === 1
      break
    case 'POLYLINE':
      coordinates.push(...(polylineVertices ?? []))
      entity.closed = ((numberValue(pairs, 70) ?? 0) & 1) === 1
      break
    case 'POINT': {
      const point = makeCoordinate(numberValue(pairs, 10), numberValue(pairs, 20), numberValue(pairs, 30))
      if (point) coordinates.push(point)
      break
    }
    case 'CIRCLE':
    case 'ARC': {
      const center = makeCoordinate(numberValue(pairs, 10), numberValue(pairs, 20), numberValue(pairs, 30))
      if (center) coordinates.push(center)
      entity.radius = numberValue(pairs, 40)
      if (kind === 'ARC') {
        entity.startAngle = numberValue(pairs, 50)
        entity.endAngle = numberValue(pairs, 51)
      }
      break
    }
    case 'TEXT':
    case 'MTEXT': {
      const insertion = makeCoordinate(numberValue(pairs, 10), numberValue(pairs, 20), numberValue(pairs, 30))
      if (insertion) coordinates.push(insertion)
      const chunks = pairs.filter((pair) => pair.code === 3 || pair.code === 1).map((pair) => pair.value)
      entity.text = chunks.join('')
      break
    }
  }

  return entity
}

function readEntities(section: DxfSection): { entities: CadEntity[]; malformedPolylines: number } {
  const entities: CadEntity[] = []
  let malformedPolylines = 0
  let i = 0

  while (i < section.pairs.length) {
    const header = section.pairs[i]
    if (header?.code !== 0) {
      i += 1
      continue
    }

    const kind = header.value.toUpperCase()
    let next = i + 1
    while (next < section.pairs.length && section.pairs[next]?.code !== 0) next += 1
    const fields = section.pairs.slice(i + 1, next)

    if (kind === 'POLYLINE') {
      const vertices: CadCoordinate[] = []
      let cursor = next
      let sawSequenceEnd = false

      while (cursor < section.pairs.length && section.pairs[cursor]?.code === 0) {
        const childKind = section.pairs[cursor]?.value.toUpperCase()
        let childEnd = cursor + 1
        while (childEnd < section.pairs.length && section.pairs[childEnd]?.code !== 0) childEnd += 1
        const childFields = section.pairs.slice(cursor + 1, childEnd)

        if (childKind === 'VERTEX') {
          const vertex = readVertex(childFields)
          if (vertex) vertices.push(vertex)
          cursor = childEnd
          continue
        }
        if (childKind === 'SEQEND') {
          cursor = childEnd
          sawSequenceEnd = true
        }
        break
      }

      if (!sawSequenceEnd) malformedPolylines += 1
      entities.push(readEntity(kind, fields, vertices))
      i = cursor
      continue
    }

    if (kind !== 'ENDSEC' && kind !== 'SEQEND' && kind !== 'VERTEX') {
      entities.push(readEntity(kind, fields))
    }
    i = next
  }

  return { entities, malformedPolylines }
}

function readUnits(header: DxfSection | undefined): number | null {
  if (!header) return null
  for (let i = 0; i < header.pairs.length; i += 1) {
    if (header.pairs[i]?.code !== 9 || header.pairs[i]?.value !== '$INSUNITS') continue
    for (let j = i + 1; j < header.pairs.length && header.pairs[j]?.code !== 9; j += 1) {
      if (header.pairs[j]?.code !== 70) continue
      const value = Number(header.pairs[j].value)
      return Number.isInteger(value) ? value : null
    }
  }
  return null
}

function arcAngleContains(angle: number, start: number, end: number): boolean {
  const normalizedStart = ((start % 360) + 360) % 360
  const normalizedEnd = ((end % 360) + 360) % 360
  const normalizedAngle = ((angle % 360) + 360) % 360
  const span = (normalizedEnd - normalizedStart + 360) % 360
  const offset = (normalizedAngle - normalizedStart + 360) % 360
  return offset <= span
}

function getExtentCoordinates(entity: CadEntity): CadCoordinate[] {
  const center = entity.coordinates[0]
  if (!center || entity.radius === undefined || !Number.isFinite(entity.radius) || entity.radius < 0) {
    return entity.coordinates
  }

  const radius = entity.radius
  if (entity.kind === 'CIRCLE') {
    return [
      { easting: center.easting - radius, northing: center.northing - radius },
      { easting: center.easting + radius, northing: center.northing + radius },
    ]
  }

  if (entity.kind !== 'ARC' || entity.startAngle === undefined || entity.endAngle === undefined) {
    return entity.coordinates
  }

  const angles = [entity.startAngle, entity.endAngle]
  for (const cardinal of [0, 90, 180, 270]) {
    if (arcAngleContains(cardinal, entity.startAngle, entity.endAngle)) angles.push(cardinal)
  }
  return angles.map((degrees) => {
    const radians = degrees * Math.PI / 180
    return {
      easting: center.easting + radius * Math.cos(radians),
      northing: center.northing + radius * Math.sin(radians),
    }
  })
}

function computeBoundingBox(entities: CadEntity[]): BoundingBox2D | undefined {
  const coordinates = entities.flatMap(getExtentCoordinates)
    .filter((point) => Number.isFinite(point.easting) && Number.isFinite(point.northing))
  if (coordinates.length === 0) return undefined

  return coordinates.reduce<BoundingBox2D>((bounds, point) => ({
    minEasting: Math.min(bounds.minEasting, point.easting),
    maxEasting: Math.max(bounds.maxEasting, point.easting),
    minNorthing: Math.min(bounds.minNorthing, point.northing),
    maxNorthing: Math.max(bounds.maxNorthing, point.northing),
  }), {
    minEasting: Infinity,
    maxEasting: -Infinity,
    minNorthing: Infinity,
    maxNorthing: -Infinity,
  })
}

function isDefaultExtrusion(entity: CadEntity): boolean {
  if (!entity.extrusion) return true
  const [x, y, z] = entity.extrusion
  return Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12 && Math.abs(z - 1) < 1e-12
}

export async function parseDXFFileContent(content: string, filename: string): Promise<ParsedInput> {
  const sourceFileSize = Buffer.byteLength(content, 'utf8')
  const base: ParsedInput = {
    type: 'DXF',
    sourceFileName: filename,
    sourceFileSize,
    sourceFileLastModified: Date.now(),
    parsedAt: new Date().toISOString(),
    version: '2.0.0',
    errors: [],
    warnings: [],
    confidence: 0,
  }

  if (content.startsWith('AutoCAD Binary DXF')) {
    return { ...base, errors: ['Binary DXF is not supported. Export the drawing as ASCII DXF and try again.'] }
  }

  const { pairs, malformedLines } = readPairs(content)
  const sections = readSections(pairs)
  const header = sections.find((section) => section.name === 'HEADER')
  const entitiesSection = sections.find((section) => section.name === 'ENTITIES')
  if (!entitiesSection) {
    return { ...base, errors: ['The file has no DXF ENTITIES section, so no drawing geometry could be read.'] }
  }

  const parsedEntities = readEntities(entitiesSection)
  const entities = parsedEntities.entities
  const unitCode = readUnits(header)
  const units = unitCode === null ? null : UNIT_NAMES[unitCode] ?? `unknown units code ${unitCode}`
  const bbox = computeBoundingBox(entities)
  const layerNames = [...new Set(entities.map((entity) => entity.layer).filter((layer): layer is string => Boolean(layer)))].sort()
  const typeCounts = entities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.kind] = (counts[entity.kind] ?? 0) + 1
    return counts
  }, {})
  const unsupportedKinds = Object.keys(typeCounts).filter((kind) => !SPATIAL_ENTITY_KINDS.has(kind)).sort()
  const warnings: string[] = [
    'No coordinate reference system was interpreted from the DXF. Coordinates remain in drawing space and are not ready for map overlay or set-out until the CRS is confirmed.',
  ]

  if (unitCode === null) {
    warnings.push('The DXF does not declare $INSUNITS. Coordinate units are unknown; no scale conversion was applied.')
  } else if (unitCode === 0) {
    warnings.push('The DXF declares unitless coordinates. Confirm the drawing units before measuring or setting out.')
  } else if (!UNIT_NAMES[unitCode]) {
    warnings.push(`The DXF uses unrecognized $INSUNITS code ${unitCode}. Coordinate units could not be interpreted.`)
  }
  if (malformedLines > 0) warnings.push(`${malformedLines} malformed DXF group-code line(s) were skipped.`)
  if (parsedEntities.malformedPolylines > 0) warnings.push(`${parsedEntities.malformedPolylines} POLYLINE sequence(s) had no SEQEND marker; review the imported vertices.`)
  if (unsupportedKinds.length > 0) {
    warnings.push(`These entity types were counted but not converted to survey geometry: ${unsupportedKinds.join(', ')}.`)
  }
  if (entities.some((entity) => entity.kind === 'INSERT')) {
    warnings.push('Block INSERT references were not expanded; geometry stored inside blocks is not included in the feature geometry.')
  }
  if (entities.some((entity) => !isDefaultExtrusion(entity))) {
    warnings.push('One or more entities use a non-default object coordinate system. Their coordinates were preserved without transformation to world coordinates.')
  }
  if (entities.length === 0) warnings.push('The DXF ENTITIES section is empty.')

  return {
    ...base,
    cad: {
      entities,
      entityCount: entities.length,
      typeCounts,
      layers: layerNames,
      units,
      unitCode,
      coordinateReferenceSystem: null,
      boundingBox: bbox,
    },
    warnings,
  }
}

export function parseDXFBuffer(buffer: Buffer, filename: string): Promise<ParsedInput> {
  return parseDXFFileContent(buffer.toString('utf8'), filename)
}
