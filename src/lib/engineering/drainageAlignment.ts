export interface DrainageAlignmentVertex {
  easting: number
  northing: number
}

export interface ParsedDrainageAlignment {
  vertices: DrainageAlignmentVertex[]
  issues: string[]
}

export interface DrainageMapAlignmentSource {
  kind: 'saved_project_map_line'
  featureKey: string
  label: string
  sourceCrs: 'EPSG:4326'
  projectCrs: string
  orientation: 'digitized' | 'reversed'
  startConnectorM: number
  endConnectorM: number
  editedAfterImport?: boolean
}

export interface OrientedDrainageMapAlignment {
  vertices: DrainageAlignmentVertex[]
  orientation: DrainageMapAlignmentSource['orientation']
  startConnectorM: number
  endConnectorM: number
}

/** Parse one projected Easting,Northing pair per line; blank lines are ignored. */
export function parseDrainageAlignmentVertices(text: string): ParsedDrainageAlignment {
  const vertices: DrainageAlignmentVertex[] = []
  const issues: string[] = []

  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const values = trimmed.split(',').map(value => value.trim())
    if (values.length !== 2 || values.some(value => value === '')) {
      issues.push(`Alignment line ${index + 1}: enter exactly two comma-separated values as Easting,Northing.`)
      return
    }
    const easting = Number(values[0])
    const northing = Number(values[1])
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
      issues.push(`Alignment line ${index + 1}: Easting and Northing must be finite numbers.`)
      return
    }
    vertices.push({ easting, northing })
  })

  return { vertices, issues }
}

export function formatDrainageAlignmentVertices(vertices: DrainageAlignmentVertex[] | undefined): string {
  return (vertices ?? []).map(vertex => `${vertex.easting},${vertex.northing}`).join('\n')
}

/**
 * Orient a saved project line from the upstream manhole toward the downstream
 * manhole. The line endpoints are removed only when they coincide with the
 * entered manhole coordinates to within one micrometre; otherwise the
 * connector segments remain part of the route and its chainage check.
 */
export function orientDrainageMapAlignment(
  vertices: DrainageAlignmentVertex[],
  start: DrainageAlignmentVertex,
  end: DrainageAlignmentVertex,
): OrientedDrainageMapAlignment {
  if (vertices.length < 2) throw new Error('A saved map alignment needs at least two vertices.')
  const distance = (a: DrainageAlignmentVertex, b: DrainageAlignmentVertex) =>
    Math.hypot(a.easting - b.easting, a.northing - b.northing)
  const forwardCost = distance(vertices[0], start) + distance(vertices[vertices.length - 1], end)
  const reverseCost = distance(vertices[vertices.length - 1], start) + distance(vertices[0], end)
  const orientation: OrientedDrainageMapAlignment['orientation'] = reverseCost < forwardCost ? 'reversed' : 'digitized'
  const ordered = orientation === 'reversed' ? [...vertices].reverse() : [...vertices]
  const startConnectorM = distance(start, ordered[0])
  const endConnectorM = distance(ordered[ordered.length - 1], end)
  const interior = ordered.slice()
  if (startConnectorM <= 1e-6) interior.shift()
  if (endConnectorM <= 1e-6) interior.pop()
  return { vertices: interior, orientation, startConnectorM, endConnectorM }
}

export function isDrainageMapAlignmentSource(value: unknown): value is DrainageMapAlignmentSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<DrainageMapAlignmentSource>
  return source.kind === 'saved_project_map_line'
    && typeof source.featureKey === 'string'
    && source.featureKey.length > 0
    && typeof source.label === 'string'
    && source.sourceCrs === 'EPSG:4326'
    && typeof source.projectCrs === 'string'
    && (source.orientation === 'digitized' || source.orientation === 'reversed')
    && Number.isFinite(source.startConnectorM)
    && Number.isFinite(source.endConnectorM)
    && (source.editedAfterImport === undefined || typeof source.editedAfterImport === 'boolean')
}
