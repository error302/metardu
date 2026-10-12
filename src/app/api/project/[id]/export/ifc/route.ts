export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server';
import { apiHandler } from '@/lib/apiHandler';
import { db } from '@/lib/db';
import { generateIFC4 } from '@/lib/export/generateIFC';
import { generateIFC43Alignment } from '@/lib/export/ifc43Alignment';
import { horizontalCrsFor, normalizeDatumSelection } from '@/lib/spatial/projectReferenceSystem';
import type { AlignmentPoint } from '@/lib/export/machineControl';
import type { IFCExportOptions, IFCParcel, IFCControlPoint, IFCTraverseLine, IFCEquipmentRecord } from '@/types/ifc';

interface ControlPointRow {
  id: string
  label: string
  easting: number
  northing: number
  elevation: number | null
  beacon_type: string | null
  description: string | null
}

interface ParcelGeoRow {
  id: string
  label: string
  parcel_number: string | null
  area_m2: number | null
  vertices: unknown
}

interface TraverseLineRow {
  from_point: string
  to_point: string
  distance: number
}

interface EquipmentRow {
  id: string
  make: string
  model: string
  serial_number: string | null
  last_calibration_date: Date | null
}

interface IFCProjectRow {
  name: string;
  utm_zone?: number | null;
  hemisphere?: string | null;
  datum?: string | null;
  survey_type?: string | null;
  client_name?: string | null;
  surveyor_name?: string | null;
  surveyor_license?: string | null;
}

