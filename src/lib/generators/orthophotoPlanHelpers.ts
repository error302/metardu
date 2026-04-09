export interface WorldPoint {
  easting: number;
  northing: number;
  name?: string;
}

export interface OverlayPolygon {
  id: string;
  kind: 'encroachment' | 'gap';
  label: string;
  area?: number;
  points: WorldPoint[];
}

export interface ImageCandidate {
  ref: string;
  score: number;
  label: string;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const ORTHO_HINT_RE = /(ortho|orthophoto|imagery|satellite|drone|uav|overlay|encroach)/i;

export function normalizeWorldPoints(input: unknown): WorldPoint[] {
  if (!Array.isArray(input)) return [];

  const points: WorldPoint[] = [];

  input.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const easting = coerceNumber(
      record.easting ?? record.x ?? record.lng ?? record.lon ?? record.longitude
    );
    const northing = coerceNumber(
      record.northing ?? record.y ?? record.lat ?? record.latitude
    );

    if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
      return;
    }

    points.push({
      easting,
      northing,
      name: typeof record.name === 'string'
        ? record.name
        : typeof record.id === 'string'
          ? record.id
          : `P${index + 1}`,
    });
  });

  return points;
}

export function chooseBoundaryPoints(parcelBoundary: unknown, surveyPoints: unknown): WorldPoint[] {
  const parcelPoints = normalizeWorldPoints(parcelBoundary);
  if (parcelPoints.length >= 3) {
    return parcelPoints;
  }

  if (!Array.isArray(surveyPoints)) return [];
  const normalizedPoints: Array<WorldPoint & { isControl: boolean }> = [];
  surveyPoints.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const easting = coerceNumber(record.easting);
    const northing = coerceNumber(record.northing);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return;

    normalizedPoints.push({
      easting,
      northing,
      name: typeof record.name === 'string' ? record.name : undefined,
      isControl: Boolean(record.is_control),
    });
  });

  const controlPoints = normalizedPoints.filter((point) => point.isControl);
  if (controlPoints.length >= 3) {
    return controlPoints.map(({ isControl: _isControl, ...point }) => point);
  }

  if (normalizedPoints.length >= 3) {
    return normalizedPoints.map(({ isControl: _isControl, ...point }) => point);
  }

  return [];
}

export function extractOverlayPolygons(validation: unknown): OverlayPolygon[] {
  if (!validation || typeof validation !== 'object') return [];

  const record = validation as Record<string, unknown>;
  const overlays: OverlayPolygon[] = [];

  pushOverlayGroup(overlays, record.overlaps, 'encroachment', 'Encroachment');
  pushOverlayGroup(overlays, record.gaps, 'gap', 'Gap');

  return overlays;
}

export function chooseOrthophotoCandidate(...sources: unknown[]): ImageCandidate | null {
  const candidates: ImageCandidate[] = [];

  sources.forEach((source, sourceIndex) => {
    collectImageReferences(source, `source-${sourceIndex + 1}`, candidates);
  });

  candidates.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
  return candidates[0] ?? null;
}

export function computeBoundingBox(points: WorldPoint[]): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} {
  if (points.length === 0) {
    return { minE: 0, maxE: 1, minN: 0, maxN: 1 };
  }

  return points.reduce(
    (acc, point) => ({
      minE: Math.min(acc.minE, point.easting),
      maxE: Math.max(acc.maxE, point.easting),
      minN: Math.min(acc.minN, point.northing),
      maxN: Math.max(acc.maxN, point.northing),
    }),
    {
      minE: points[0].easting,
      maxE: points[0].easting,
      minN: points[0].northing,
      maxN: points[0].northing,
    }
  );
}

export function computeScaleBarLengthMetres(points: WorldPoint[]): number {
  const { minE, maxE, minN, maxN } = computeBoundingBox(points);
  const dominantRange = Math.max(maxE - minE, maxN - minN);
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return candidates.find((candidate) => candidate >= dominantRange / 4) ?? 1000;
}

function pushOverlayGroup(
  target: OverlayPolygon[],
  rawGroup: unknown,
  kind: OverlayPolygon['kind'],
  defaultLabel: string
) {
  if (!Array.isArray(rawGroup)) return;

  rawGroup.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const points = normalizeWorldPoints(record.coordinates ?? record.points ?? record.boundary);
    if (points.length < 3) return;

    target.push({
      id: typeof record.id === 'string' ? record.id : `${kind}-${index + 1}`,
      kind,
      label: typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description.trim()
        : `${defaultLabel} ${index + 1}`,
      area: coerceNumber(record.area),
      points,
    });
  });
}

function collectImageReferences(input: unknown, label: string, target: ImageCandidate[], depth = 0) {
  if (depth > 5 || input == null) return;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;

    const looksLikeImage = IMAGE_EXT_RE.test(trimmed) || trimmed.startsWith('data:image/');
    const looksRelevant = ORTHO_HINT_RE.test(trimmed) || looksLikeImage;
    if (!looksRelevant) return;

    let score = 0;
    if (looksLikeImage) score += 5;
    if (ORTHO_HINT_RE.test(trimmed)) score += 8;
    if (/encroach/i.test(trimmed)) score += 2;
    if (/\.tif{1,2}$/i.test(trimmed)) score += 2;
    if (/^https?:/i.test(trimmed) || trimmed.startsWith('/uploads/')) score += 2;

    target.push({ ref: trimmed, score, label });
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectImageReferences(item, label, target, depth + 1));
    return;
  }

  if (typeof input === 'object') {
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      const childLabel = `${label}:${key}`;
      if (
        typeof value === 'string' &&
        (ORTHO_HINT_RE.test(key) || /url|path|image|file/i.test(key))
      ) {
        collectImageReferences(value, childLabel, target, depth + 1);
      } else if (typeof value === 'object') {
        collectImageReferences(value, childLabel, target, depth + 1);
      }
    });
  }
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}
