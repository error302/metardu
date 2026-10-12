export type DxfCoordinate = [number, number] | [number, number, number]

export type DxfGeometryEntity = {
  kind: 'point' | 'line' | 'polyline' | 'label'
  coordinates: DxfCoordinate[]
  closed: boolean
  layer: string
  handle?: string
  text?: string
}

export interface DxfLinearUnits {
  code: number | null
  label: string
  metresPerUnit: number | null
}

export interface DxfGeometryDocument {
  entities: DxfGeometryEntity[]
  units: DxfLinearUnits
  warnings: string[]
}

interface DxfPair {
  code: number
  value: string
}

interface DxfRecord {
  type: string
  values: DxfPair[]
}

const MAX_DXF_ENTITIES = 100_000
const CIRCLE_SEGMENTS = 64

const UNIT_BY_CODE: Record<number, { label: string; metresPerUnit: number }> = {
  1: { label: 'inches', metresPerUnit: 0.0254 },
  2: { label: 'feet', metresPerUnit: 0.3048 },
  3: { label: 'miles', metresPerUnit: 1609.344 },
  4: { label: 'millimetres', metresPerUnit: 0.001 },
  5: { label: 'centimetres', metresPerUnit: 0.01 },
  6: { label: 'metres', metresPerUnit: 1 },
  7: { label: 'kilometres', metresPerUnit: 1000 },
  8: { label: 'microinches', metresPerUnit: 0.0000000254 },
  9: { label: 'mils', metresPerUnit: 0.0000254 },
  10: { label: 'yards', metresPerUnit: 0.9144 },
  11: { label: 'angstroms', metresPerUnit: 1e-10 },
  12: { label: 'nanometres', metresPerUnit: 1e-9 },
  13: { label: 'microns', metresPerUnit: 1e-6 },
  14: { label: 'decimetres', metresPerUnit: 0.1 },
  15: { label: 'decametres', metresPerUnit: 10 },
  16: { label: 'hectometres', metresPerUnit: 100 },
  17: { label: 'gigametres', metresPerUnit: 1e9 },
  18: { label: 'astronomical units', metresPerUnit: 149_597_870_700 },
  19: { label: 'light years', metresPerUnit: 9.4607304725808e15 },
  20: { label: 'parsecs', metresPerUnit: 3.085677581491367e16 },
  21: { label: 'US survey feet', metresPerUnit: 1200 / 3937 },
}

function parsePairs(content: string): DxfPair[] {
  if (content.includes('\0')) throw new Error('Binary DXF is not supported by the browser importer. Save the drawing as ASCII DXF.')

  const lines = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length < 4 || lines.length % 2 !== 0) throw new Error('The DXF file is incomplete or malformed.')

  const pairs: DxfPair[] = []
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number(lines[index].trim())
    if (!Number.isInteger(code)) throw new Error(`Invalid DXF group code at line ${index + 1}.`)
    pairs.push({ code, value: lines[index + 1].trimEnd() })
  }
  return pairs
}

function entityRecords(pairs: DxfPair[]): DxfRecord[] {
  const records: DxfRecord[] = []
  let section = ''
  let current: DxfRecord | null = null

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    if (pair.code === 0 && pair.value === 'SECTION') {
      current = null
      section = pairs[index + 1]?.code === 2 ? pairs[index + 1].value : ''
      index += 1
      continue
    }
    if (pair.code === 0 && pair.value === 'ENDSEC') {
      if (section === 'ENTITIES' && current) records.push(current)
      current = null
      section = ''
      continue
    }
    if (section !== 'ENTITIES') continue
    if (pair.code === 0) {
      if (current) records.push(current)
      current = { type: pair.value.toUpperCase(), values: [] }
    } else if (current) {
      current.values.push(pair)
    }
  }

  if (records.length > MAX_DXF_ENTITIES) {
    throw new Error(`The drawing exceeds the ${MAX_DXF_ENTITIES.toLocaleString()}-entity browser import limit.`)
  }
  return records
}

function readNumber(record: DxfRecord, code: number, required = false): number | undefined {
  const pair = record.values.find((item) => item.code === code)
  if (!pair) {
    if (required) throw new Error(`${record.type} entity is missing coordinate group ${code}.`)
    return undefined
  }
  const value = Number(pair.value)
  if (!Number.isFinite(value)) throw new Error(`${record.type} entity has a non-finite coordinate in group ${code}.`)
  return value
}

