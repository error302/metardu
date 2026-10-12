// Helper utilities for parsing XYZ text, generating demo data, computing
// colors, and downloading blobs.
//
// Extracted from src/app/tools/contour-generator/page.tsx — pure functions
// (no React, no hooks) so this file does not need 'use client'.

import type { SpotHeight } from '@/lib/engine/contours';
import type { ColMapping, ParseError, ParsedPoint } from './types';
import Papa from 'papaparse';

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const decimal = (value: string | undefined) => value != null && DECIMAL.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : Number.NaN;
function splitSourceLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/);
  const parsed = Papa.parse<string[]>(line, { delimiter, skipEmptyLines: false });
  if (parsed.errors.length) return [];
  return (parsed.data[0] ?? []).map(value => value.trim());
}

export function fmt(n: number, d: number = 3): string {
  return n.toFixed(d);
}

export function detectDelimiter(text: string): string {
  const firstLines = text.split('\n').slice(0, 5);
  let commaCount = 0;
  let tabCount = 0;
  let semicolonCount = 0;
  let spaceCount = 0;

  for (const line of firstLines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    commaCount += (line.match(/,/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
    semicolonCount += (line.match(/;/g) || []).length;
    spaceCount += (line.match(/ {2,}/g) || []).length;
  }

  const counts: [string, number][] = [
    ['\t', tabCount],
    [',', commaCount],
    [';', semicolonCount],
    [' ', spaceCount],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

export function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  const headerKeywords = [
    'easting', 'northing', 'elevation', 'name', 'point', 'id',
    'x', 'y', 'z', 'e', 'n', 'rl', 'height',
  ];
  const tokens = lower.split(/[\t,; ]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return false;
  const matchCount = tokens.filter(t =>
    !DECIMAL.test(t) && headerKeywords.some(kw => t === kw || (kw.length > 1 && t.includes(kw)))
  ).length;
  return matchCount >= Math.ceil(tokens.length * 0.5);
}

export function guessColumnIndices(headers: string[]): ColMapping {
  const lower = headers.map(h => h.toLowerCase().trim());

  const eastingIdx = lower.findIndex(h =>
    h === 'easting' || h === 'e' || h === 'x' || h.includes('east') || h.includes('easting')
  );
  const northingIdx = lower.findIndex(h =>
    h === 'northing' || h === 'n' || h === 'y' || h.includes('north') || h.includes('northing')
  );
  const elevIdx = lower.findIndex(h =>
    h === 'elevation' || h === 'z' || h === 'rl' || h === 'height' ||
    h.includes('elev') || h.includes('height') || h === 'level'
  );
  const nameIdx = lower.findIndex(h =>
    h === 'name' || h === 'id' || h === 'point' || h === 'pointname' ||
    h === 'point_name' || h === 'code' || h.includes('name') || h.includes('id')
  );

  return {
    name: nameIdx >= 0 ? nameIdx : -1,
    easting: eastingIdx,
    northing: northingIdx,
    elevation: elevIdx,
  };
}

export function parseXYZText(text: string): {
  points: ParsedPoint[];
  errors: ParseError[];
  delimiter: string;
  hasHeader: boolean;
} {
  const delimiter = detectDelimiter(text);
  const lines = text.split('\n');
  const errors: ParseError[] = [];
  const points: ParsedPoint[] = [];
  const firstContent = lines.findIndex(line => line.trim() && !line.trim().startsWith('#'));
  let startIdx = firstContent < 0 ? lines.length : firstContent;
  let hasHeader = false;

  if (firstContent >= 0 && isHeaderLine(lines[firstContent])) {
    hasHeader = true;
    startIdx = firstContent + 1;
  }

  let colMapping: ColMapping | null = null;
  if (hasHeader) {
    const headers = splitSourceLine(lines[firstContent], delimiter);
    colMapping = guessColumnIndices(headers);
    const axes = [colMapping.easting, colMapping.northing, colMapping.elevation];
    if (axes.some(index => index < 0) || new Set(axes).size !== 3) {
      return { points: [], errors: [{ row: firstContent + 1, message: 'The header must identify Easting, Northing and Elevation/Height; missing coordinates are not substituted.' }], delimiter, hasHeader };
    }
  }

  // Determine column count from first data row
  let colCount = 3;
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const parts = splitSourceLine(trimmed, delimiter);
    if (parts.length >= 3) {
      colCount = parts.length;
      break;
    }
  }

  if (!colMapping) {
    if (colCount === 3) {
      colMapping = { name: -1, easting: 0, northing: 1, elevation: 2 };
    } else if (colCount >= 4) {
      colMapping = { name: 0, easting: 1, northing: 2, elevation: 3 };
    } else {
      colMapping = { name: -1, easting: 0, northing: 1, elevation: 2 };
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const parts = splitSourceLine(trimmed, delimiter);
    if (parts.length < 3) {
      errors.push({ row: i + 1, message: `Too few columns (${parts.length})` });
      continue;
    }

    if (!colMapping) {
      errors.push({ row: i + 1, message: 'Column mapping not resolved' });
      continue;
    }
    const mapping = colMapping;
    const easting = decimal(parts[mapping.easting]);
    const northing = decimal(parts[mapping.northing]);
    const elevation = decimal(parts[mapping.elevation]);

    if (![easting, northing, elevation].every(Number.isFinite)) {
      errors.push({ row: i + 1, message: 'Missing or invalid coordinate: enter complete finite decimal Easting, Northing and Height values.' });
      continue;
    }

    const pointName =
      mapping.name >= 0 && mapping.name < parts.length
        ? parts[mapping.name]
        : `P${points.length + 1}`;

    points.push({ name: pointName, easting, northing, elevation });
  }

  return {
    points,
    errors: errors.slice(0, 50),
    delimiter,
    hasHeader,
  };
}

export function generateDemoData(): SpotHeight[] {
  const points: SpotHeight[] = [];
  const gridSize = 20;
  const spacing = 5.0;
  const originE = 484000;
  const originN = 9863100;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const e = originE + i * spacing;
      const n = originN + j * spacing;

      // Two gaussian hills
      const cx1 = originE + 7 * spacing;
      const cy1 = originN + 7 * spacing;
      const cx2 = originE + 14 * spacing;
      const cy2 = originN + 12 * spacing;

      const d1 = Math.sqrt((e - cx1) ** 2 + (n - cy1) ** 2);
      const d2 = Math.sqrt((e - cx2) ** 2 + (n - cy2) ** 2);

      const hill1 = 15.0 * Math.exp(-(d1 * d1) / (2 * 12 * 12));
      const hill2 = 10.0 * Math.exp(-(d2 * d2) / (2 * 8 * 8));

      // Gentle base slope
      const baseSlope = 100.0 + 0.3 * i + 0.2 * j;

      // Add slight noise
      const noise = Math.sin(i * 1.3) * Math.cos(j * 1.7) * 0.3;

      const elevation = baseSlope + hill1 + hill2 + noise;

      points.push({
        name: `D${i * gridSize + j + 1}`,
        easting: e,
        northing: n,
        elevation: Math.round(elevation * 100) / 100,
      });
    }
  }

  return points;
}

export function elevationToColor(elevation: number, minElev: number, maxElev: number): string {
  const range = maxElev - minElev || 1;
  const t = Math.max(0, Math.min(1, (elevation - minElev) / range));
  // HSL gradient: green (120) -> yellow (60) -> brown (30)
  const hue = 120 - t * 90; // 120 (green) to 30 (brown/orange)
  const saturation = 55 + t * 25;
  const lightness = 40 + (1 - Math.abs(t - 0.5) * 2) * 15;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Discrete hypsometric tint bands for professional contour maps.
 * Uses an even-step quantized elevation model (QEM) — each band spans
 * `bandWidth` meters and gets a single color, so the map reads as a
 * graded color relief (like USGS/National Map style) rather than a
 * continuous gradient. Index contours (every 5th band) get a darker shade.
 *
 * @returns array of { fromElev, toElev, color, isIndex } bands covering
 *          [minElev, maxElev]. Used by MapTab to render a tinted rectangle
 *          per band as the relief background, and to render a discrete
 *          legend with swatches.
 */
export interface HypsometricBand {
  fromElev: number;
  toElev: number;
  color: string;
  isIndex: boolean;
}

export function computeHypsometricBands(
  minElev: number,
  maxElev: number,
  contourInterval: number,
): HypsometricBand[] {
  const bands: HypsometricBand[] = [];
  if (maxElev <= minElev) {
    return [{ fromElev: minElev, toElev: maxElev, color: elevationToColor(minElev, minElev, maxElev), isIndex: true }];
  }
  // Each band = one contour interval wide. Every 5th band is an "index" band.
  let elev = minElev;
  let idx = 0;
  while (elev < maxElev) {
    const to = Math.min(elev + contourInterval, maxElev);
    const mid = (elev + to) / 2;
    const color = elevationToColor(mid, minElev, maxElev);
    bands.push({ fromElev: elev, toElev: to, color, isIndex: idx % 5 === 0 });
    elev = to;
    idx++;
  }
  return bands;
}

export function downloadBlob(content: string | Blob, filename: string, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser's download manager time to consume the object URL. A
  // synchronous revoke can cancel downloads in embedded browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
