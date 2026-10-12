export type Coordinate2D = [number, number]

export type MapDxfEntity =
  | { kind: 'point'; coordinates: Coordinate2D; label?: string; sourceLayer?: string }
  | { kind: 'label'; coordinates: Coordinate2D; text: string; sourceLayer?: string }
  | { kind: 'line'; coordinates: Coordinate2D[]; label?: string; sourceLayer?: string }
  | { kind: 'boundary'; coordinates: Coordinate2D[]; label?: string; sourceLayer?: string }

/** Small structural surface so the converter stays independent of OpenLayers at runtime. */
export interface MapDxfGeometryLike {
  getType(): string
  getCoordinates?: () => unknown
  getCenter?: () => unknown
  getRadius?: () => number
  getGeometries?: () => MapDxfGeometryLike[]
}

export interface MapDxfFeatureLike {
  geometry: MapDxfGeometryLike | null
  label?: string
  dxfLayer?: string
  dxfClosed?: boolean
  dxfEntityType?: string
}

const CIRCLE_SEGMENTS = 64

/**
 * Convert editable map geometry to explicit DXF entities. Every coordinate is
 * transformed by the caller so the export can use the declared project CRS.
 * Unsupported or malformed geometry fails the whole export rather than being
 * silently dropped from a survey deliverable.
 */
export function mapGeometryToDxfEntities(
  features: MapDxfFeatureLike[],
  transformCoordinate: (coordinate: Coordinate2D) => Coordinate2D,
): MapDxfEntity[] {
  const entities: MapDxfEntity[] = []

  const convertCoordinate = (value: unknown): Coordinate2D => {
    if (!Array.isArray(value) || value.length < 2 ||
        typeof value[0] !== 'number' || typeof value[1] !== 'number' ||
        !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
      throw new Error('A map feature contains an invalid coordinate; DXF export was cancelled.')
    }
    const transformed = transformCoordinate([value[0], value[1]])
    if (!Array.isArray(transformed) || transformed.length < 2 ||
        !Number.isFinite(transformed[0]) || !Number.isFinite(transformed[1])) {
      throw new Error('A map feature could not be transformed to the declared project CRS; DXF export was cancelled.')
    }
    return [transformed[0], transformed[1]]
  }

  const readCoordinates = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) throw new Error('A map feature has malformed geometry; DXF export was cancelled.')
    return value
  }

  const addPoint = (coordinate: unknown, label?: string, sourceLayer?: string) => {
    entities.push({ kind: 'point', coordinates: convertCoordinate(coordinate), label, sourceLayer })
  }

  const addLine = (coordinates: unknown, label?: string, boundary = false, sourceLayer?: string) => {
    const positions = readCoordinates(coordinates).map(convertCoordinate)
    if (boundary && positions.length > 0) {
      const first = positions[0]
      const last = positions[positions.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) positions.push(first)
    }
    if (positions.length < 2 || (boundary && positions.length < 4)) {
      throw new Error('A map line or boundary has too few vertices for DXF export.')
    }
    entities.push({
      kind: boundary ? 'boundary' : 'line',
      coordinates: positions,
      label,
      sourceLayer,
    })
  }

  const visitGeometry = (geometry: MapDxfGeometryLike, label?: string, sourceLayer?: string, closedLine = false) => {
    const type = geometry.getType()
    const coordinates = geometry.getCoordinates?.()

    switch (type) {
      case 'Point':
        addPoint(coordinates, label, sourceLayer)
        return
      case 'MultiPoint': {
        const points = readCoordinates(coordinates)
        points.forEach((point, index) => addPoint(point, points.length > 1 && label ? `${label}-${index + 1}` : label, sourceLayer))
        return
      }
      case 'LineString':
        addLine(coordinates, label, closedLine, sourceLayer)
        return
      case 'LinearRing':
        addLine(coordinates, label, true, sourceLayer)
        return
      case 'MultiLineString':
        readCoordinates(coordinates).forEach((line, index) => addLine(line, label && `${label}-${index + 1}`, closedLine, sourceLayer))
        return
      case 'Polygon':
        readCoordinates(coordinates).forEach((ring, index) => addLine(ring, label && `${label}${index === 0 ? '' : `-ring-${index + 1}`}`, true, sourceLayer))
        return
      case 'MultiPolygon':
        readCoordinates(coordinates).forEach((polygon, polygonIndex) => {
          readCoordinates(polygon).forEach((ring, ringIndex) => {
            const suffix = `${polygonIndex + 1}${ringIndex === 0 ? '' : `-ring-${ringIndex + 1}`}`
            addLine(ring, label && `${label}-${suffix}`, true, sourceLayer)
          })
        })
        return
      case 'Circle': {
        const center = geometry.getCenter?.()
        const radius = geometry.getRadius?.()
        if (!Array.isArray(center) || center.length < 2 ||
            typeof center[0] !== 'number' || typeof center[1] !== 'number' ||
            !Number.isFinite(center[0]) || !Number.isFinite(center[1]) ||
            typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
          throw new Error('A map circle is invalid; DXF export was cancelled.')
        }
        const ring = Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
          const angle = (index / CIRCLE_SEGMENTS) * Math.PI * 2
          return convertCoordinate([
            center[0] + Math.cos(angle) * radius,
            center[1] + Math.sin(angle) * radius,
          ])
        })
        addLine([...ring, ring[0]], label, true, sourceLayer)
        return
      }
      case 'GeometryCollection': {
        const geometries = geometry.getGeometries?.()
        if (!Array.isArray(geometries)) throw new Error('A geometry collection is malformed; DXF export was cancelled.')
        geometries.forEach((child, index) => visitGeometry(child, label && `${label}-${index + 1}`, sourceLayer))
        return
      }
      default:
        throw new Error(`DXF export does not support ${type || 'unknown'} geometry.`)
    }
  }

  for (const feature of features) {
    if (!feature.geometry) throw new Error('A map feature has no geometry; DXF export was cancelled.')
    if (feature.dxfEntityType === 'label' && feature.geometry.getType() === 'Point') {
      const text = feature.label?.trim()
      if (!text) throw new Error('An imported DXF text feature has no text; DXF export was cancelled.')
      entities.push({
        kind: 'label',
        coordinates: convertCoordinate(feature.geometry.getCoordinates?.()),
        text,
        sourceLayer: feature.dxfLayer?.trim() || undefined,
      })
      continue
    }
    visitGeometry(feature.geometry, feature.label?.trim() || undefined, feature.dxfLayer?.trim() || undefined, feature.dxfClosed === true)
  }

  return entities
}
