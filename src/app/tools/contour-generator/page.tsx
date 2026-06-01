'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { Mountain } from 'lucide-react';
import {
  generateContours,
  buildTINSurface,
  computeVolumeFromTIN,
  type SpotHeight,
  type ContourLine,
  type TINSurface,
} from '@/lib/engine/contours';

// ─── Types ────────────────────────────────────────────────────────────────

type TabId = 'import' | 'settings' | 'map' | 'export';

interface ParsedPoint {
  name: string;
  easting: number;
  northing: number;
  elevation: number;
}

interface ParseError {
  row: number;
  message: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SVG_WIDTH = 900;
const SVG_HEIGHT = 650;
const MARGIN = 60;

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number, d: number = 3): string {
  return n.toFixed(d);
}

function detectDelimiter(text: string): string {
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

function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  const headerKeywords = [
    'easting', 'northing', 'elevation', 'name', 'point', 'id',
    'x', 'y', 'z', 'e', 'n', 'rl', 'height',
  ];
  const tokens = lower.split(/[\t,; ]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return false;
  const matchCount = tokens.filter(t =>
    headerKeywords.some(kw => t === kw || t.includes(kw))
  ).length;
  return matchCount >= Math.ceil(tokens.length * 0.5);
}

interface ColMapping {
  name: number;
  easting: number;
  northing: number;
  elevation: number;
}

function guessColumnIndices(headers: string[]): ColMapping {
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
    easting: eastingIdx >= 0 ? eastingIdx : 0,
    northing: northingIdx >= 0 ? northingIdx : 1,
    elevation: elevIdx >= 0 ? elevIdx : 2,
  };
}