/**
 * GET /api/project/[id]/export/ifc?format=ifc4
 *
 * Reads all survey / cadastral data for the given project from the database
 * and returns a complete IFC4 STEP file as an attachment download.
 *
 * Query parameters:
 *   format  – must be "ifc4" (default if omitted)
 *
 * Response headers:
 *   Content-Type:        application/x-step
 *   Content-Disposition: attachment; filename="<project>_export.ifc"
 */
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format')?.toLowerCase() || 'ifc4';

  // ── Fetch project row ──────────────────────────────────────────────────
  const { rows: projRows } = await db.query<IFCProjectRow>(
    `SELECT name, utm_zone, hemisphere, datum, survey_type,
            client_name, surveyor_name, surveyor_license
       FROM projects WHERE id = $1 AND user_id = $2`,
    [id, ctx.userId],
  );

  if (projRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const proj = projRows[0];

  // Fail closed — an IFC file carries an authority CRS claim; never guess it
  // (blueprint §4.2: no exporter may hard-code a project CRS).
  if (!proj.utm_zone || !proj.hemisphere || !proj.datum) {
    return NextResponse.json(
      {
        error:
          'Project CRS is undeclared — set the project reference system (UTM zone, hemisphere, datum) before IFC export.',
        code: 'CRS_UNDECLARED',
      },
      { status: 400 },
    );
  }

  const utmZone = proj.utm_zone;
  const hemisphere = proj.hemisphere.toUpperCase() as 'N' | 'S';

  let crsCode: string;
  try {
    crsCode = horizontalCrsFor(proj.datum, utmZone, hemisphere);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Project CRS is not registered — declare a supported datum/zone before IFC export.',
        code: 'CRS_UNDECLARED',
      },
      { status: 400 },
    );
  }
  const epsgCode = Number(crsCode.replace('EPSG:', ''));
  const datumName =
    normalizeDatumSelection(proj.datum) === 'ARC1960' ? 'Arc 1960' : 'WGS 84';

  // ── IFC 4.3 Alignment Export ──────────────────────────────────────────
  if (format === 'ifc43' || format === 'ifc4.3' || format === 'alignment') {
    const { rows: alignmentRows } = await db.query<{ id: string; alignment_name: string }>(
      `SELECT id, alignment_name FROM road_alignments WHERE project_id = $1 LIMIT 1`,
      [id]
    );

    let horizontalPoints: AlignmentPoint[] = [];
    let verticalPoints: AlignmentPoint[] = [];
    let alignmentName = proj.name + '_Alignment';

    if (alignmentRows.length > 0) {
      alignmentName = alignmentRows[0].alignment_name || alignmentName;
      const alignId = alignmentRows[0].id;

      const { rows: ipRows } = await db.query<{ chainage: number; easting: number; northing: number; elevation: number | null }>(
        `SELECT chainage, easting, northing, elevation FROM alignment_ips WHERE alignment_id = $1 ORDER BY chainage ASC`,
        [alignId]
      );
      horizontalPoints = ipRows.map((r) => ({
        chainage: r.chainage ?? 0,
        easting: r.easting,
        northing: r.northing,
        elevation: r.elevation ?? 0,
      }));

      const { rows: vipRows } = await db.query<{ chainage: number; elevation: number }>(
        `SELECT chainage, elevation FROM alignment_vertical_ips WHERE alignment_id = $1 ORDER BY chainage ASC`,
        [alignId]
      );
      verticalPoints = vipRows.map((r) => ({
        chainage: r.chainage ?? 0,
        easting: 0,
        northing: 0,
        elevation: r.elevation ?? 0,
      }));
    }

    if (horizontalPoints.length === 0) {
      const { rows: pointRows } = await db.query<{ easting: number; northing: number; elevation: number | null }>(
        `SELECT easting, northing, elevation FROM survey_points WHERE project_id = $1 ORDER BY created_at ASC`,
        [id]
      );
      if (pointRows.length < 2) {
        return NextResponse.json(
          { error: 'At least 2 points or a defined road alignment are required for IFC 4.3 export' },
          { status: 400 }
        );
      }
      let cumulativeDist = 0;
      horizontalPoints = pointRows.map((pt, idx) => {
        if (idx > 0) {
          const prev = pointRows[idx - 1];
          const d = Math.hypot(pt.easting - prev.easting, pt.northing - prev.northing);
          cumulativeDist += d;
        }
        return {
          chainage: cumulativeDist,
          easting: pt.easting,
          northing: pt.northing,
          elevation: pt.elevation ?? 0,
        };
      });
      verticalPoints = horizontalPoints.map((p) => ({
        chainage: p.chainage,
        easting: p.easting,
        northing: p.northing,
        elevation: p.elevation,
      }));
    }

    const ifc43Content = generateIFC43Alignment({
      projectName: proj.name,
      alignmentName,
      horizontalPoints,
      verticalPoints,
      utmZone,
      hemisphere,
      datum: proj.datum,
      surveyorName: proj.surveyor_name ?? undefined,
      surveyorLicense: proj.surveyor_license ?? undefined,
    });

    const safeName = proj.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `${safeName}_alignment_ifc43.ifc`;

    return new NextResponse(ifc43Content, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-step',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(ifc43Content, 'utf-8')),
      },
    });
  }

  // ── Fetch survey control points ────────────────────────────────────────
  const { rows: cpRows } = await db.query<ControlPointRow>(
    `SELECT id, name AS label, easting, northing, elevation,
            beacon_type, description
       FROM survey_points
      WHERE project_id = $1 AND is_control = true
      ORDER BY name`,
    [id],
  );

  // ── Fetch parcel polygons ──────────────────────────────────────────────
  const { rows: parcelRows } = await db.query<ParcelGeoRow>(
    `SELECT p.id, p.label, p.parcel_number, p.area_m2,
            (
              SELECT jsonb_agg(
                jsonb_build_object('easting', pv.easting, 'northing', pv.northing, 'elevation', pv.elevation)
                ORDER BY pv.vertex_order
              )
              FROM parcel_vertices pv WHERE pv.parcel_id = p.id
            ) AS vertices
       FROM parcels p
      WHERE p.project_id = $1
      ORDER BY p.label`,
    [id],
  );

  // ── Fetch traverse lines ───────────────────────────────────────────────
  const { rows: traverseRows } = await db.query<TraverseLineRow>(
    `SELECT ts.from_point, ts.to_point, ts.distance
       FROM traverse_stations ts
      WHERE ts.project_id = $1
      ORDER BY ts.id`,
    [id],
  );

  // ── Fetch equipment records ────────────────────────────────────────────
  const { rows: equipRows } = await db.query<EquipmentRow>(
    `SELECT id, make, model, serial_number, last_calibration_date
       FROM equipment
      WHERE user_id = $1
      ORDER BY make, model`,
    [ctx.userId],
  );

  const parcels: IFCParcel[] = (parcelRows ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string) ?? r.parcel_number ?? 'Unnamed',
    vertices: (Array.isArray(r.vertices) ? r.vertices : []) as IFCParcel['vertices'],
    areaM2: (r.area_m2 as number) ?? undefined,
    parcelNumber: (r.parcel_number as string) ?? undefined,
  }));

  const controlPoints: IFCControlPoint[] = (cpRows ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string) ?? '',
    easting: r.easting as number,
    northing: r.northing as number,
    elevation: (r.elevation as number) ?? undefined,
    beaconType: (r.beacon_type as string) ?? undefined,
    description: (r.description as string) ?? undefined,
  }));

  const traverseLines: IFCTraverseLine[] = (traverseRows ?? []).map((r) => ({
    fromPoint: (r.from_point as string) ?? '',
    toPoint: (r.to_point as string) ?? '',
    distance: (r.distance as number) ?? undefined,
  }));

  const equipment: IFCEquipmentRecord[] = (equipRows ?? []).map((r) => ({
    id: r.id as string,
    make: (r.make as string) ?? '',
    model: (r.model as string) ?? '',
    serialNumber: (r.serial_number as string) ?? undefined,
    lastCalibration: r.last_calibration_date ? r.last_calibration_date.toISOString() : undefined,
  }));

  const ifcOpts: IFCExportOptions = {
    projectName: proj.name,
    projectNumber: proj.name,
    surveyorName: (proj.surveyor_name as string) ?? undefined,
    surveyorLicense: (proj.surveyor_license as string) ?? undefined,
    coordinateSystem: `UTM_${utmZone}${hemisphere}`,
    epsgCode,
    datum: datumName,
    parcels: parcels.length > 0 ? parcels : undefined,
    controlPoints: controlPoints.length > 0 ? controlPoints : undefined,
    traverseLines: traverseLines.length > 0 ? traverseLines : undefined,
    equipment: equipment.length > 0 ? equipment : undefined,
  };

  // ── Generate IFC4 content ─────────────────────────────────────────────
  const ifcContent = generateIFC4(ifcOpts);

  const safeName = proj.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = `${safeName}_export.ifc`;

  return new NextResponse(ifcContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-step',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(ifcContent, 'utf-8')),
    },
  });
});
