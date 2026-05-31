import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }

  const { rows: parcels } = await db.query(
    `SELECT
      p.id, p.parcel_number, p.lr_number_proposed, p.area_ha, p.status,
      p.revision_number,
      b.id as block_id, b.block_number, b.block_name,
      pt.is_closed, pt.perimeter, pt.linear_error, pt.precision_ratio,
      pt.accuracy_order, pt.computed_area_ha,
      tc.station_name, tc.easting, tc.northing, tc.elevation
     FROM parcels p
     JOIN blocks b ON b.id = p.block_id
     LEFT JOIN parcel_traverses pt ON pt.parcel_id = p.id AND pt.status IN ('computed', 'approved')
     LEFT JOIN traverse_coordinates tc ON tc.traverse_id = pt.id
     WHERE b.project_id = $1
     ORDER BY b.block_number, p.parcel_number`,
    [projectId]
  )

  // Group by parcel
  const parcelMap = new Map<string, any>()
  parcels.forEach((row: any) => {
    if (!parcelMap.has(row.id)) {
      parcelMap.set(row.id, {
        ...row,
        coordinates: [],
      })
    }
    if (row.easting !== null && row.northing !== null) {
      parcelMap.get(row.id).coordinates.push({
        station: row.station_name,
        easting: Number(row.easting),
        northing: Number(row.northing),
        elevation: row.elevation ? Number(row.elevation) : null,
      })
    }
  })

  const features = Array.from(parcelMap.values()).map(p => {
    const coords = p.coordinates
    let geometry: any

    if (coords.length >= 3) {
      const ring = coords.map((c: any) => [c.easting, c.northing])
      ring.push(ring[0]) // close
      geometry = { type: 'Polygon', coordinates: [ring] }
    } else if (coords.length > 0) {
      geometry = { type: 'MultiPoint', coordinates: coords.map((c: any) => [c.easting, c.northing]) }
    } else {
      geometry = null
    }

    return {
      type: 'Feature',
      properties: {
        parcel_number: p.parcel_number,
        lr_number: p.lr_number_proposed,
        block_number: p.block_number,
        block_name: p.block_name,
        area_ha: p.computed_area_ha || p.area_ha,
        status: p.status,
        revision: p.revision_number,
        is_closed: p.is_closed,
        perimeter: p.perimeter,
        linear_error: p.linear_error,
        precision_ratio: p.precision_ratio,
        accuracy_order: p.accuracy_order,
        coordinate_count: coords.length,
      },
      geometry,
    }
  }).filter(f => f.geometry !== null)

  return NextResponse.json({
    type: 'FeatureCollection',
    features,
    name: 'metardu_scheme_export',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:EPSG::21037' }, // Arc 1960 / UTM Zone 37S (Kenya cadastral datum)
    },
  })
})
