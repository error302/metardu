import type { ParsedSurveyData } from '../droneTypes'

const MAX_POINTS = 100_000
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_HEADER_BYTES = 64 * 1024

/** Read ASCII PLY 1.0 vertices and reject binary variants explicitly. */
export async function parsePly(file: File): Promise<ParsedSurveyData> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('PLY uploads are limited to 32 MiB in the web point-cloud tool.')
  }
  if (file.size === 0) throw new Error('The PLY file is empty.')

  const headerBuffer = await file.slice(0, Math.min(file.size, MAX_HEADER_BYTES)).arrayBuffer()
  const headerText = new TextDecoder('ascii').decode(headerBuffer)
  const marker = /(?:^|\r?\n)end_header\r?\n/.exec(headerText)
  if (!marker || marker.index === undefined) {
    throw new Error('Invalid PLY file: end_header was not found in the first 64 KiB.')
  }

  const headerEnd = marker.index + marker[0].length
  const headerLines = headerText.slice(0, headerEnd).split(/\r?\n/)
  if (headerLines[0]?.trim() !== 'ply') throw new Error('Invalid PLY file signature.')
  const format = headerLines.find(line => line.startsWith('format '))?.trim()
  if (format !== 'format ascii 1.0') {
    throw new Error('This web importer supports ASCII PLY 1.0 only. Convert binary PLY to ASCII or XYZ first.')
  }

  const elements: Array<{ name: string; count: number }> = []
  let currentElement = ''
  const vertexProperties: string[] = []
  for (const line of headerLines) {
    const elementMatch = /^element\s+(\S+)\s+(\d+)\s*$/.exec(line.trim())
    if (elementMatch) {
      currentElement = elementMatch[1]
      elements.push({ name: currentElement, count: Number(elementMatch[2]) })
      if (!Number.isSafeInteger(Number(elementMatch[2]))) throw new Error('Invalid PLY element count.')
      continue
    }
    if (currentElement === 'vertex' && /^property\s+list\b/.test(line.trim())) {
      throw new Error('PLY vertex list properties are not supported by the web importer.')
    }
    const propertyMatch = /^property\s+\S+\s+(\S+)\s*$/.exec(line.trim())
    if (currentElement === 'vertex' && propertyMatch) vertexProperties.push(propertyMatch[1].toLowerCase())
  }

  const vertexElementIndex = elements.findIndex(element => element.name === 'vertex')
  if (vertexElementIndex < 0) throw new Error('Invalid PLY file: no vertex element was declared.')
  const vertexCount = elements[vertexElementIndex].count
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) throw new Error('Invalid PLY vertex count.')
  const xIndex = vertexProperties.indexOf('x')
  const yIndex = vertexProperties.indexOf('y')
  const zIndex = vertexProperties.indexOf('z')
  if (xIndex < 0 || yIndex < 0 || zIndex < 0) {
    throw new Error('PLY vertices must declare scalar x, y, and z properties.')
  }

  const precedingRows = elements.slice(0, vertexElementIndex).reduce((sum, element) => sum + element.count, 0)
  const body = new TextDecoder().decode(await file.slice(headerEnd).arrayBuffer())
  const rows = body.split(/\r?\n/).filter(line => line.trim().length > 0)
  const points: ParsedSurveyData['points'] = []
  const requestedPoints = Math.min(vertexCount, MAX_POINTS)

  for (let index = 0; index < requestedPoints; index++) {
    const row = rows[precedingRows + index]
    if (!row) throw new Error(`PLY file ended before vertex ${index + 1} of ${vertexCount}.`)
    const values = row.trim().split(/\s+/)
    if (values.length < vertexProperties.length) {
      throw new Error(`PLY vertex ${index + 1} has fewer values than its header declares.`)
    }
    const easting = Number(values[xIndex])
    const northing = Number(values[yIndex])
    const rl = Number(values[zIndex])
    if (![easting, northing, rl].every(Number.isFinite)) {
      throw new Error(`PLY vertex ${index + 1} contains a non-numeric coordinate.`)
    }
    points.push({
      easting,
      northing,
      rl,
      code: 'DRONE-PLY',
      description: 'Point cloud vertex',
    })
  }

  return {
    points,
    metadata: {
      source: 'PLY Point Cloud',
      format: 'PLY ASCII 1.0',
      totalPoints: vertexCount,
      processedPoints: points.length,
      truncated: points.length < vertexCount,
      droneSpecific: { flightDate: new Date().toISOString() },
    },
  }
}