function readCoordinate(record: DxfRecord, xCode: number, yCode: number, zCode: number): DxfCoordinate {
  const x = readNumber(record, xCode, true) as number
  const y = readNumber(record, yCode, true) as number
  const z = readNumber(record, zCode)
  return z === undefined ? [x, y] : [x, y, z]
}

function recordLayer(record: DxfRecord, fallback?: string): string {
  return record.values.find((pair) => pair.code === 8)?.value.trim() || fallback || '0'
}

function recordHandle(record: DxfRecord): string | undefined {
  return record.values.find((pair) => pair.code === 5)?.value.trim() || undefined
}

function readUnits(pairs: DxfPair[]): DxfLinearUnits {
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code !== 9 || pairs[index].value.trim() !== '$INSUNITS') continue
    for (let next = index + 1; next < pairs.length && pairs[next].code !== 9 && pairs[next].code !== 0; next += 1) {
      if (pairs[next].code !== 70) continue
      const code = Number(pairs[next].value)
      if (!Number.isInteger(code)) return { code: null, label: 'unknown', metresPerUnit: null }
      if (code === 0) return { code, label: 'unitless', metresPerUnit: null }
      const unit = UNIT_BY_CODE[code]
      return unit
        ? { code, ...unit }
        : { code, label: `unsupported unit code ${code}`, metresPerUnit: null }
    }
    return { code: null, label: 'unspecified', metresPerUnit: null }
  }
  return { code: null, label: 'unspecified', metresPerUnit: null }
}

function appendEntity(
  entities: DxfGeometryEntity[],
  record: DxfRecord,
  kind: DxfGeometryEntity['kind'],
  coordinates: DxfCoordinate[],
  closed = false,
  text?: string,
  layer = recordLayer(record),
) {
  if (coordinates.length === 0) return
  entities.push({ kind, coordinates, closed, layer, handle: recordHandle(record), text })
}

function readLightweightPolyline(record: DxfRecord, warnings: string[]): DxfGeometryEntity | null {
  const vertices: Array<{ x: number; y?: number }> = []
  for (const pair of record.values) {
    if (pair.code === 42 && Number(pair.value) !== 0) {
      if (!warnings.some((warning) => warning.startsWith('LWPOLYLINE '))) {
        warnings.push('LWPOLYLINE bulged arc segments were skipped rather than flattened.')
      }
      return null
    }
    if (pair.code === 10) {
      const x = Number(pair.value)
      if (!Number.isFinite(x)) throw new Error('LWPOLYLINE contains a non-finite easting.')
      vertices.push({ x })
    } else if (pair.code === 20) {
      const y = Number(pair.value)
      if (!Number.isFinite(y) || vertices.length === 0 || vertices[vertices.length - 1].y !== undefined) {
        throw new Error('LWPOLYLINE contains malformed coordinate pairs.')
      }
      vertices[vertices.length - 1].y = y
    }
  }

  if (vertices.some((point) => point.y === undefined)) throw new Error('LWPOLYLINE contains an incomplete coordinate pair.')
  const elevation = readNumber(record, 38)
  const coordinates: DxfCoordinate[] = vertices.map((point) => elevation === undefined
    ? [point.x, point.y as number]
    : [point.x, point.y as number, elevation])
  const closed = ((readNumber(record, 70) || 0) & 1) === 1
  if (coordinates.length < (closed ? 3 : 2)) throw new Error('LWPOLYLINE has too few vertices.')
  return {
    kind: 'polyline', coordinates, closed,
    layer: recordLayer(record), handle: recordHandle(record),
  }
}

function readClassicPolyline(records: DxfRecord[], start: number, warnings: string[]): { entity: DxfGeometryEntity | null; next: number } {
  const header = records[start]
  const flags = readNumber(header, 70) || 0
  const vertices: DxfCoordinate[] = []
  let index = start + 1

  while (index < records.length && records[index].type !== 'SEQEND') {
    const vertex = records[index]
    if (vertex.type !== 'VERTEX') break
    if (vertex.values.some((pair) => pair.code === 42 && Number(pair.value) !== 0)) {
      if (!warnings.some((warning) => warning.startsWith('POLYLINE '))) {
        warnings.push('POLYLINE bulged arc segments were skipped rather than flattened.')
      }
      while (index < records.length && records[index].type !== 'SEQEND') index += 1
      return { entity: null, next: Math.min(index + 1, records.length) }
    }
    vertices.push(readCoordinate(vertex, 10, 20, 30))
    index += 1
  }

  if (records[index]?.type === 'SEQEND') index += 1
  const closed = (flags & 1) === 1
  if (vertices.length < (closed ? 3 : 2)) throw new Error('POLYLINE has too few vertices.')
  return {
    entity: {
      kind: 'polyline', coordinates: vertices, closed,
      layer: recordLayer(header), handle: recordHandle(header),
    },
    next: index,
  }
}

