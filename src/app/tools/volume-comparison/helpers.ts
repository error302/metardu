import {
  interpolateElevation,
  type SpotHeight,
  type TINSurface,
} from '@/lib/engine/contours';
import type { SurfacePoint } from '@/lib/engine/volume';
import type { BBox, GridCell, Method } from './types';

// ─── Type conversions ────────────────────────────────────────────────────────

export const toSurfacePoints = (spots: SpotHeight[]): SurfacePoint[] =>
  spots.map(p => ({ easting: p.easting, northing: p.northing, elevation: p.elevation }));

export const toSpotHeights = (pts: { easting: number; northing: number; elevation: number }[]): SpotHeight[] =>
  pts.map((p, i) => ({ name: `P${i + 1}`, ...p }));

// ─── CSV / text parsing ─────────────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const spaceCount = (firstLine.match(/  +/g) || []).length;
  if (tabCount >= 2) return '\t';
  if (commaCount >= 2) return ',';
  if (semiCount >= 2) return ';';
  if (spaceCount >= 2) return '  ';
  return ',';
}

export function parsePointData(text: string): { points: SurfacePoint[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) return { points: [], errors: ['No data rows found.'] };

  const delim = detectDelimiter(text);
  const points: SurfacePoint[] = [];
  let startIndex = 0;

  // Check if first line is a header
  const firstLine = lines[0].trim().toLowerCase();
  if (firstLine.includes('easting') || firstLine.includes('name') || firstLine.includes('point') || firstLine.includes('x')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].trim().split(delim).map(s => s.trim()).filter(Boolean);
    // Try to handle multi-space delimiters
    const fields = parts.length >= 3 ? parts : lines[i].trim().split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (fields.length < 3) { errors.push(`Row ${i + 1}: fewer than 3 fields`); continue; }

    const nameIdx = fields.length >= 4 ? (isNaN(Number(fields[0])) ? 0 : -1) : -1;
    const numericStart = nameIdx === 0 ? 1 : 0;

    const e = Number(fields[numericStart]);
    const n = Number(fields[numericStart + 1]);
    const z = Number(fields[numericStart + 2]);

    if (isNaN(e) || isNaN(n) || isNaN(z)) {
      errors.push(`Row ${i + 1}: non-numeric values`);
      continue;
    }
    points.push({ easting: e, northing: n, elevation: z });
  }

  return { points, errors };
}

// ─── Bounding box helpers ────────────────────────────────────────────────────

export function computeBBox(points: SurfacePoint[]): BBox {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of points) {
    if (p.easting < minE) minE = p.easting;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
  }
  return { minE, maxE, minN, maxN };
}

export function bboxOverlap(a: BBox, b: BBox): BBox | null {
  const minE = Math.max(a.minE, b.minE);
  const maxE = Math.min(a.maxE, b.maxE);
  const minN = Math.max(a.minN, b.minN);
  const maxN = Math.min(a.maxN, b.maxN);
  if (maxE <= minE || maxN <= minN) return null;
  return { minE, maxE, minN, maxN };
}

export function overlapPercent(a: BBox, b: BBox): number {
  const overlap = bboxOverlap(a, b);
  if (!overlap) return 0;
  const aArea = (a.maxE - a.minE) * (a.maxN - a.minN);
  const oArea = (overlap.maxE - overlap.minE) * (overlap.maxN - overlap.minN);
  return (oArea / aArea) * 100;
}

// ─── Demo data generators ────────────────────────────────────────────────────

export function generateDemoA(): SurfacePoint[] {
  const points: SurfacePoint[] = [];
  const gridSize = 25;
  const spacing = 2;
  const centerE = 484600;
  const centerN = 9863100;
  const halfGrid = (gridSize * spacing) / 2;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const e = centerE - halfGrid + col * spacing;
      const n = centerN - halfGrid + row * spacing;
      // Base elevation 120m with gentle sine wave slopes
      const dx = (e - centerE) / halfGrid;
      const dy = (n - centerN) / halfGrid;
      const z = 120 + 3 * Math.sin(dx * Math.PI) + 2 * Math.cos(dy * Math.PI) + 0.5 * Math.sin(dx * dy * Math.PI * 2);
      points.push({ easting: Math.round(e * 100) / 100, northing: Math.round(n * 100) / 100, elevation: Math.round(z * 1000) / 1000 });
    }
  }
  return points;
}

export function generateDemoB(demoA: SurfacePoint[]): SurfacePoint[] {
  const centerE = 484600;
  const centerN = 9863100;

  return demoA.map(p => {
    const dx = p.easting - centerE;
    const dy = p.northing - centerN;
    let mod = 0;

    // Excavation pit: -5m depression in a 20×20m area (bottom-left quadrant)
    if (dx < 0 && dy < 0 && Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      const r = Math.sqrt(dx * dx + dy * dy) / 10;
      mod -= 5 * Math.cos(r * Math.PI / 2); // Bowl shape
    }

    // Embankment: +3m mound in a 15×15m area (right-center)
    const ex = dx - 8;
    if (Math.abs(ex) <= 7.5 && Math.abs(dy) <= 7.5) {
      const r = Math.sqrt(ex * ex + dy * dy) / 7.5;
      mod += 3 * Math.cos(r * Math.PI / 2); // Dome shape
    }

    return { ...p, elevation: p.elevation + mod };
  });
}

