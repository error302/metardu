/**
 * GET /api/project/[id]/export/ifc?format=ifc4
 *
 * Reads all survey / cadastral data for the given project from the
 * database and returns a complete IFC4 STEP file as an attachment
 * download.
 *
 * AUDIT FIX (2026-07-03): This route had 6 broken SQL references:
 *  - projects.surveyor_name      (doesn't exist — fall back to profiles.full_name)
 *  - projects.surveyor_license   (doesn't exist — fall back to profiles.license_number)
 *  - survey_points.name          (actual column: point_name)
 *  - survey_points.beacon_type   (doesn't exist — use code instead)
 *  - parcels.label               (doesn't exist — use parcel_number)
 *  - parcels.area_m2             (doesn't exist — convert area_ha to m²)
 *  - parcel_vertices table       (doesn't exist — read from blocks.geom via ST_DumpPoints)
 *  - traverse_stations table     (doesn't exist — use traverse_observations)
 *  - equipment.make              (doesn't exist — use manufacturer)
 *
 * All references now resolve to columns/tables that actually exist.
 *
 * Query parameters:
 *   format  – must be "ifc4" (default if omitted)
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { generateIFC4 } from '@/lib/export/generateIFC'
import type { IFCExportOptions, IFCParcel, IFCControlPoint, IFCTraverseLine, IFCEquipmentRecord } from '@/types/ifc'

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { id } = ctx.params

  // ── Fetch project row + surveyor profile ────────────────────────────────
  // We join profiles to get surveyor_name + license_number, which the
  // projects table doesn't have columns for.
  const { rows: projRows } = await db.query(
    `SELECT p.id, p.name, p.utm_zone, p.hemisphere, p.datum, p.survey_type,
            p.client_name,
            prof.full_name      AS surveyor_name,
            prof.license_number AS surveyor_license
       FROM projects p
       LEFT JOIN profiles prof ON prof.id = p.user_id
      WHERE p.id = $1 AND p.user_id = $2`,
    [id, ctx.userId],
  )

  if (projRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const proj = projRows[0]

  // ── Fetch survey control points ────────────────────────────────────────
  // survey_points columns: id, project_id, point_name, easting, northing,
  // elevation, description, code, is_control, ...
  const { rows: cpRows } = await db.query(
    `SELECT id, point_name, easting, northing, elevation,
            code, description
       FROM survey_points
      WHERE project_id = $1 AND is_control = true
      ORDER BY point_name`,
    [id],
  )

  // ── Fetch parcels + vertices (from blocks.geom via ST_DumpPoints) ───────
  // blocks.geom is GEOMETRY(POLYGON, 21037) — we dump its vertices.
  // We convert area_ha → m² (1 ha = 10 000 m²) because IFCParcel wants m².
  const { rows: parcelRows } = await db.query(
    `SELECT p.id,
            p.parcel_number,
            p.area_ha,
            COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'easting',   ST_X((dp).geom),
                    'northing',  ST_Y((dp).geom),
                    'elevation', NULL::double precision,
                    'vertex_order', (dp).path[1]
                  )
                  ORDER BY (dp).path
                )
                FROM blocks b, LATERAL ST_DumpPoints(b.geom) AS dp
                WHERE b.project_id = $1
              ),
              '[]'::jsonb
            ) AS vertices
       FROM parcels p
      WHERE p.project_id = $1
      ORDER BY p.parcel_number`,
    [id],
  )

  // ── Fetch traverse lines (from traverse_observations) ───────────────────
  const { rows: traverseRows } = await db.query(
    `SELECT obs.station_from AS from_point,
            obs.station_to   AS to_point,
            obs.distance
       FROM traverse_observations obs
       JOIN parcel_traverses pt ON pt.id = obs.traverse_id
      WHERE pt.project_id = $1
      ORDER BY obs.id`,
    [id],
  )

  // ── Fetch equipment records ─────────────────────────────────────────────
  // equipment columns: id, user_id, name, type, manufacturer, model,
  // serial_number, purchase_date, ...
  // For "last_calibration", we LEFT JOIN the latest equipment_calibration
  // row so the IFC export can show when each instrument was last calibrated.
  const { rows: equipRows } = await db.query(
    `SELECT e.id,
            e.manufacturer AS make,
            e.model,
            e.serial_number,
            (SELECT ec.calibration_date
               FROM equipment_calibration ec
              WHERE ec.equipment_id = e.id
              ORDER BY ec.calibration_date DESC
              LIMIT 1) AS last_calibration_date
       FROM equipment e
      WHERE e.user_id = $1
      ORDER BY e.manufacturer, e.model`,
    [ctx.userId],
  )

  // ── Build IFC export options ──────────────────────────────────────────
  const utmZone = proj.utm_zone ?? 37
  const hemisphere = (proj.hemisphere ?? 'S').toUpperCase()
  const epsgCode = hemisphere === 'N' ? 32600 + utmZone : 32700 + utmZone

  const parcels: IFCParcel[] = (parcelRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    label: (r.parcel_number as string) ?? 'Unnamed',
    vertices: (Array.isArray(r.vertices) ? r.vertices : []) as IFCParcel['vertices'],
    areaM2: r.area_ha != null ? Number(r.area_ha) * 10000 : undefined,
    parcelNumber: (r.parcel_number as string) ?? undefined,
  }))

  const controlPoints: IFCControlPoint[] = (cpRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    label: (r.point_name as string) ?? '',
    easting: r.easting as number,
    northing: r.northing as number,
    elevation: (r.elevation as number) ?? undefined,
    beaconType: (r.code as string) ?? undefined,
    description: (r.description as string) ?? undefined,
  }))

  const traverseLines: IFCTraverseLine[] = (traverseRows ?? []).map((r: Record<string, unknown>) => ({
    fromPoint: (r.from_point as string) ?? '',
    toPoint: (r.to_point as string) ?? '',
    distance: (r.distance as number) ?? undefined,
  }))

  const equipment: IFCEquipmentRecord[] = (equipRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    make: (r.make as string) ?? '',
    model: (r.model as string) ?? '',
    serialNumber: (r.serial_number as string) ?? undefined,
    lastCalibration: (r.last_calibration_date as string) ?? undefined,
  }))

  const ifcOpts: IFCExportOptions = {
    projectName: proj.name,
    projectNumber: proj.name,
    surveyorName: (proj.surveyor_name as string) ?? undefined,
    surveyorLicense: (proj.surveyor_license as string) ?? undefined,
    coordinateSystem: `UTM_${utmZone}${hemisphere}`,
    epsgCode,
    parcels: parcels.length > 0 ? parcels : undefined,
    controlPoints: controlPoints.length > 0 ? controlPoints : undefined,
    traverseLines: traverseLines.length > 0 ? traverseLines : undefined,
    equipment: equipment.length > 0 ? equipment : undefined,
  }

  // ── Generate IFC4 content ─────────────────────────────────────────────
  const ifcContent = generateIFC4(ifcOpts)

  const safeName = proj.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const filename = `${safeName}_export.ifc`

  return new NextResponse(ifcContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-step',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(ifcContent, 'utf-8')),
    },
  })
})
