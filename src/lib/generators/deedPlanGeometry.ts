import db from '@/lib/db';
import { coordinateArea } from '@/lib/engine/area';
import { bowditchAdjustment } from '@/lib/engine/traverse';
import { bearingToString } from '@/lib/engine/angles';
import type { NamedPoint2D } from '@/lib/engine/types';
import { computeLineScaleFactor } from '@/lib/survey/adapter';
import { z } from 'zod';
import { resolveStageReference } from '@/lib/workspaces/stageReference';
import { resolveEpsg } from '@/lib/spatial/projectCrs';
import { fieldBookRevision } from '@/lib/survey/fieldBookRevision';
import { startingControlFromBoundary } from '@/lib/validation/fieldBookControl';

export interface TraverseStation {
  station: string;
  bearing: number;
  distance: number;
  beaconNo?: string;
  monument?: string;
  markStatus?: string;
}

export interface AdjustedStation {
  station: string;
  easting: number;
  northing: number;
  elevation?: number;
  beaconNo?: string;
  monument?: string;
  markStatus?: string;
}

export interface BearingLeg {
  from: string;
  to: string;
  bearing: string;
  distance: string;
}

export interface DeedPlanGeometry {
  stations: AdjustedStation[];
  bearingSchedule: BearingLeg[];
  areaM2: number;
  areaHa: number;
  areaAcres: number;
  misclosureMm: number;
  precisionRatio: string;
  closureStatus: 'PASS' | 'FAIL' | 'UNVERIFIED';
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  /** Source of the coordinates — tracks whether pre-adjusted or independently computed */
  coordinateSource: 'pre_adjusted' | 'computed';
  /** Line scale factor for each boundary leg (survey engine, Simpson's rule) */
  lineScaleFactors?: Array<{
    from: string;
    to: string;
    scaleFactor: number;
    ppmFromUnity: number;
    gridDistance: number;
    ellipsoidalDistance: number;
  }>;
  /** UTM projection used for scale factor computation */
  projection?: 'UTM36S' | 'UTM37S';
}

/**
 * Pre-adjusted coordinates from an external source (e.g. traverse_coordinates
 * table, or a TraverseComputationResult). When provided to
 * computeDeedPlanGeometry(), the function skips independent Bowditch
 * computation and uses these coordinates directly — guaranteeing 100%
 * consistency with the traverse computation sheet.
 */
export interface PreAdjustedCoordinate {
  station: string;
  easting: number;
  northing: number;
  elevation?: number;
  beaconNo?: string;
  monument?: string;
  markStatus?: string;
}

export interface PreAdjustedClosure {
  misclosureMm: number;
  precisionRatio: number;
}

export interface ComputeDeedPlanGeometryOptions {
  /**
   * Pre-adjusted traverse coordinates from an authoritative source.
   * When provided, computeDeedPlanGeometry() will use these coordinates
   * directly instead of recomputing from raw field book entries.
   * This ensures single-source-of-truth consistency with the traverse
   * computation sheet and all other output documents.
   */
  preAdjustedCoordinates?: PreAdjustedCoordinate[];
  /** Closure metrics corresponding to the pre-adjusted coordinates */
  preAdjustedClosure?: PreAdjustedClosure;
}

