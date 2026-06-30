/**
 * Draw Annotations — lightweight bearing/distance labels for MapClient drawn features.
 *
 * For each edge of a LineString or Polygon, renders:
 *  - Bearing label (WCB format, e.g. "N 45°30'15" E")
 *  - Distance label (meters or km)
 *
 * All math runs in EPSG:21037 (Kenya grid, meters) for survey accuracy.
 * Rendered features use EPSG:3857 (Web Mercator).
 */

export interface DrawAnnotationOptions {
  /** Coordinates in EPSG:3857 from the drawn feature */
  coords3857: Array<[number, number]>
  /** Geometry type: 'LineString' or 'Polygon' */
  geomType: 'LineString' | 'Polygon'
}

const OFFSET_METERS = 3

function bearingToOLRotation(bearingDeg: number): number {
  let rotDeg = 90 - bearingDeg
  if (bearingDeg > 90 && bearingDeg < 270) rotDeg += 180
  while (rotDeg > 180) rotDeg -= 360
  while (rotDeg < -180) rotDeg += 360
  return (rotDeg * Math.PI) / 180
}

function formatBearingWCB(bearing: number): string {
  let quadrant: string
  let angle: number
  if (bearing >= 0 && bearing < 90) { quadrant = 'NE'; angle = bearing }
  else if (bearing >= 90 && bearing < 180) { quadrant = 'SE'; angle = 180 - bearing }
  else if (bearing >= 180 && bearing < 270) { quadrant = 'SW'; angle = bearing - 180 }
  else { quadrant = 'NW'; angle = 360 - bearing }

  const degrees = Math.floor(angle)
  const minutesFloat = (angle - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = Math.round((minutesFloat - minutes) * 60)
  const [ns, ew] = quadrant.split('')
  return `${ns} ${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}" ${ew}`
}

export async function createDrawAnnotationLayer(
  options: DrawAnnotationOptions,
): Promise<import('ol/layer/Vector').default> {
  const { coords3857, geomType } = options

  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: PointGeom },
    { default: Style },
    { default: Fill },
    { default: Stroke },
    { default: Text },
    { transform },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/Fill'),
    import('ol/style/Stroke'),
    import('ol/style/Text'),
    import('ol/proj'),
  ])

  const features: InstanceType<typeof Feature>[] = []
  // For polygons, skip the closing vertex (last == first)
  const isPolygon = geomType === 'Polygon'
  const coords = isPolygon ? coords3857.slice(0, -1) : coords3857
  const n = coords.length

  for (let i = 0; i < (isPolygon ? n : n - 1); i++) {
    const from3857 = coords[i]
    const to3857 = coords[(i + 1) % n]

    // Transform to EPSG:21037 for survey-accurate math
    let from21037: number[] | null = null
    let to21037: number[] | null = null
    try {
      from21037 = transform(from3857, 'EPSG:3857', 'EPSG:21037')
      to21037 = transform(to3857, 'EPSG:3857', 'EPSG:21037')
    } catch {
      continue
    }
    if (!from21037 || !to21037) continue

    const dE = to21037[0] - from21037[0]
    const dN = to21037[1] - from21037[1]
    const dist = Math.sqrt(dE * dE + dN * dN)
    let bearing = (Math.atan2(dE, dN) * 180) / Math.PI
    if (bearing < 0) bearing += 360

    // Skip zero-length edges
    if (dist < 0.01) continue

    const bearingStr = formatBearingWCB(bearing)
    const distStr = dist > 1000 ? `${(dist / 1000).toFixed(3)} km` : `${dist.toFixed(2)} m`

    // Midpoint in 21037
    const midE = (from21037[0] + to21037[0]) / 2
    const midN = (from21037[1] + to21037[1]) / 2

    // Perpendicular offset
    const len = Math.sqrt(dE * dE + dN * dN)
    const px = -dN / len
    const py = dE / len
    const flipped = bearing > 90 && bearing < 270
    const bearingOffset = flipped ? -OFFSET_METERS : OFFSET_METERS
    const distOffset = flipped ? OFFSET_METERS : -OFFSET_METERS

    const bearingPt = transform(
      [midE + px * bearingOffset, midN + py * bearingOffset],
      'EPSG:21037', 'EPSG:3857'
    )
    const distPt = transform(
      [midE + px * distOffset, midN + py * distOffset],
      'EPSG:21037', 'EPSG:3857'
    )

    const rotation = bearingToOLRotation(bearing)

    const edgeStyle = (text: string) => new Style({
      text: new Text({
        text,
        rotation,
        font: '11px Calibri, sans-serif',
        fill: new Fill({ color: '#E8841A' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
        textAlign: 'center',
        textBaseline: 'middle',
      }),
    })

    const bearingFeature = new Feature({ geometry: new PointGeom(bearingPt) })
    bearingFeature.setStyle(edgeStyle(bearingStr))
    features.push(bearingFeature)

    const distFeature = new Feature({ geometry: new PointGeom(distPt) })
    distFeature.setStyle(edgeStyle(distStr))
    features.push(distFeature)
  }

  const source = new VectorSource({ features })
  return new VectorLayer({ source, zIndex: 55 })
}
