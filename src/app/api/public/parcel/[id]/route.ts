import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { computeDeedPlanGeometry } from '@/lib/generators/deedPlanGeometry'
import { transformToWGS84, DATUM_REGISTRY } from '@/lib/geodesy/datums'
import { utmToGeographic } from '@/lib/geodesy/coordinates'

export const dynamic = 'force-dynamic'

interface ProjectRow {
  id: string
  name: string
  lr_number: string | null
  client_name: string | null
  location: string | null
  locality: string | null
  county: string | null
  survey_type: string | null
  area_ha: number | null
  utm_zone: number | null
  hemisphere: string | null
  datum: string | null
  boundary_data: {
    adjustedStations?: Array<{
      station?: string | number
      pointName?: string
      label?: string
      easting?: number
      northing?: number
      monument?: string
      markStatus?: string
    }>
  } | null
  surveyor_name: string | null
  surveyor_license: string | null
  user_id: string | null
  created_at: string
}

interface RawBeacon {
  name: string
  easting: number
  northing: number
  monument?: string
  markStatus?: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing parcel identifier' }, { status: 400 })
    }

    // 1. Fetch Project Record
    const res = await db.query<ProjectRow>(
      `SELECT id, name, lr_number, client_name, location, locality, county,
              survey_type, area_ha, utm_zone, hemisphere, datum, boundary_data,
              surveyor_name, surveyor_license, user_id, created_at
       FROM projects
       WHERE id = $1`,
      [projectId]
    )

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Survey parcel record not found' }, { status: 404 })
    }

    const proj = res.rows[0]

    // 2. Fetch Surveyor Profile info if needed
    let surveyorFirm = ''
    let surveyorPhone = ''
    let surveyorName = proj.surveyor_name || ''
    let surveyorLicense = proj.surveyor_license || ''

    if (proj.user_id) {
      try {
        const userRes = await db.query<{
          name?: string
          firm_name?: string
          license_number?: string
          isk_number?: string
          phone?: string
        }>(
          `SELECT u.name, sp.firm_name, sp.license_number, sp.isk_number, sp.phone
           FROM users u
           LEFT JOIN surveyor_profiles sp ON sp.user_id = u.id
           WHERE u.id = $1`,
          [proj.user_id]
        )
        if (userRes.rows.length > 0) {
          const u = userRes.rows[0]
          if (!surveyorName && u.name) surveyorName = u.name
          if (!surveyorLicense && (u.isk_number || u.license_number)) {
            surveyorLicense = u.isk_number || u.license_number || ''
          }
          if (u.firm_name) surveyorFirm = u.firm_name
          if (u.phone) surveyorPhone = u.phone
        }
      } catch {
        // Fallback gracefully
      }
    }

    // 3. Resolve Beacons (Adjusted Stations)
    const rawBeacons: RawBeacon[] = []

    // Attempt A: read from project.boundary_data.adjustedStations
    const existingAdjusted = proj.boundary_data?.adjustedStations
    if (existingAdjusted && Array.isArray(existingAdjusted) && existingAdjusted.length >= 3) {
      for (const st of existingAdjusted) {
        const name = String(st.station || st.pointName || st.label || 'STN')
        const easting = Number(st.easting)
        const northing = Number(st.northing)
        if (!isNaN(easting) && !isNaN(northing)) {
          rawBeacons.push({
            name,
            easting,
            northing,
            monument: st.monument || 'PSC (Concrete Pillar) Found',
            markStatus: st.markStatus || 'FOUND',
          })
        }
      }
    }

    // Attempt B: fallback to computeDeedPlanGeometry(projectId)
    if (rawBeacons.length < 3) {
      try {
        const geom = await computeDeedPlanGeometry(projectId)
        if (geom.stations && geom.stations.length >= 3) {
          for (const s of geom.stations) {
            rawBeacons.push({
              name: s.station || s.beaconNo || 'STN',
              easting: s.easting,
              northing: s.northing,
              monument: s.monument || 'Concrete Survey Pillar',
              markStatus: s.markStatus || 'FOUND',
            })
          }
        }
      } catch {
        // Continue with whatever raw beacons were found
      }
    }

    const zone = proj.utm_zone || 37
    const hemisphere = (proj.hemisphere?.toUpperCase() === 'N' ? 'N' : 'S') as 'N' | 'S'

    // 4. Transform Beacons to WGS84 GPS Lat/Lon
    const beacons = rawBeacons.map((b, idx) => {
      let lat = 0
      let lng = 0

      try {
        // Transform Arc 1960 UTM -> WGS84 UTM -> WGS84 Lat/Lon
        const wgsUtm = transformToWGS84(
          b.easting,
          b.northing,
          zone,
          hemisphere,
          DATUM_REGISTRY.ARC1960
        )
        const geo = utmToGeographic(wgsUtm.easting, wgsUtm.northing, zone, hemisphere)
        lat = geo.lat
        lng = geo.lon
      } catch {
        // Fallback to direct WGS84 UTM conversion if datum shift fails
        const geo = utmToGeographic(b.easting, b.northing, zone, hemisphere)
        lat = geo.lat
        lng = geo.lon
      }

      return {
        id: `beacon-${idx + 1}`,
        name: b.name,
        easting: b.easting,
        northing: b.northing,
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
        monument: b.monument || 'Standard Concrete Beacon (MB/PSC)',
        markStatus: b.markStatus || 'CONFIRMED',
      }
    })

    // Compute Boundary Polygon
    const boundaryPoints = beacons.map((b) => [b.lat, b.lng] as [number, number])
    if (boundaryPoints.length >= 3) {
      // Close polygon loop
      boundaryPoints.push(boundaryPoints[0])
    }

    // Compute Centroid & Bounding Box
    let minLat = 90
    let maxLat = -90
    let minLng = 180
    let maxLng = -180
    let sumLat = 0
    let sumLng = 0

    for (const b of beacons) {
      if (b.lat < minLat) minLat = b.lat
      if (b.lat > maxLat) maxLat = b.lat
      if (b.lng < minLng) minLng = b.lng
      if (b.lng > maxLng) maxLng = b.lng
      sumLat += b.lat
      sumLng += b.lng
    }

    const count = beacons.length || 1
    const center = {
      lat: Number((sumLat / count).toFixed(7)),
      lng: Number((sumLng / count).toFixed(7)),
    }

    const bounds = {
      minLat: minLat === 90 ? 0 : minLat,
      maxLat: maxLat === -90 ? 0 : maxLat,
      minLng: minLng === 180 ? 0 : minLng,
      maxLng: maxLng === -180 ? 0 : maxLng,
    }

    // 5. Area
    const areaHa = proj.area_ha || 0
    const areaAcres = areaHa ? areaHa / 0.404686 : 0

    return NextResponse.json({
      success: true,
      parcel: {
        id: proj.id,
        name: proj.name,
        lrNumber: proj.lr_number || 'Unregistered / In Process',
        clientName: proj.client_name || 'Registered Landowner',
        locality: proj.locality || proj.location || 'Republic of Kenya',
        county: proj.county || 'Kenya',
        surveyType: proj.survey_type || 'Cadastral Boundary Survey',
        surveyorName: surveyorName || 'Licensed Land Surveyor',
        surveyorLicense: surveyorLicense || 'MISK / Cap 299',
        surveyorFirm: surveyorFirm || 'METARDU Geomatics Practice',
        surveyorPhone: surveyorPhone || '',
        datum: `Arc 1960 / UTM Zone ${zone}${hemisphere}`,
        areaHa: Number(areaHa.toFixed(4)),
        areaAcres: Number(areaAcres.toFixed(3)),
        beaconsCount: beacons.length,
        beacons,
        boundaryPoints,
        center,
        bounds,
        certifiedDate: proj.created_at,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve public parcel record'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
