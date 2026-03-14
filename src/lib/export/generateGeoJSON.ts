export interface SurveyPoint {
  id?: string
  name: string
  easting: number
  northing: number
  elevation?: number | null
  is_control?: boolean
  control_order?: string
}

export function generateGeoJSON(
  points: SurveyPoint[],
  projectName: string,
  utmZone: number = 37,
  hemisphere: string = 'S'
): string {
  const features = points.map(p => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [p.easting, p.northing, p.elevation || 0]
    },
    properties: {
      name: p.name,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation,
      is_control: p.is_control || false,
      control_order: p.control_order,
      type: p.is_control ? 'control' : 'survey'
    }
  }))

  const epsgCode = hemisphere === 'S' ? 32700 + utmZone : 32600 + utmZone

  const geojson = {
    type: 'FeatureCollection',
    name: projectName,
    crs: {
      type: 'name',
      properties: { name: `urn:ogc:def:crs:EPSG::${epsgCode}` }
    },
    features
  }

  return JSON.stringify(geojson, null, 2)
}

export function downloadGeoJSON(
  points: SurveyPoint[],
  projectName: string,
  utmZone?: number,
  hemisphere?: string
): void {
  const geojson = generateGeoJSON(points, projectName, utmZone, hemisphere)
  const blob = new Blob([geojson], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName.replace(/\s+/g, '_')}.geojson`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