function parseXYZText(text: string): {
  points: ParsedPoint[];
  errors: ParseError[];
  delimiter: string;
  hasHeader: boolean;
} {
  const delimiter = detectDelimiter(text);
  const lines = text.split('\n');
  const errors: ParseError[] = [];
  const points: ParsedPoint[] = [];
  const splitRe = delimiter === ' ' ? /\s+/ : new RegExp(`(?:${delimiter === '\t' ? '\\t' : delimiter})+`);
  let startIdx = 0;
  let hasHeader = false;

  if (lines.length > 0 && isHeaderLine(lines[0])) {
    hasHeader = true;
    startIdx = 1;
  }

  let colMapping: ColMapping | null = null;
  if (hasHeader) {
    const headers = lines[0].split(splitRe).map(h => h.trim());
    colMapping = guessColumnIndices(headers);
  }

  // Determine column count from first data row
  let colCount = 3;
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(splitRe);
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

    const parts = trimmed.split(splitRe).map(s => s.trim());
    if (parts.length < 3) {
      errors.push({ row: i + 1, message: `Too few columns (${parts.length})` });
      continue;
    }

    const mapping = colMapping!;
    const easting = parseFloat(parts[mapping.easting]);
    const northing = parseFloat(parts[mapping.northing]);
    const elevation = parseFloat(parts[mapping.elevation]);

    if (isNaN(easting) || isNaN(northing) || isNaN(elevation)) {
      errors.push({ row: i + 1, message: 'Non-numeric coordinate value' });
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

function generateDemoData(): SpotHeight[] {
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

function elevationToColor(elevation: number, minElev: number, maxElev: number): string {
  const range = maxElev - minElev || 1;
  const t = Math.max(0, Math.min(1, (elevation - minElev) / range));
  // HSL gradient: green (120) -> yellow (60) -> brown (30)
  const hue = 120 - t * 90; // 120 (green) to 30 (brown/orange)
  const saturation = 55 + t * 25;
  const lightness = 40 + (1 - Math.abs(t - 0.5) * 2) * 15;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function downloadBlob(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generateDXF(contours: ContourLine[], bounds: { minE: number; maxE: number; minN: number; maxN: number }): string {
  const lines: string[] = [];
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('HEADER');
  lines.push('0');
  lines.push('ENDSEC');
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('TABLES');
  lines.push('0');
  lines.push('TABLE');
  lines.push('2');
  lines.push('LAYER');
  lines.push('70');
  lines.push(String(contours.length));

  const uniqueElevations = [...new Set(contours.map(c => c.elevation))].sort((a, b) => a - b);
  for (const elev of uniqueElevations) {
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push(`C${elev.toFixed(1)}`);
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('7');
    lines.push('6');
    lines.push('CONTINUOUS');
  }

  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDSEC');

  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('ENTITIES');

  for (const contour of contours) {
    const layerName = `C${contour.elevation.toFixed(1)}`;
    lines.push('0');
    lines.push('LWPOLYLINE');
    lines.push('8');
    lines.push(layerName);
    lines.push('62');
    lines.push('7');
    lines.push('90');
    lines.push(String(contour.points.length));

    if (contour.points[0].easting === contour.points[contour.points.length - 1].easting &&
        contour.points[0].northing === contour.points[contour.points.length - 1].northing) {
      lines.push('70');
      lines.push('1');
    } else {
      lines.push('70');
      lines.push('0');
    }

    for (const pt of contour.points) {
      lines.push('10');
      lines.push(fmt(pt.easting, 4));
      lines.push('20');
      lines.push(fmt(pt.northing, 4));
    }
  }

  lines.push('0');
  lines.push('ENDSEC');
  lines.push('0');
  lines.push('EOF');
  return lines.join('\n');
}

function generateSVGExport(
  contours: ContourLine[],
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  points: SpotHeight[]
): string {
  const usableW = SVG_WIDTH - 2 * MARGIN;
  const usableH = SVG_HEIGHT - 2 * MARGIN;
  const rangeE = bounds.maxE - bounds.minE || 1;
  const rangeN = bounds.maxN - bounds.minN || 1;

  const elevations = contours.map(c => c.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  function toSvgX(e: number) { return MARGIN + ((e - bounds.minE) / rangeE) * usableW; }
  function toSvgY(n: number) { return MARGIN + ((bounds.maxN - n) / rangeN) * usableH; }

  const svgLines: string[] = [];
  svgLines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">`);
  svgLines.push(`<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#1a1a2e"/>`);
  svgLines.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${usableW}" height="${usableH}" fill="#0d1117" stroke="#30363d" stroke-width="1"/>`);

  // Contour lines
  for (const contour of contours) {
    const color = elevationToColor(contour.elevation, minElev, maxElev);
    const sw = contour.isIndex ? 2.0 : 0.8;
    const pts = contour.points.map(p => `${toSvgX(p.easting).toFixed(2)},${toSvgY(p.northing).toFixed(2)}`).join(' ');
    svgLines.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`);

    if (contour.isIndex && contour.points.length > 5) {
      const midIdx = Math.floor(contour.points.length / 2);
      const midPt = contour.points[midIdx];
      const x = toSvgX(midPt.easting);
      const y = toSvgY(midPt.northing);
      svgLines.push(`<text x="${x.toFixed(2)}" y="${(y - 3).toFixed(2)}" fill="#e0e0e0" font-size="10" font-family="monospace" text-anchor="middle">${contour.elevation.toFixed(1)}</text>`);
    }
  }

  // Spot height crosses
  for (const pt of points) {
    const x = toSvgX(pt.easting);
    const y = toSvgY(pt.northing);
    svgLines.push(`<line x1="${(x - 3).toFixed(2)}" y1="${(y - 3).toFixed(2)}" x2="${(x + 3).toFixed(2)}" y2="${(y + 3).toFixed(2)}" stroke="#666" stroke-width="0.5"/>`);
    svgLines.push(`<line x1="${(x + 3).toFixed(2)}" y1="${(y - 3).toFixed(2)}" x2="${(x - 3).toFixed(2)}" y2="${(y + 3).toFixed(2)}" stroke="#666" stroke-width="0.5"/>`);
  }

  // Coordinate labels
  const numTicksE = 5;
  const numTicksN = 5;
  for (let i = 0; i <= numTicksE; i++) {
    const e = bounds.minE + (rangeE * i) / numTicksE;
    const x = toSvgX(e);
    svgLines.push(`<text x="${x.toFixed(2)}" y="${(SVG_HEIGHT - MARGIN / 3).toFixed(2)}" fill="#888" font-size="9" font-family="monospace" text-anchor="middle">${e.toFixed(1)}</text>`);
  }
  for (let i = 0; i <= numTicksN; i++) {
    const n = bounds.minN + (rangeN * i) / numTicksN;
    const y = toSvgY(n);
    svgLines.push(`<text x="${(MARGIN / 2).toFixed(2)}" y="${(y + 3).toFixed(2)}" fill="#888" font-size="9" font-family="monospace" text-anchor="middle">${n.toFixed(1)}</text>`);
  }

  // North arrow
  svgLines.push(`<g transform="translate(${SVG_WIDTH - 40}, ${MARGIN + 30})">`);
  svgLines.push(`<line x1="0" y1="20" x2="0" y2="0" stroke="#aaa" stroke-width="1.5"/>`);
  svgLines.push(`<polygon points="0,0 -4,8 4,8" fill="#aaa"/>`);
  svgLines.push(`<text x="0" y="30" fill="#aaa" font-size="10" text-anchor="middle" font-family="sans-serif">N</text>`);
  svgLines.push(`</g>`);

  // Scale bar
  const scaleBarWorldLen = rangeE / 5;
  const scaleBarSvgLen = usableW / 5;
  const sbX = MARGIN;
  const sbY = SVG_HEIGHT - 18;
  svgLines.push(`<line x1="${sbX}" y1="${sbY}" x2="${sbX + scaleBarSvgLen}" y2="${sbY}" stroke="#aaa" stroke-width="1.5"/>`);
  svgLines.push(`<line x1="${sbX}" y1="${sbY - 3}" x2="${sbX}" y2="${sbY + 3}" stroke="#aaa" stroke-width="1"/>`);
  svgLines.push(`<line x1="${(sbX + scaleBarSvgLen).toFixed(2)}" y1="${sbY - 3}" x2="${(sbX + scaleBarSvgLen).toFixed(2)}" y2="${sbY + 3}" stroke="#aaa" stroke-width="1"/>`);
  svgLines.push(`<text x="${(sbX + scaleBarSvgLen / 2).toFixed(2)}" y="${(sbY - 5).toFixed(2)}" fill="#aaa" font-size="9" text-anchor="middle" font-family="monospace">${scaleBarWorldLen.toFixed(1)} m</text>`);

  svgLines.push(`</svg>`);
  return svgLines.join('\n');
}

function generateContourCSV(contours: ContourLine[]): string {
  const lines: string[] = [];
  lines.push('contour_id,elevation,is_index,point_index,easting,northing');
  let contourId = 0;
  for (const contour of contours) {
    contourId++;
    for (let i = 0; i < contour.points.length; i++) {
      const pt = contour.points[i];
      lines.push(
        `${contourId},${contour.elevation.toFixed(4)},${contour.isIndex ? 'true' : 'false'},${i},${pt.easting.toFixed(4)},${pt.northing.toFixed(4)}`
      );
    }
  }
  return lines.join('\n');
}

function generateGeoJSON(contours: ContourLine[]): string {
  const features = contours.map((contour, idx) => ({
    type: 'Feature' as const,
    properties: {
      id: idx + 1,
      elevation: contour.elevation,
      is_index: contour.isIndex,
    },
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: [
        contour.points.map(p => [p.easting, p.northing]),
      ],
    },
  }));
  const geojson = {
    type: 'FeatureCollection' as const,
    features,
  };
  return JSON.stringify(geojson, null, 2);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContourGeneratorPage() {
  const [activeTab, setActiveTab] = useState<TabId>('import');

  // Tab 1: Import state
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [points, setPoints] = useState<SpotHeight[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [importStats, setImportStats] = useState<{
    delimiter: string;
    hasHeader: boolean;
  } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Settings state
  const [contourInterval, setContourInterval] = useState(1.0);
  const [indexMultiplier, setIndexMultiplier] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Results
  const [contours, setContours] = useState<ContourLine[]>([]);
  const [tinSurface, setTinSurface] = useState<TINSurface | null>(null);
  const [volumeResult, setVolumeResult] = useState<{ cut: number; fill: number; net: number } | null>(null);

  // ─── Bounding box computation ────────────────────────────────────────────

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p.easting < minE) minE = p.easting;
      if (p.easting > maxE) maxE = p.easting;
      if (p.northing < minN) minN = p.northing;
      if (p.northing > maxN) maxN = p.northing;
      if (p.elevation < minZ) minZ = p.elevation;
      if (p.elevation > maxZ) maxZ = p.elevation;
    }
    return { minE, maxE, minN, maxN, minZ, maxZ };
  }, [points]);

  // ─── File upload handler ──────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    setFileName(file.name);
    setIsParsing(true);
    setParseErrors([]);
    setContours([]);
    setTinSurface(null);
    setVolumeResult(null);

    try {
      const text = await file.text();
      setRawText(text);
      processText(text);
    } catch (err) {
      setParseErrors([{ row: 0, message: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const processText = useCallback((text: string) => {
    setIsParsing(true);
    setParseErrors([]);
    setContours([]);
    setTinSurface(null);
    setVolumeResult(null);

    try {
      const result = parseXYZText(text);
      const spotHeights: SpotHeight[] = result.points.map(p => ({
        name: p.name,
        easting: p.easting,
        northing: p.northing,
        elevation: p.elevation,
      }));
      setPoints(spotHeights);
      setParseErrors(result.errors);
      setImportStats({
        delimiter: result.delimiter === '\t' ? 'tab' : result.delimiter === ',' ? 'comma' : result.delimiter === ';' ? 'semicolon' : 'space',
        hasHeader: result.hasHeader,
      });
    } catch (err) {
      setParseErrors([{ row: 0, message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handlePasteParse = useCallback(() => {
    if (!rawText.trim()) return;
    processText(rawText);
  }, [rawText, processText]);

  const handleLoadDemo = useCallback(() => {
    const demoPoints = generateDemoData();
    setPoints(demoPoints);
    setContours([]);
    setTinSurface(null);
    setVolumeResult(null);
    setParseErrors([]);
    setFileName('demo_terrain.csv');
    setImportStats({ delimiter: 'comma', hasHeader: true });
    // Build a demo CSV text for display
    const csvLines = ['Name,Easting,Northing,Elevation'];
    for (const p of demoPoints.slice(0, 10)) {
      csvLines.push(`${p.name},${fmt(p.easting, 3)},${fmt(p.northing, 3)},${fmt(p.elevation, 2)}`);
    }
    csvLines.push(`... (${demoPoints.length} points total)`);
    setRawText(csvLines.join('\n'));
  }, []);

  // ─── Generate contours ───────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (points.length < 3) {
      setGenerateError('At least 3 points are required to generate contours.');
      return;
    }
    if (contourInterval <= 0) {
      setGenerateError('Contour interval must be positive.');
      return;
    }

    setIsGenerating(true);
    setGenerateError('');

    setTimeout(() => {
      try {
        const indexInterval = contourInterval * indexMultiplier;
        const result = generateContours(points, contourInterval, indexInterval);
        setContours(result);

        const surface = buildTINSurface(points);
        setTinSurface(surface);

        // Compute volume relative to minimum elevation
        const minElev = Math.min(...points.map(p => p.elevation));
        const vol = computeVolumeFromTIN(surface, minElev);
        setVolumeResult(vol);
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : 'Contour generation failed.');
      } finally {
        setIsGenerating(false);
      }
    }, 50);
  }, [points, contourInterval, indexMultiplier]);

  // ─── Export handlers ─────────────────────────────────────────────────────

  const exportDXF = useCallback(() => {
    if (!contours.length || !bounds) return;
    const dxf = generateDXF(contours, bounds);
    downloadBlob(dxf, 'contours.dxf', 'application/dxf');
  }, [contours, bounds]);

  const exportSVG = useCallback(() => {
    if (!contours.length || !bounds) return;
    const svg = generateSVGExport(contours, bounds, points);
    downloadBlob(svg, 'contours.svg', 'image/svg+xml');
  }, [contours, bounds, points]);

  const exportCSV = useCallback(() => {
    if (!contours.length) return;
    const csv = generateContourCSV(contours);
    downloadBlob(csv, 'contours.csv', 'text/csv');
  }, [contours]);

  const exportGeoJSON = useCallback(() => {
    if (!contours.length) return;
    const geojson = generateGeoJSON(contours);
    downloadBlob(geojson, 'contours.geojson', 'application/geo+json');
  }, [contours]);

  // ─── SVG rendering computations ──────────────────────────────────────────

  const svgElements = useMemo(() => {
    if (!contours.length || !bounds) return null;

    const usableW = SVG_WIDTH - 2 * MARGIN;
    const usableH = SVG_HEIGHT - 2 * MARGIN;
    const minE = bounds.minE;
    const maxE = bounds.maxE;
    const minN = bounds.minN;
    const maxN = bounds.maxN;
    const rangeE = maxE - minE || 1;
    const rangeN = maxN - minN || 1;

    const contourElevations = contours.map(c => c.elevation);
    const minElev = Math.min(...contourElevations);
    const maxElev = Math.max(...contourElevations);

    function toSvgX(e: number) { return MARGIN + ((e - minE) / rangeE) * usableW; }
    function toSvgY(n: number) { return MARGIN + ((maxN - n) / rangeN) * usableH; }

    // Subsample spot height points for rendering if too many
    const spotStep = Math.max(1, Math.floor(points.length / 2000));
    const spotSampled = points.filter((_, i) => i % spotStep === 0);

    return {
      usableW, usableH, rangeE, rangeN, minElev, maxElev, toSvgX, toSvgY, spotSampled,
      viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`,
    };
  }, [contours, bounds, points]);

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; disabled?: boolean }[] = [
    { id: 'import', label: 'Import Points' },
    { id: 'settings', label: 'Settings & Generate', disabled: points.length < 3 },
    { id: 'map', label: 'Contour Map', disabled: contours.length === 0 },
    { id: 'export', label: 'Export', disabled: contours.length === 0 },
  ];

  const previewRows = points.slice(0, 5);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Custom header (mutation-plan pattern) */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-emerald-500/10 rounded-lg">
          <Mountain className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Contour Generator</h1>
          <p className="text-sm text-zinc-400">
            Generate topographic contour lines from point cloud data using Delaunay TIN triangulation.
            Supports CSV, TXT, XYZ import and DXF, SVG, CSV, GeoJSON export. Referenced from Ghilani &amp; Wolf &sect;17, USACE EM 1110-1-1005.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mt-6 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              tab.disabled
                ? 'opacity-40 cursor-not-allowed bg-[var(--bg-tertiary)] text-zinc-600'
                : activeTab === tab.id
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB 1: Import Points ═══════════════════ */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* File upload zone */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-sm font-semibold text-white mb-2">Upload Point Cloud File</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Accepts CSV, TXT, and XYZ files. Expected columns: Name, Easting, Northing, Elevation.
              Comment lines starting with <code className="font-mono bg-[var(--bg-tertiary)] px-1 rounded">#</code> are skipped.
            </p>
            <div
              onDrop={handleDropZone}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              className="border-2 border-dashed border-[var(--border-color)] rounded-lg p-8 text-center hover:border-[var(--accent)] transition-colors cursor-pointer mb-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-[var(--text-secondary)] mb-1">
                Drag &amp; drop a file here, or click to browse
              </p>
              <p className="text-xs text-zinc-500">
                .csv .txt .xyz
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xyz"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {fileName && (
              <div className="text-sm text-[var(--text-secondary)]">
                File: <span className="font-mono text-[var(--accent)]">{fileName}</span>
              </div>
            )}
          </div>

          {/* Text paste area */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-white">Paste Data Directly</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleLoadDemo}
                  className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  Load Demo Data
                </button>
                <button
                  onClick={handlePasteParse}
                  disabled={isParsing || !rawText.trim()}
                  className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold disabled:opacity-40"
                >
                  {isParsing ? 'Parsing...' : 'Parse Data'}
                </button>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              Paste tab-separated, comma-separated, or space-separated data. Auto-detects delimiters and headers.
            </p>
            <textarea
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)] font-mono text-xs"
              rows={10}
              placeholder={`Name,Easting,Northing,Elevation\nCP1,484500.000,9863100.000,1205.500\nCP2,484750.000,9863250.000,1182.250\nCP3,485000.000,9863400.000,1198.800\n...`}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
            />
          </div>

          {/* Import summary */}
          {points.length > 0 && bounds && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-white mb-4">Import Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Point Count</span>
                  <span className="font-mono text-xl text-[var(--accent)]">{points.length.toLocaleString()}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Delimiter</span>
                  <span className="font-mono text-xl">{importStats?.delimiter || '\u2014'}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Header Detected</span>
                  <span className="font-mono text-xl">{importStats?.hasHeader ? 'Yes' : 'No'}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Elevation Range</span>
                  <span className="font-mono text-xl">{fmt(bounds.minZ, 1)} \u2013 {fmt(bounds.maxZ, 1)} m</span>
                </div>
              </div>

              {/* Bounding box */}
              <div className="mb-4">
                <span className="text-sm text-[var(--text-secondary)]">Bounding Box: </span>
                <span className="font-mono text-sm">
                  E [{fmt(bounds.minE, 2)}, {fmt(bounds.maxE, 2)}] &nbsp;
                  N [{fmt(bounds.minN, 2)}, {fmt(bounds.maxN, 2)}] &nbsp;
                  Z [{fmt(bounds.minZ, 2)}, {fmt(bounds.maxZ, 2)}]
                </span>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-medium">Name</th>
                      <th className="text-right py-2 px-3 text-[var(--text-secondary)] font-medium">Easting (m)</th>
                      <th className="text-right py-2 px-3 text-[var(--text-secondary)] font-medium">Northing (m)</th>
                      <th className="text-right py-2 px-3 text-[var(--text-secondary)] font-medium">Elevation (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((p, i) => (
                      <tr key={i} className="border-b border-zinc-800">
                        <td className="py-2 px-3 font-semibold text-white">{p.name}</td>
                        <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmt(p.easting)}</td>
                        <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmt(p.northing)}</td>
                        <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmt(p.elevation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {points.length > 5 && (
                <p className="text-xs text-zinc-400 mt-2">
                  Showing first 5 of {points.length.toLocaleString()} points.
                </p>
              )}
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-red-400 mb-3">
                Parse Errors ({parseErrors.length})
              </h2>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-medium">Row</th>
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseErrors.map((err, i) => (
                      <tr key={i} className="border-b border-zinc-800">
                        <td className="py-2 px-3 font-mono text-zinc-300">{err.row}</td>
                        <td className="py-2 px-3 text-red-400 text-sm">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseErrors.length >= 50 && (
                <p className="text-xs text-zinc-400 mt-2">Showing first 50 errors only.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB 2: Settings & Generate ═══════════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Contour Generation Settings</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Contour Interval (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={contourInterval}
                  onChange={e => setContourInterval(parseFloat(e.target.value) || 1.0)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]"
                />
                <p className="text-xs text-zinc-500 mt-1">Vertical spacing between contours</p>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Index Contour Multiplier
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={indexMultiplier}
                  onChange={e => setIndexMultiplier(parseInt(e.target.value) || 5)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Every Nth contour is an index (thick) line (interval &times; {indexMultiplier} = {(contourInterval * indexMultiplier).toFixed(1)} m)
                </p>
              </div>
              <div className="flex flex-col">
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Points Available</label>
                <div className="px-3 py-2 bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg text-sm text-zinc-300">
                  {points.length.toLocaleString()} points
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {bounds ? `Elevation range: ${fmt(bounds.minZ, 1)} \u2013 ${fmt(bounds.maxZ, 1)} m` : '\u2014'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || points.length < 3}
                className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate Contours'
                )}
              </button>
              {isGenerating && (
                <span className="text-sm text-zinc-400">Building TIN and marching contours...</span>
              )}
            </div>
          </div>

          {generateError && (
            <div className="p-4 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
              {generateError}
            </div>
          )}

          {/* Results summary */}
          {contours.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-white mb-4">Generation Results</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Contour Lines</span>
                  <span className="font-mono text-xl text-[var(--accent)]">{contours.length}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Index Contours</span>
                  <span className="font-mono text-xl">{contours.filter(c => c.isIndex).length}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">TIN Triangles</span>
                  <span className="font-mono text-xl">{tinSurface?.triangles.length || 0}</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Volume (above min Z)</span>
                  <span className="font-mono text-lg">
                    {volumeResult ? `${fmt(volumeResult.cut, 1)} m\u00B3` : '\u2014'}
                  </span>
                </div>
              </div>

              {/* Contour elevation list */}
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                  Contour Elevations
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const uniqueElevations = [...new Set(contours.map(c => c.elevation))].sort((a, b) => a - b);
                    return uniqueElevations.map(elev => {
                      const contour = contours.find(c => c.elevation === elev);
                      const isIndex = contour?.isIndex;
                      return (
                        <span
                          key={elev}
                          className={`px-2 py-1 rounded text-xs font-mono ${
                            isIndex
                              ? 'bg-[var(--accent)] text-black font-bold'
                              : 'bg-[var(--bg-tertiary)] text-zinc-400'
                          }`}
                        >
                          {elev.toFixed(1)}{isIndex ? ' (idx)' : ''}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB 3: Contour Map ═══════════════════ */}
      {activeTab === 'map' && svgElements && bounds && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Contour Map</h2>

            <svg
              viewBox={svgElements.viewBox}
              className="w-full rounded"
              style={{ maxHeight: '700px', background: '#0d1117' }}
            >
              {/* Background */}
              <rect
                x={MARGIN}
                y={MARGIN}
                width={svgElements.usableW}
                height={svgElements.usableH}
                fill="#0d1117"
                stroke="#30363d"
                strokeWidth="1"
              />

              {/* Grid lines */}
              {(() => {
                const numTicksE = 6;
                const numTicksN = 6;
                const gridLines: React.ReactNode[] = [];
                for (let i = 0; i <= numTicksE; i++) {
                  const e = bounds.minE + (svgElements.rangeE * i) / numTicksE;
                  const x = svgElements.toSvgX(e);
                  gridLines.push(
                    <line key={`ge${i}`} x1={x} y1={MARGIN} x2={x} y2={MARGIN + svgElements.usableH} stroke="#1a2233" strokeWidth="0.5" />
                  );
                }
                for (let i = 0; i <= numTicksN; i++) {
                  const n = bounds.minN + (svgElements.rangeN * i) / numTicksN;
                  const y = svgElements.toSvgY(n);
                  gridLines.push(
                    <line key={`gn${i}`} x1={MARGIN} y1={y} x2={MARGIN + svgElements.usableW} y2={y} stroke="#1a2233" strokeWidth="0.5" />
                  );
                }
                return gridLines;
              })()}

              {/* Contour lines */}
              {contours.map((contour, ci) => {
                const color = elevationToColor(contour.elevation, svgElements.minElev, svgElements.maxElev);
                const sw = contour.isIndex ? 2.0 : 0.8;
                const pts = contour.points
                  .map(p => `${svgElements.toSvgX(p.easting).toFixed(2)},${svgElements.toSvgY(p.northing).toFixed(2)}`)
                  .join(' ');

                return (
                  <g key={`c${ci}`}>
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={color}
                      strokeWidth={sw}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {/* Index contour labels */}
                    {contour.isIndex && contour.points.length > 8 && (() => {
                      const labelPositions: number[] = [];
                      const step = Math.max(1, Math.floor(contour.points.length / 4));
                      for (let li = step; li < contour.points.length - step; li += step) {
                        labelPositions.push(li);
                      }
                      return labelPositions.map((li, lidx) => {
                        const pt = contour.points[li];
                        const x = svgElements.toSvgX(pt.easting);
                        const y = svgElements.toSvgY(pt.northing);
                        // Calculate text rotation based on line direction
                        const prev = contour.points[Math.max(0, li - 2)];
                        const next = contour.points[Math.min(contour.points.length - 1, li + 2)];
                        const dx = svgElements.toSvgX(next.easting) - svgElements.toSvgX(prev.easting);
                        const dy = svgElements.toSvgY(next.northing) - svgElements.toSvgY(prev.northing);
                        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        if (angle > 90) angle -= 180;
                        if (angle < -90) angle += 180;
                        return (
                          <text
                            key={`l${lidx}`}
                            x={x.toFixed(2)}
                            y={(y - 3).toFixed(2)}
                            fill="#e0e0e0"
                            fontSize="10"
                            fontFamily="monospace"
                            textAnchor="middle"
                            transform={`rotate(${angle.toFixed(1)}, ${x.toFixed(2)}, ${(y - 3).toFixed(2)})`}
                            paintOrder="stroke"
                            stroke="#0d1117"
                            strokeWidth="3"
                            strokeLinejoin="round"
                          >
                            {contour.elevation.toFixed(1)}
                          </text>
                        );
                      });
                    })()}
                  </g>
                );
              })}

              {/* Spot height crosses */}
              {svgElements.spotSampled.map((pt, i) => {
                const x = svgElements.toSvgX(pt.easting);
                const y = svgElements.toSvgY(pt.northing);
                return (
                  <g key={`sp${i}`}>
                    <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} stroke="#555" strokeWidth="0.5" />
                    <line x1={x + 3} y1={y - 3} x2={x - 3} y2={y + 3} stroke="#555" strokeWidth="0.5" />
                  </g>
                );
              })}

              {/* Coordinate labels - Easting (bottom) */}
              {(() => {
                const numTicks = 6;
                const labels: React.ReactNode[] = [];
                for (let i = 0; i <= numTicks; i++) {
                  const e = bounds.minE + (svgElements.rangeE * i) / numTicks;
                  const x = svgElements.toSvgX(e);
                  labels.push(
                    <text key={`et${i}`} x={x.toFixed(2)} y={SVG_HEIGHT - MARGIN / 3} fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">
                      {e.toFixed(1)}
                    </text>
                  );
                  // Tick mark
                  labels.push(
                    <line key={`em${i}`} x1={x} y1={MARGIN + svgElements.usableH} x2={x} y2={MARGIN + svgElements.usableH + 5} stroke="#555" strokeWidth="0.5" />
                  );
                }
                return labels;
              })()}

              {/* Coordinate labels - Northing (left) */}
              {(() => {
                const numTicks = 6;
                const labels: React.ReactNode[] = [];
                for (let i = 0; i <= numTicks; i++) {
                  const n = bounds.minN + (svgElements.rangeN * i) / numTicks;
                  const y = svgElements.toSvgY(n);
                  labels.push(
                    <text key={`nt${i}`} x={MARGIN / 2} y={(y + 3).toFixed(2)} fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">
                      {n.toFixed(1)}
                    </text>
                  );
                  // Tick mark
                  labels.push(
                    <line key={`nm${i}`} x1={MARGIN - 5} y1={y} x2={MARGIN} y2={y} stroke="#555" strokeWidth="0.5" />
                  );
                }
                return labels;
              })()}

              {/* Axis labels */}
              <text
                x={MARGIN + svgElements.usableW / 2}
                y={SVG_HEIGHT - 5}
                fill="#888"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                Easting (m)
              </text>
              <text
                x={10}
                y={MARGIN + svgElements.usableH / 2}
                fill="#888"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
                transform={`rotate(-90, 10, ${MARGIN + svgElements.usableH / 2})`}
              >
                Northing (m)
              </text>

              {/* North arrow */}
              <g transform={`translate(${SVG_WIDTH - 40}, ${MARGIN + 30})`}>
                <line x1="0" y1="20" x2="0" y2="0" stroke="#aaa" strokeWidth="1.5" />
                <polygon points="0,0 -4,8 4,8" fill="#aaa" />
                <text x="0" y="32" fill="#aaa" fontSize="10" textAnchor="middle" fontFamily="sans-serif">N</text>
              </g>

              {/* Scale bar */}
              {(() => {
                const scaleBarWorldLen = svgElements.rangeE / 5;
                const scaleBarSvgLen = svgElements.usableW / 5;
                const sbX = MARGIN + svgElements.usableW - scaleBarSvgLen;
                const sbY = SVG_HEIGHT - MARGIN / 3 - 2;
                return (
                  <g>
                    <rect x={sbX} y={sbY - 4} width={scaleBarSvgLen} height={8} fill="none" stroke="#aaa" strokeWidth="1" />
                    <rect x={sbX} y={sbY - 4} width={scaleBarSvgLen / 2} height={8} fill="#aaa" />
                    <text
                      x={(sbX + scaleBarSvgLen / 2).toFixed(2)}
                      y={(sbY - 8).toFixed(2)}
                      fill="#aaa"
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {scaleBarWorldLen.toFixed(1)} m
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* Color legend */}
            <div className="flex items-center gap-2 mt-4 justify-center">
              <span className="text-xs text-zinc-500">Low ({svgElements.minElev.toFixed(1)}m)</span>
              <div
                className="w-48 h-3 rounded"
                style={{
                  background: `linear-gradient(to right, ${[
                    0, 0.25, 0.5, 0.75, 1.0,
                  ].map(t => elevationToColor(svgElements.minElev + t * (svgElements.maxElev - svgElements.minElev), svgElements.minElev, svgElements.maxElev)).join(', ')})`,
                }}
              />
              <span className="text-xs text-zinc-500">High ({svgElements.maxElev.toFixed(1)}m)</span>
            </div>

            {/* Map statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="p-3 bg-[var(--bg-tertiary)] rounded">
                <span className="text-[var(--text-secondary)] text-xs block">Contour Lines</span>
                <span className="font-mono text-sm text-white">{contours.length}</span>
              </div>
              <div className="p-3 bg-[var(--bg-tertiary)] rounded">
                <span className="text-[var(--text-secondary)] text-xs block">Index Contours</span>
                <span className="font-mono text-sm text-white">{contours.filter(c => c.isIndex).length}</span>
              </div>
              <div className="p-3 bg-[var(--bg-tertiary)] rounded">
                <span className="text-[var(--text-secondary)] text-xs block">Data Points</span>
                <span className="font-mono text-sm text-white">{points.length}</span>
              </div>
              <div className="p-3 bg-[var(--bg-tertiary)] rounded">
                <span className="text-[var(--text-secondary)] text-xs block">Contour Interval</span>
                <span className="font-mono text-sm text-white">{contourInterval.toFixed(1)} m</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB 4: Export ═══════════════════ */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-sm font-semibold text-white mb-2">Export Contour Data</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Download contour data in your preferred format. All exports use the generated contour data.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* DXF Export */}
              <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                    DXF
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">AutoCAD DXF</h3>
                    <p className="text-xs text-zinc-500">LWPOLYLINE per contour, layers by elevation</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  Compatible with AutoCAD, Civil 3D, MicroSurvey, QGIS. Each contour placed on its own
                  elevation layer (e.g., C100.0, C101.0).
                </p>
                <button
                  onClick={exportDXF}
                  className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
                >
                  Download DXF
                </button>
              </div>

              {/* SVG Export */}
              <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm font-bold flex-shrink-0">
                    SVG
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">SVG Vector Image</h3>
                    <p className="text-xs text-zinc-500">Full SVG with viewBox, styled contour map</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  Scalable vector graphic of the contour map. Includes coordinate labels, north arrow,
                  scale bar, and elevation coloring. Edit in Inkscape or Illustrator.
                </p>
                <button
                  onClick={exportSVG}
                  className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
                >
                  Download SVG
                </button>
              </div>

              {/* CSV Export */}
              <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400 text-sm font-bold flex-shrink-0">
                    CSV
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">CSV Spreadsheet</h3>
                    <p className="text-xs text-zinc-500">Contour points as tabular data</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  Columns: contour_id, elevation, is_index, point_index, easting, northing.
                  Import into Excel, Google Sheets, or any spreadsheet software.
                </p>
                <button
                  onClick={exportCSV}
                  className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
                >
                  Download CSV
                </button>
              </div>

              {/* GeoJSON Export */}
              <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm font-bold flex-shrink-0">
                    GEO
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">GeoJSON</h3>
                    <p className="text-xs text-zinc-500">MultiLineString per contour with properties</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  Standard GeoJSON FeatureCollection. Each contour is a MultiLineString with
                  elevation and is_index properties. Drop into QGIS, Mapbox, or Leaflet.
                </p>
                <button
                  onClick={exportGeoJSON}
                  className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
                >
                  Download GeoJSON
                </button>
              </div>
            </div>
          </div>

          {/* Volume information */}
          {volumeResult && bounds && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-white mb-4">Volume Summary</h2>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Volume computed from TIN surface relative to minimum elevation ({bounds.minZ.toFixed(2)} m).
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Cut Volume</span>
                  <span className="font-mono text-xl text-red-400">{fmt(volumeResult.cut, 2)} m&sup3;</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Fill Volume</span>
                  <span className="font-mono text-xl text-blue-400">{fmt(volumeResult.fill, 2)} m&sup3;</span>
                </div>
                <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                  <span className="text-[var(--text-secondary)] text-sm block">Net Volume</span>
                  <span className={`font-mono text-xl ${volumeResult.net >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                    {fmt(volumeResult.net, 2)} m&sup3;
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
