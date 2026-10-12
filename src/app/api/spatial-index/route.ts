import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { viewportQueryResponseSchema, type ViewportFeature } from '@/lib/validation/viewportQuery'

export const dynamic = 'force-dynamic'

// ─── DB Row Interfaces ───────────────────────────────────────────────────────

interface ParcelRow {
  id: string
  parcel_number: string
  area_ha: string | number | null
  status: string | null
  geojson: string | null
}

interface BeaconRow {
  id: string
  point_name: string | null
  easting: string | number
  northing: string | number
}

interface FieldRecordRow {
  id: string
  fr_number: string | null
  easting: string | number
  northing: string | number
  horizontal_crs?: string | null
  county: string | null
  locality: string | null
  survey_year: string | number | null
  surveyor_name: string | null
  is_verified: boolean | null
}


/**
 * GET /api/spatial-index?west=&south=&east=&north=
 *
 * Returns GeoJSON features (parcels, beacons, field records) within
 * the given WGS84 bounding box. Uses PostGIS ST_MakeEnvelope + ST_Intersects.
 *
 * This powers the dynamic viewport query — as surveyors pan the map,
 * nearby spatial data loads automatically.
 *
 * Query params:
 *   - west, south, east, north: WGS84 bounding box
 *   - limit: max features (default 200, max 500)
 *   - types: comma-separated feature types to include (parcel,beacon,field_record)
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, _ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const west = parseFloat(url.searchParams.get('west') || '')
    const south = parseFloat(url.searchParams.get('south') || '')
    const east = parseFloat(url.searchParams.get('east') || '')
    const north = parseFloat(url.searchParams.get('north') || '')
    const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '200', 10))
    const types = url.searchParams.get('types')?.split(',') || ['parcel', 'beacon', 'field_record']

    if (!isFinite(west) || !isFinite(south) || !isFinite(east) || !isFinite(north)) {
      return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 })
    }

    const features: ViewportFeature[] = []

    // 1. Fetch parcels in viewport (join projects for ownership)
    // AUDIT FIX (2026-07-03): parcels.geometry → parcels.geom,
    // removed non-existent owner_name/lr_number, JOIN projects
    // (parcels has no user_id), errors logged not swallowed.
    // 1. Fetch parcels in viewport (join projects for ownership)
    if (types.includes('parcel')) {
      try {
        const result = await db.query<ParcelRow>(
          `SELECT p.id, p.parcel_number, p.area_ha, p.status,
                  ST_AsGeoJSON(ST_Transform(p.geom, 4326)) as geojson
           FROM parcels p
           JOIN projects pr ON pr.id = p.project_id
           WHERE pr.user_id = $1
             AND p.geom IS NOT NULL
             AND ST_SRID(p.geom) <> 0
             AND EXISTS (SELECT 1 FROM spatial_ref_sys s WHERE s.srid = ST_SRID(p.geom))
             AND p.geom && ST_Transform(ST_MakeEnvelope($2, $3, $4, $5, 4326), ST_SRID(p.geom))
           LIMIT $6`,
          [user.id, west, south, east, north, Math.floor(limit / 2)],
        )

        for (const row of result.rows) {
          if (row.geojson) {
            features.push({
              id: `parcel-${row.id}`,
              type: 'parcel',
              geometry: JSON.parse(row.geojson) as ViewportFeature['geometry'],
              properties: {
                parcelNumber: row.parcel_number,
                areaHa: row.area_ha ? parseFloat(String(row.area_ha)) : null,
                status: row.status || 'pending',
              },
            })
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console -- viewport query failure log, not user-facing
        console.error('[spatial-index] parcel query failed:', err)
      }
    }

    // 2. Fetch beacons in viewport with true PostGIS spatial intersection
    if (types.includes('beacon')) {
      try {
        const result = await db.query<BeaconRow & { lon: number; lat: number }>(
          `WITH owned_project_points AS MATERIALIZED (
             SELECT sp.id, sp.point_name, sp.easting, sp.northing,
                    CASE
                      WHEN prs.horizontal_crs IN ('EPSG:21036', 'EPSG:21037')
                        OR prs.horizontal_crs ~ '^EPSG:(326|327)(0[1-9]|[1-5][0-9]|60)$'
                      THEN split_part(prs.horizontal_crs, ':', 2)::integer
                      ELSE NULL
                    END AS source_srid
             FROM survey_points sp
             JOIN projects pr ON pr.id = sp.project_id
             JOIN project_reference_systems prs ON prs.project_id = pr.id
             WHERE pr.user_id = $1
               AND sp.easting IS NOT NULL AND sp.northing IS NOT NULL
           ), geographic_points AS MATERIALIZED (
             SELECT id, point_name, easting, northing,
                    ST_Transform(
                      ST_SetSRID(ST_MakePoint(easting, northing), source_srid),
                      4326
                    ) AS geom
             FROM owned_project_points
             WHERE source_srid IS NOT NULL
           )
           SELECT id, point_name, easting, northing,
                  ST_X(geom) AS lon, ST_Y(geom) AS lat
           FROM geographic_points
           WHERE geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)
           LIMIT $6`,
          [user.id, west, south, east, north, Math.floor(limit / 3)],
        )

        for (const row of result.rows) {
          if (row.lon !== null && row.lat !== null && !isNaN(row.lon) && !isNaN(row.lat)) {
            features.push({
              id: `beacon-${row.id}`,
              type: 'beacon',
              geometry: {
                type: 'Point',
                coordinates: [parseFloat(String(row.lon)), parseFloat(String(row.lat))],
              },
              properties: {
                beaconNumber: row.point_name || '',
                beaconType: 'concrete',
                easting: parseFloat(String(row.easting)),
                northing: parseFloat(String(row.northing)),
              },
            })
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console -- viewport query failure log, not user-facing
        console.error('[spatial-index] beacon query failed:', err)
      }
    }

    // 3. Fetch field records in viewport with true PostGIS spatial intersection
    if (types.includes('field_record')) {
      try {
        const result = await db.query<FieldRecordRow & { lon: number; lat: number }>(
          `SELECT fr.id, fr.fr_number, fr.easting, fr.northing, fr.county, fr.locality,
                  fr.survey_year, fr.surveyor_name, fr.is_verified, fr.horizontal_crs,
                  ST_X(fr.location_geom) AS lon,
                  ST_Y(fr.location_geom) AS lat
           FROM field_records fr
           WHERE fr.location_geom IS NOT NULL
             AND fr.location_geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
           LIMIT $5`,
          [west, south, east, north, Math.floor(limit / 4)],
        )

        for (const row of result.rows) {
          if (row.lon !== null && row.lat !== null && !isNaN(row.lon) && !isNaN(row.lat)) {
            features.push({
              id: `fr-${row.id}`,
              type: 'field_record',
              geometry: {
                type: 'Point',
                coordinates: [parseFloat(String(row.lon)), parseFloat(String(row.lat))],
              },
              properties: {
                frNumber: row.fr_number,
                county: row.county || '',
                locality: row.locality || '',
                surveyYear: row.survey_year ? parseInt(String(row.survey_year), 10) : null,
                surveyorName: row.surveyor_name || '',
                isVerified: row.is_verified || false,
                easting: parseFloat(String(row.easting)),
                northing: parseFloat(String(row.northing)),
                horizontalCrs: row.horizontal_crs,
              },
            })
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console -- viewport query failure log, not user-facing
        console.error('[spatial-index] field_record query failed:', err)
      }
    }

    // Validate the response against the shared schema — the same one the
    // client hook derives its type from. If this ever fails, the response and
    // the client viewport shape have drifted; fail loudly instead of silently
    // shipping a mismatched payload.
    const payload = {
      type: 'FeatureCollection' as const,
      features,
      count: features.length,
      bbox: [west, south, east, north],
    }
    const parsed = viewportQueryResponseSchema.safeParse(payload)
    if (!parsed.success) {
      // eslint-disable-next-line no-console -- internal response drift log, not user-facing
      console.error('[spatial-index] response validation failed:', parsed.error.issues)
      return NextResponse.json({ error: 'Internal response validation failed' }, { status: 500 })
    }
    return apiSuccess(parsed.data)
  },
)