function parseBearing(raw: string | number): number {
  const dmsMatch = String(raw).trim().match(/^(\d+)[°\-\s]\s*(\d+)['\-\s]\s*(\d+(?:\.\d+)?)["″]?$/);
  if (dmsMatch) {
    const [, d, m, s] = dmsMatch.map(Number);
    const value = d + m / 60 + s / 3600;
    return m < 60 && s < 60 && value <= 360 ? value % 360 : NaN;
  }
  const value = Number(String(raw).trim() || NaN);
  return Number.isFinite(value) && value >= 0 && value <= 360 ? value % 360 : NaN;
}

interface ProjectGeometryMetadata {
  utm_zone: number | null;
  hemisphere: string | null;
  datum: string | null;
}

function supportedProjection(project?: ProjectGeometryMetadata): DeedPlanGeometry['projection'] {
  // The scale-factor adapter uses WGS84 constants and supports these two
  // southern UTM zones only. Arc 1960 and northern zones need another model.
  if (project?.datum?.replace(/\s/g, '').toUpperCase() !== 'WGS84' || project.hemisphere !== 'S') return undefined;
  return project.utm_zone === 36 ? 'UTM36S' : project.utm_zone === 37 ? 'UTM37S' : undefined;
}

function validateCoordinates(coords: PreAdjustedCoordinate[]): void {
  if (coords.length < 3 || coords.some(c => !c.station || !Number.isFinite(c.easting)
    || !Number.isFinite(c.northing) || c.elevation !== undefined && !Number.isFinite(c.elevation))) {
    throw new Error('At least three stations with finite coordinates are required for export.');
  }
  if (new Set(coords.map(c => c.station)).size !== coords.length) {
    throw new Error('Boundary coordinate station names must be unique.');
  }
}

function scaleFactors(
  stations: AdjustedStation[], projection: DeedPlanGeometry['projection']
): DeedPlanGeometry['lineScaleFactors'] {
  if (!projection) return undefined;
  try {
    return stations.map((st, i) => {
      const next = stations[(i + 1) % stations.length];
      const result = computeLineScaleFactor(st.easting, st.northing, next.easting, next.northing, projection);
      if (![result.lineScaleFactor, result.ppmCorrection, result.gridDistance, result.ellipsoidalDistance].every(Number.isFinite)
        || result.lineScaleFactor <= 0) throw new Error('Invalid scale factor');
      return { from: st.station, to: next.station, scaleFactor: result.lineScaleFactor,
        ppmFromUnity: result.ppmCorrection, gridDistance: result.gridDistance,
        ellipsoidalDistance: result.ellipsoidalDistance };
    });
  } catch {
    // Missing/failed correction evidence must never become a unity correction.
    return undefined;
  }
}

export async function computeDeedPlanGeometry(
  projectId: string,
  options?: ComputeDeedPlanGeometryOptions
): Promise<DeedPlanGeometry> {
  // ── Path A: Use pre-adjusted coordinates from an authoritative source ──
  // When the caller has already computed adjusted traverse coordinates (e.g.
  // from the traverse computation sheet or the traverse_coordinates table),
  // use them directly. This guarantees 100% consistency between all output
  // documents — the deed plan, computation sheet, Form C22, and DXF all
  // derive from the same adjusted coordinates.
  if (options?.preAdjustedCoordinates) {
    validateCoordinates(options.preAdjustedCoordinates);
    const project = await db.query<ProjectGeometryMetadata>('SELECT utm_zone, hemisphere, datum FROM projects WHERE id = $1', [projectId]);
    return buildFromPreAdjusted(options.preAdjustedCoordinates, options.preAdjustedClosure, supportedProjection(project.rows[0]));
  }

  // ── Path B: Try to load pre-adjusted coordinates from the DB ──
  // If the project has a saved traverse with adjusted coordinates in the
  // traverse_coordinates table, use those instead of recomputing.
  const savedCoords = await loadPreAdjustedFromDB(projectId);
  if (savedCoords) {
    if (savedCoords.referenceCrs) {
      const info = resolveEpsg(savedCoords.referenceCrs);
      return buildFromPreAdjusted(savedCoords.stations, undefined, supportedProjection({
        datum: info.datum, utm_zone: info.zone ?? null, hemisphere: info.hemisphere ?? null,
      }));
    }
    const project = await db.query<ProjectGeometryMetadata>('SELECT utm_zone, hemisphere, datum FROM projects WHERE id = $1', [projectId]);
    return buildFromPreAdjusted(savedCoords.stations, savedCoords.closure, supportedProjection(project.rows[0]));
  }

  // ── Path C: Compute from raw field book entries (fallback) ──
  return computeFromFieldBook(projectId);
}

/**
 * Build DeedPlanGeometry from pre-adjusted coordinates.
 * Bearings and distances are RECOMPUTED from the adjusted coordinates to
 * ensure the bearing schedule is consistent with the coordinate schedule.
 */
function buildFromPreAdjusted(
  coords: PreAdjustedCoordinate[],
  closure?: PreAdjustedClosure,
  projection?: DeedPlanGeometry['projection']
): DeedPlanGeometry {
  validateCoordinates(coords);
  const adjusted: AdjustedStation[] = coords.map(c => ({
    station: c.station,
    easting: c.easting,
    northing: c.northing,
    elevation: c.elevation,
    beaconNo: c.beaconNo,
    monument: c.monument,
    markStatus: c.markStatus,
  }));

  // Compute area from adjusted coordinates (Shoelace formula)
  const pts = adjusted.map((s) => ({ easting: s.easting, northing: s.northing }));
  const areaResult = coordinateArea(pts);

  // Bearing schedule recomputed from adjusted positions — ensures consistency
  // Now includes grid scale factors from the survey engine (Simpson's rule)
  const bearingSchedule: BearingLeg[] = adjusted.map((st, i) => {
    const next = adjusted[(i + 1) % adjusted.length];
    const dE = next.easting - st.easting;
    const dN = next.northing - st.northing;
    let brg = (Math.atan2(dE, dN) * 180) / Math.PI;
    if (brg < 0) brg += 360;
    const dist = Math.sqrt(dE ** 2 + dN ** 2);
    return {
      from: st.station,
      to: next.station,
      bearing: bearingToString(brg),
      distance: dist.toFixed(3),
    };
  });

  // Compute line scale factors using the survey engine's Simpson's rule
  const lineScaleFactors = scaleFactors(adjusted, projection);

  const eastings = adjusted.map((s) => s.easting);
  const northings = adjusted.map((s) => s.northing);

  const hasClosure = !!closure && Number.isFinite(closure.misclosureMm) && closure.misclosureMm >= 0
    && (Number.isFinite(closure.precisionRatio) && closure.precisionRatio >= 0
      || closure.precisionRatio === Infinity && closure.misclosureMm === 0);
  const misclosureMm = hasClosure && closure ? closure.misclosureMm : NaN;
  const ratio = hasClosure && closure ? closure.precisionRatio : NaN;
  const precisionRatio = !hasClosure ? 'Unverified' : ratio === Infinity ? '1:∞' : `1:${Math.round(ratio).toLocaleString()}`;
  const closureStatus: 'PASS' | 'FAIL' | 'UNVERIFIED' =
    !hasClosure ? 'UNVERIFIED' : ratio >= 5000 ? 'PASS' : 'FAIL';

  return {
    stations: adjusted,
    bearingSchedule,
    areaM2: areaResult.areaSqm,
    areaHa: areaResult.areaHa,
    areaAcres: areaResult.areaAcres,
    misclosureMm,
    precisionRatio,
    closureStatus,
    minE: Math.min(...eastings),
    maxE: Math.max(...eastings),
    minN: Math.min(...northings),
    maxN: Math.max(...northings),
    coordinateSource: 'pre_adjusted',
    lineScaleFactors,
    projection,
  };
}

/**
 * Attempt to load pre-adjusted coordinates from the traverse_coordinates
 * table. Returns null if no saved traverse exists.
 *
 * Also queries the field book entries for beacon descriptions (monument type,
 * mark status, beacon number) so that the DeedPlanGeometry includes rich
 * beacon metadata — matching the behaviour of the external helper in
 * deedPlan.ts.
 */
export async function loadPreAdjustedFromDB(
  projectId: string
): Promise<{ stations: PreAdjustedCoordinate[]; closure?: PreAdjustedClosure; referenceCrs?: string } | null> {
  try {
    const current = await db.query<{ boundary_data: Record<string, unknown> | null }>(
      'SELECT boundary_data FROM projects WHERE id = $1', [projectId]);
    const boundary=current.rows[0]?.boundary_data;
    const computation = z.object({ source: z.string() }).passthrough().safeParse(boundary?.computation);
    const source = computation.success ? computation.data.source : null;
    if (source === 'recorded-grid-traverse' || source === 'field-observations') {
      const coordinates = z.array(z.object({ pointName: z.string().trim().min(1), adjustedEasting: z.number().finite(), adjustedNorthing: z.number().finite() })).min(3).safeParse(boundary?.adjustedStations);
      if (!coordinates.success) throw new Error('Saved boundary coordinates are incomplete or invalid. Recompute from the field book.');
      const beacons=await db.query<{station:string;raw_data:Record<string,unknown> | null}>(
        'SELECT * FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC',[projectId]);
      const stations=coordinates.data.map(point=>{
        const raw=beacons.rows.find(row=>row.station===point.pointName)?.raw_data;
        return {station:point.pointName,easting:point.adjustedEasting,northing:point.adjustedNorthing,beaconNo:String(raw?.beacon_no ?? ''),monument:String(raw?.monument_type ?? ''),markStatus:String(raw?.mark_status ?? '')};
      });
      validateCoordinates(stations);
      if (source === 'recorded-grid-traverse') {
        const provenance = z.object({ crs: z.string(), source_revision: z.string(), acceptance_status: z.literal('draft_unverified'), field_verified: z.literal(false) }).safeParse(boundary?.computation);
        const referenceRows = await db.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1', [projectId]);
        const reference = resolveStageReference(referenceRows.rows[0], {});
        if (!provenance.success || reference.source !== 'declared' || reference.code !== provenance.data.crs) throw new Error('The saved boundary does not match the declared project grid. Recompute before exporting.');
        if (fieldBookRevision(beacons.rows, startingControlFromBoundary(boundary)) !== provenance.data.source_revision) throw new Error('Field-book inputs changed after this boundary was computed. Recompute before exporting.');
        // Numerical closure of entered/modelled legs is not field verification.
        return { stations, referenceCrs: reference.code };
      }
      const ratioText=String(boundary?.precision_ratio ?? '').replace(/,/g,'').replace(/^1\s*:\s*/,'').trim();
      const ratio=ratioText==='∞' ? Infinity : Number(ratioText);
      return {stations,closure:{misclosureMm:boundary?.linear_misclosure == null ? NaN : Number(boundary.linear_misclosure)*1000,precisionRatio:ratio}};
    }
    // Find the most recent traverse for this project via parcels
    const traverseRes = await db.query<{ id: string }>(
      `SELECT pt.id
       FROM parcel_traverses pt
       JOIN parcels p ON p.id = pt.parcel_id
       JOIN blocks b ON b.id = p.block_id
       WHERE b.project_id = $1
       ORDER BY pt.created_at DESC LIMIT 1`,
      [projectId]
    );

    if (traverseRes.rows.length === 0) return null;

    const traverse = traverseRes.rows[0];
    const traverseId = traverse.id;

    const coordsRes = await db.query<Record<string, unknown>>(
      `SELECT station_name AS station, easting, northing, elevation AS rl
       FROM traverse_coordinates WHERE traverse_id = $1 ORDER BY created_at, id`,
      [traverseId]
    );

    if (coordsRes.rows.length < 3) return null;

    const observations = await db.query<{ station_from: string; station_to: string }>(
      'SELECT station_from, station_to FROM traverse_observations WHERE traverse_id = $1 ORDER BY created_at, id',
      [traverseId]
    );
    const links = new Map<string, string>();
    for (const observation of observations.rows) {
      if (links.has(observation.station_from) && links.get(observation.station_from) !== observation.station_to) {
        throw new Error('Traverse has ambiguous boundary connections. Review observations before exporting.');
      }
      links.set(observation.station_from, observation.station_to);
    }
    const ordered: typeof coordsRes.rows = [];
    let station: string | undefined = observations.rows[0]?.station_from;
    const visited = new Set<string>();
    while (station && !visited.has(station)) {
      visited.add(station);
      const coordinate = coordsRes.rows.find((row: Record<string, unknown>) => row.station === station);
      if (!coordinate) break;
      ordered.push(coordinate);
      station = links.get(station);
    }
    if (ordered.length !== coordsRes.rows.length || station !== observations.rows[0]?.station_from) {
      throw new Error('A complete ordered boundary is required for coordinate export. Review traverse observations.');
    }

    // Also try to get beacon info from field book entries for richer metadata
    const beaconLookup = new Map<string, { beaconNo: string; monument: string; markStatus: string }>();
    const fbRes = await db.query<{ station: string; raw_data: Record<string, unknown> | null }>(
      'SELECT station, raw_data FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC',
        [projectId]
      );
      for (const row of fbRes.rows) {
        const raw = row.raw_data as Record<string, unknown> | null;
        if (row.station && raw) {
          beaconLookup.set(String(row.station), {
            beaconNo: String(raw.beacon_no ?? ''),
            monument: String(raw.monument_type ?? ''),
            markStatus: String(raw.mark_status ?? raw.monument_status ?? ''),
          });
        }
      }

    const stations: PreAdjustedCoordinate[] = ordered.map((c: Record<string, unknown>) => {
      const stn = String(c.station);
      const beacon = beaconLookup.get(stn);
      return {
        station: stn,
        easting: c.easting == null || String(c.easting).trim() === '' ? NaN : Number(c.easting),
        northing: c.northing == null || String(c.northing).trim() === '' ? NaN : Number(c.northing),
        elevation: c.rl == null ? undefined : Number(c.rl),
        beaconNo: beacon?.beaconNo || stn,
        monument: beacon?.monument || '',
        markStatus: beacon?.markStatus || '',
      };
    });

    validateCoordinates(stations);
    return { stations };
  } catch (error) {
    throw error;
  }
}

/**
 * Compute DeedPlanGeometry from raw field book entries using Bowditch
 * adjustment. This is the fallback path when no pre-adjusted coordinates
 * are available.
 */
async function computeFromFieldBook(projectId: string): Promise<DeedPlanGeometry> {
  const entriesRes = await db.query<{ row_index: number; station: string; raw_data: Record<string, unknown> }>(
    'SELECT row_index, station, raw_data FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC',
    [projectId]
  );
  const entries = entriesRes.rows;

  if (!entries || entries.length < 3) {
    throw new Error('Deed Plan requires at least 3 traverse stations. Add observations in the Field Book panel.');
  }

  const projectRes = await db.query<ProjectGeometryMetadata & { boundary_data: Record<string, unknown> | null }>(
    'SELECT boundary_data, utm_zone, hemisphere, datum FROM projects WHERE id = $1',
    [projectId]
  );
  const project = projectRes.rows[0];

  const legs: TraverseStation[] = entries
    .map((e: { row_index: number; station: string; raw_data: Record<string, unknown> }) => ({
      station: String(e.station ?? e.raw_data?.station ?? ''),
      bearing: parseBearing(String(e.raw_data?.bearing ?? '')),
      distance: Number(e.raw_data?.distance ?? e.raw_data?.hd ?? NaN),
      beaconNo: String(e.raw_data?.beacon_no ?? ''),
      monument: String(e.raw_data?.monument_type ?? ''),
      markStatus: String(e.raw_data?.mark_status ?? e.raw_data?.monument_status ?? ''),
    }))
    ;

  if (legs.length < 3 || legs.some(l => !l.station || !Number.isFinite(l.bearing) || !Number.isFinite(l.distance) || l.distance <= 0)) {
    throw new Error('Insufficient traverse data. Ensure bearing and distance are entered for each leg.');
  }

  // Use boundary seed as starting coordinate
  const seed = project?.boundary_data as { startE?: number; startN?: number } | null;
  if (!Number.isFinite(seed?.startE) || !Number.isFinite(seed?.startN)) {
    throw new Error('Starting easting and northing are required before generating survey documents.');
  }
  const startE = Number(seed?.startE);
  const startN = Number(seed?.startN);

  // Build the traverse input for the engine's Bowditch adjustment
  // This ensures the deed plan uses the SAME adjusted coordinates as the
  // traverse computation sheet — single source of truth for all outputs.
  // Source: Ghilani & Wolf Ch.12 — Bowditch (Compass) Rule
  const startPoint: NamedPoint2D = { name: legs[0].station, easting: startE, northing: startN };
  const traversePoints: NamedPoint2D[] = legs.map(l => ({ name: l.station, easting: 0, northing: 0 }));

  const traverseResult = bowditchAdjustment({
    points: [startPoint, ...traversePoints],
    distances: legs.map(l => l.distance),
    bearings: legs.map(l => l.bearing),
    closingPoint: { easting: startE, northing: startN },
  });

  // Extract adjusted coordinates from the engine result
  const adjusted: AdjustedStation[] = traverseResult.legs.map((leg, i) => ({
    station: legs[i].station,
    easting: i === 0 ? startE : traverseResult.legs[i - 1].adjEasting,
    northing: i === 0 ? startN : traverseResult.legs[i - 1].adjNorthing,
    beaconNo: legs[i].beaconNo,
    monument: legs[i].monument,
    markStatus: legs[i].markStatus,
  }));
  validateCoordinates(adjusted);

  // Compute area from adjusted coordinates (Shoelace formula)
  const pts = adjusted.map((s) => ({ easting: s.easting, northing: s.northing }));
  const areaResult = coordinateArea(pts);
  const areaM2 = areaResult.areaSqm;
  const areaHa = areaResult.areaHa;
  const areaAcres = areaResult.areaAcres;

  // Closure metrics from the engine result
  const misclosureMm = traverseResult.linearError * 1000;
  const ratio = traverseResult.precisionRatio;
  const precisionRatio = `1:${Math.round(ratio).toLocaleString()}`;
  const closureStatus: 'PASS' | 'FAIL' | 'UNVERIFIED' =
    ratio >= 5000 ? 'PASS' : ratio > 0 ? 'FAIL' : 'UNVERIFIED';

  // Bearing schedule from adjusted coordinates — bearings are recomputed from
  // the adjusted positions to ensure consistency with the coordinate schedule
  // Now includes grid scale factors from the survey engine (Simpson's rule)
  const projection = supportedProjection(project);
  const bearingSchedule: BearingLeg[] = adjusted.map((st, i) => {
    const next = adjusted[(i + 1) % adjusted.length];
    const dE = next.easting - st.easting;
    const dN = next.northing - st.northing;
    let brg = (Math.atan2(dE, dN) * 180) / Math.PI;
    if (brg < 0) brg += 360;
    const dist = Math.sqrt(dE ** 2 + dN ** 2);
    return {
      from: st.station,
      to: next.station,
      bearing: bearingToString(brg),
      distance: dist.toFixed(3),
    };
  });

  // Compute line scale factors using the survey engine's Simpson's rule
  const lineScaleFactors = scaleFactors(adjusted, projection);

  const eastings = adjusted.map((s) => s.easting);
  const northings = adjusted.map((s) => s.northing);

  return {
    stations: adjusted,
    bearingSchedule,
    areaM2,
    areaHa,
    areaAcres,
    misclosureMm,
    precisionRatio,
    closureStatus,
    minE: Math.min(...eastings),
    maxE: Math.max(...eastings),
    minN: Math.min(...northings),
    maxN: Math.max(...northings),
    coordinateSource: 'computed',
    lineScaleFactors,
    projection,
  };
}
