import db from '@/lib/db';
import { coordinateArea } from '@/lib/engine/area';
import { bowditchAdjustment } from '@/lib/engine/traverse';
import { bearingToString } from '@/lib/engine/angles';
import type { NamedPoint2D } from '@/lib/engine/types';

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
}

function parseBearing(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const dmsMatch = String(raw).match(/(\d+)[°\-\s](\d+)['\-\s](\d+\.?\d*)/);
  if (dmsMatch) {
    const [, d, m, s] = dmsMatch.map(Number);
    return d + m / 60 + s / 3600;
  }
  return parseFloat(String(raw)) || 0;
}


export async function computeDeedPlanGeometry(
  projectId: string
): Promise<DeedPlanGeometry> {
  const entriesRes = await db.query(
    'SELECT row_index, station, raw_data FROM project_fieldbook_entries WHERE project_id = $1 ORDER BY row_index ASC',
    [projectId]
  );
  const entries = entriesRes.rows;

  if (!entries || entries.length < 3) {
    throw new Error('Deed Plan requires at least 3 traverse stations. Add observations in the Field Book panel.');
  }

  const projectRes = await db.query(
    'SELECT boundary_data, utm_zone, hemisphere FROM projects WHERE id = $1',
    [projectId]
  );
  const project = projectRes.rows[0];

  const legs: TraverseStation[] = entries
    .map((e: { row_index: number; station: string; raw_data: Record<string, unknown> }) => ({
      station: String(e.station ?? e.raw_data?.station ?? ''),
      bearing: parseBearing(String(e.raw_data?.bearing ?? e.raw_data?.bs ?? 0)),
      distance: parseFloat(String(e.raw_data?.distance ?? e.raw_data?.hd ?? '0')) || 0,
      beaconNo: String(e.raw_data?.beacon_no ?? ''),
      monument: String(e.raw_data?.monument_type ?? ''),
      markStatus: String(e.raw_data?.mark_status ?? e.raw_data?.monument_status ?? 'FOUND'),
    }))
    .filter((l) => l.distance > 0);

  if (legs.length < 3) {
    throw new Error('Insufficient traverse data. Ensure bearing and distance are entered for each leg.');
  }

  // Use boundary seed as starting coordinate
  const seed = project?.boundary_data as { startE?: number; startN?: number } | null;
  const startE = seed?.startE ?? 0;
  const startN = seed?.startN ?? 0;

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
    easting: leg.adjEasting,
    northing: leg.adjNorthing,
    beaconNo: legs[i].beaconNo,
    monument: legs[i].monument,
    markStatus: legs[i].markStatus,
  }));

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
  };
}