// ─── Balance point computation ──────────────────────────────────────────────

export function computeBalancePoint(surface1: TINSurface, surface2: TINSurface, gridSpacing: number): number | null {
  const minE = Math.max(surface1.bounds.minE, surface2.bounds.minE);
  const maxE = Math.min(surface1.bounds.maxE, surface2.bounds.maxE);
  const minN = Math.max(surface1.bounds.minN, surface2.bounds.minN);
  const maxN = Math.min(surface1.bounds.maxN, surface2.bounds.maxN);
  if (minE >= maxE || minN >= maxN) return null;

  // Get elevation range from both surfaces
  const allElevs = [
    ...surface1.points.map(p => p.elevation),
    ...surface2.points.map(p => p.elevation),
  ];
  const minZ = Math.min(...allElevs);
  const maxZ = Math.max(...allElevs);
  const padding = (maxZ - minZ) * 0.1;
  let lo = minZ - padding;
  let hi = maxZ + padding;

  // Binary search for datum where cut = fill
  for (let iter = 0; iter < 64; iter++) {
    const mid = (lo + hi) / 2;
    let cut = 0;
    let fill = 0;
    const cellArea = gridSpacing * gridSpacing;

    for (let e = minE; e <= maxE; e += gridSpacing) {
      for (let n = minN; n <= maxN; n += gridSpacing) {
        const z1 = interpolateElevation(surface1, e, n);
        const z2 = interpolateElevation(surface2, e, n);
        if (z1 === null || z2 === null) continue;

        const diff1 = z1 - mid;
        const diff2 = z2 - mid;
        if (diff1 > 0) cut += diff1 * cellArea;
        else fill += -diff1 * cellArea;
        if (diff2 > 0) cut += diff2 * cellArea;
        else fill += -diff2 * cellArea;
      }
    }

    if (cut > fill) hi = mid;
    else lo = mid;
  }

  return (lo + hi) / 2;
}

// ─── Compute per-cell analysis grid ─────────────────────────────────────────

export function computeGridCells(
  method: Method,
  surface1: TINSurface | null,
  surface2: TINSurface | null,
  surveyA: SurfacePoint[],
  surveyB: SurfacePoint[],
  gridSpacing: number
): { cells: GridCell[]; bbox: BBox } {
  const bboxA = computeBBox(surveyA);
  const bboxB = computeBBox(surveyB);
  const overlap = bboxOverlap(bboxA, bboxB);
  if (!overlap) return { cells: [], bbox: { minE: 0, maxE: 0, minN: 0, maxN: 0 } };

  const startE = Math.ceil(overlap.minE / gridSpacing) * gridSpacing;
  const startN = Math.ceil(overlap.minN / gridSpacing) * gridSpacing;
  const endE = Math.floor(overlap.maxE / gridSpacing) * gridSpacing;
  const endN = Math.floor(overlap.maxN / gridSpacing) * gridSpacing;

  const cells: GridCell[] = [];

  for (let e = startE; e <= endE; e += gridSpacing) {
    for (let n = startN; n <= endN; n += gridSpacing) {
      const x = e + gridSpacing / 2;
      const y = n + gridSpacing / 2;

      let z1: number | null = null;
      let z2: number | null = null;

      if (method === 'tin' && surface1 && surface2) {
        z1 = interpolateElevation(surface1, x, y);
        z2 = interpolateElevation(surface2, x, y);
      } else {
        // IDW fallback
        z1 = idwInterp(surveyA, x, y, 2, gridSpacing * 3);
        z2 = idwInterp(surveyB, x, y, 2, gridSpacing * 3);
      }

      if (z1 === null || z2 === null) continue;

      const diff = z1 - z2;
      cells.push({
        easting: e,
        northing: n,
        diff,
        type: diff > 0.001 ? 'cut' : diff < -0.001 ? 'fill' : 'none',
      });
    }
  }

  return { cells, bbox: overlap };
}

export function idwInterp(points: SurfacePoint[], x: number, y: number, power: number, maxDist: number): number | null {
  let wSum = 0, wzSum = 0, nearestD2 = Infinity, nearestZ = 0;
  const maxD2 = maxDist * maxDist;
  for (const p of points) {
    const dx = p.easting - x, dy = p.northing - y;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0) return p.elevation;
    if (d2 < nearestD2) { nearestD2 = d2; nearestZ = p.elevation; }
    if (d2 > maxD2) continue;
    const d = Math.sqrt(d2);
    const w = 1 / Math.pow(d, power);
    wSum += w;
    wzSum += w * p.elevation;
  }
  if (wSum > 0) return wzSum / wSum;
  if (nearestD2 < Infinity) return nearestZ;
  return null;
}