function sampleArc(
  record: DxfRecord,
  startAngleDegrees: number,
  endAngleDegrees: number,
  closed: boolean,
): DxfCoordinate[] {
  const center = readCoordinate(record, 10, 20, 30)
  const radius = readNumber(record, 40, true) as number
  if (radius <= 0) throw new Error(`${record.type} has an invalid radius.`)

  let endAngle = endAngleDegrees
  while (endAngle <= startAngleDegrees) endAngle += 360
  const span = endAngle - startAngleDegrees
  const segments = closed ? CIRCLE_SEGMENTS : Math.max(2, Math.ceil(span / 5))
  const count = closed ? segments : segments + 1
  const points: DxfCoordinate[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = ((startAngleDegrees + (span * index) / segments) * Math.PI) / 180
    const x = center[0] + radius * Math.cos(angle)
    const y = center[1] + radius * Math.sin(angle)
    points.push(center.length === 3 ? [x, y, center[2]] : [x, y])
  }
  return closed ? [...points, points[0]] : points
}

function readEntityRecords(records: DxfRecord[]): { entities: DxfGeometryEntity[]; warnings: string[] } {
  const entities: DxfGeometryEntity[] = []
  const warnings: string[] = []
  const unsupported = new Map<string, number>()

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    switch (record.type) {
      case 'POINT':
        appendEntity(entities, record, 'point', [readCoordinate(record, 10, 20, 30)])
        break
      case 'LINE':
        appendEntity(entities, record, 'line', [
          readCoordinate(record, 10, 20, 30),
          readCoordinate(record, 11, 21, 31),
        ])
        break
      case 'LWPOLYLINE': {
        const entity = readLightweightPolyline(record, warnings)
        if (entity) entities.push(entity)
        break
      }
      case 'POLYLINE': {
        const result = readClassicPolyline(records, index, warnings)
        if (result.entity) entities.push(result.entity)
        index = result.next - 1
        break
      }
      case 'CIRCLE': {
        const coordinates = sampleArc(record, 0, 360, true)
        appendEntity(entities, record, 'polyline', coordinates, true)
        break
      }
      case 'ARC': {
        const start = readNumber(record, 50, true) as number
        const end = readNumber(record, 51, true) as number
        appendEntity(entities, record, 'polyline', sampleArc(record, start, end, false))
        break
      }
      case 'TEXT':
      case 'MTEXT': {
        const anchor = readCoordinate(record, 10, 20, 30)
        const text = record.values.filter((pair) => pair.code === 1 || (record.type === 'MTEXT' && pair.code === 3))
          .map((pair) => pair.value).join('').replace(/\\P/g, '\n').trim()
        if (text) appendEntity(entities, record, 'label', [anchor], false, text)
        break
      }
      case '3DFACE': {
        const coordinates = [10, 11, 12, 13].map((code) => {
          const x = readNumber(record, code)
          const y = readNumber(record, code + 10)
          const z = readNumber(record, code + 20)
          if (x === undefined || y === undefined) return null
          return z === undefined ? [x, y] as DxfCoordinate : [x, y, z] as DxfCoordinate
        }).filter((coordinate): coordinate is DxfCoordinate => coordinate !== null)
        if (coordinates.length >= 3) {
          const first = coordinates[0]
          const last = coordinates[coordinates.length - 1]
          if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first)
          appendEntity(entities, record, 'polyline', coordinates, true)
        }
        break
      }
      case 'VERTEX':
      case 'SEQEND':
        // Structural records are consumed by POLYLINE above.
        break
      default:
        unsupported.set(record.type, (unsupported.get(record.type) || 0) + 1)
    }
  }

  for (const [type, count] of unsupported) {
    warnings.push(`${count} ${type} ${count === 1 ? 'entity' : 'entities'} skipped; this importer preserves points, lines, polylines, circles, arcs, 3D faces, and text only.`)
  }
  return { entities, warnings }
}

/** Read common ASCII DXF entities while preserving layer, closure, handle, and text metadata. */
export function parseDxfGeometry(content: string): DxfGeometryDocument {
  const pairs = parsePairs(content)
  const records = entityRecords(pairs)
  if (records.length === 0) throw new Error('No DXF ENTITIES section was found.')
  const parsed = readEntityRecords(records)
  return {
    ...parsed,
    units: readUnits(pairs),
  }
}
