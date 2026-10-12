import type { SurveyPoint } from '@/types/surveyPoint'
import { generateProjectMetadata } from '@/lib/geo/isoMetadata'
import { utmToWgs84 } from '@/lib/spatial/projectReferenceSystem'

// Re-export for backwards compatibility with callers that import
// `{ SurveyPoint }` from this module. New code should import the type
// directly from '@/types/surveyPoint'.
export type { SurveyPoint }

/**
 * Generate a GeoJSON FeatureCollection.
 * Coordinates are converted to WGS84 lat/lon as required by the GeoJSON spec (RFC 7946).
 * UTM coordinates are retained as properties for reference.
 *
 * The UTM zone, hemisphere and datum are REQUIRED — without them the lat/lon
 * conversion cannot be done correctly, and METARDU never guesses a CRS.
 * The conversion applies the registered datum transformation (for Arc 1960
 * the EPSG:1122 geocentric translation) via the CRS authority, so the emitted
 * lat/lon really is WGS84.
 *
 * T1.5g FIX (2026-07-10): Now includes ISO 19115/19139 metadata as a
 * 'metadata' field in the FeatureCollection, so the export is self-documenting
 * and acceptable by spatial data catalogs.
 */
export function generateGeoJSON(
  points: SurveyPoint[],
  projectName: string,
  utmZone: number,
  hemisphere: 'N' | 'S',
  datum: string,
  vertical?: {
    datum?: string
    reference?: string
    geoidModel?: string
    benchmarkBasis?: string
  },
): string {
  if (!Number.isInteger(utmZone) || utmZone < 1 || utmZone > 60) {
    throw new Error(
      'GeoJSON export requires a declared project UTM zone (1-60). Set the project CRS in Project Settings before exporting.',
    )
  }
  if (hemisphere !== 'N' && hemisphere !== 'S') {
    throw new Error('GeoJSON export requires a declared hemisphere (N or S). Set the project CRS before exporting.')
  }
  if (typeof datum !== 'string' || datum.trim() === '') {
    throw new Error(
      'GeoJSON export requires a declared project datum. Set the project CRS in Project Settings before exporting.',
    )
  }
  const features = points.map((p) => {
    const { lat, lon } = utmToWgs84(p.easting, p.northing, utmZone, hemisphere, datum)
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        // Unknown height remains unknown; do not invent a zero Z ordinate.
        coordinates: [
          parseFloat(lon.toFixed(8)),
          parseFloat(lat.toFixed(8)),
          ...(p.elevation == null ? [] : [p.elevation]),
        ],
      },
      properties: {
        name: p.name,
        elevation_m: p.elevation ?? null,
        easting_utm: p.easting,
        northing_utm: p.northing,
        utm_zone: `${utmZone}${hemisphere}`,
        is_control: p.is_control || false,
        point_type: p.is_control ? 'control' : 'survey',
      },
    }
  })

  // T1.5g: Generate ISO 19115/19139 metadata for the export
  let metadata: string | undefined
  try {
    metadata = generateProjectMetadata({
      id: projectName,
      name: projectName,
      survey_type: 'cadastral',
      utm_zone: utmZone,
      hemisphere,
      datum,
      vertical_datum: vertical?.datum,
      vertical_reference: vertical?.reference,
      geoid_model: vertical?.geoidModel,
      benchmark_basis: vertical?.benchmarkBasis,
      user_name: 'METARDU User',
      user_email: 'surveyor@metardu.com',
    })
  } catch {
    // Metadata generation is non-blocking
  }

  const geojson: Record<string, unknown> = {
    type: 'FeatureCollection',
    name: projectName,
    // WGS84 is the default/required CRS for GeoJSON per RFC 7946
    features,
  }

  // Attach ISO 19139 metadata if generated
  if (metadata) {
    geojson.metadata = metadata
  }

  return JSON.stringify(geojson, null, 2)
}

export function downloadGeoJSON(
  points: SurveyPoint[],
  projectName: string,
  utmZone: number,
  hemisphere: 'N' | 'S',
  datum: string
): void {
  const content = generateGeoJSON(points, projectName, utmZone, hemisphere, datum)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/geo+json' }))
  a.download = `${projectName.replace(/\s+/g, '_')}_WGS84.geojson`
  a.click()
}
