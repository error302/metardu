/**
 * Measurement calculations in SRID 21037 (Arc 1960 / UTM Zone 37S)
 * All coordinates are in meters, Kenya grid
 */

export interface Point {
  easting: number;
  northing: number;
}

export interface MeasurementResult {
  type: 'distance' | 'area' | 'bearing' | 'coordinate';
  value: number;
  formatted: string;
  unit: string;
  points?: Point[];
}

export function calculateDistance(from: Point, to: Point): number {
  const dE = to.easting - from.easting;
  const dN = to.northing - from.northing;
  return Math.sqrt(dE * dE + dN * dN);
}

export function calculateBearing(from: Point, to: Point): number {
  const dE = to.easting - from.easting;
  const dN = to.northing - from.northing;
  
  let bearing = Math.atan2(dE, dN) * 180 / Math.PI;
  
  if (bearing < 0) {
    bearing += 360;
  }
  
  return bearing;
}

export function calculateArea(vertices: Point[]): number {
  if (vertices.length < 3) return 0;
  
  let area = 0;
  const n = vertices.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].easting * vertices[j].northing;
    area -= vertices[j].easting * vertices[i].northing;
  }
  
  return Math.abs(area / 2);
}

export function squareMetersToHectares(areaM2: number): number {
  return areaM2 / 10000;
}

export function squareMetersToAcres(areaM2: number): number {
  return areaM2 / 4046.86;
}

export function formatBearingWCB(bearing: number): string {
  let quadrant: string;
  let angle: number;
  
  if (bearing >= 0 && bearing < 90) {
    quadrant = 'NE';
    angle = bearing;
  } else if (bearing >= 90 && bearing < 180) {
    quadrant = 'SE';
    angle = 180 - bearing;
  } else if (bearing >= 180 && bearing < 270) {
    quadrant = 'SW';
    angle = bearing - 180;
  } else {
    quadrant = 'NW';
    angle = 360 - bearing;
  }
  
  const degrees = Math.floor(angle);
  const minutesFloat = (angle - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  
  const degStr = degrees.toString();
  const minStr = minutes.toString().padStart(2, '0');
  const secStr = seconds.toString().padStart(2, '0');
  
  const [ns, ew] = quadrant.split('');
  
  return `${ns} ${degStr}°${minStr}'${secStr}" ${ew}`;
}

export function formatBearingAzimuth(bearing: number): string {
  return `${bearing.toFixed(4)}°`;
}

export function formatDistance(meters: number, precision: number = 3): string {
  if (meters < 1000) {
    return `${meters.toFixed(precision)} m`;
  } else {
    return `${(meters / 1000).toFixed(precision)} km`;
  }
}

export function formatArea(areaM2: number): string {
  const ha = squareMetersToHectares(areaM2);
  
  if (ha < 1) {
    return `${areaM2.toFixed(1)} m²`;
  } else if (ha < 100) {
    return `${ha.toFixed(4)} ha`;
  } else {
    return `${ha.toFixed(2)} ha`;
  }
}

export function calculatePerimeter(vertices: Point[]): number {
  if (vertices.length < 2) return 0;
  
  let perimeter = 0;
  const n = vertices.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += calculateDistance(vertices[i], vertices[j]);
  }
  
  return perimeter;
}

export function calculateCentroid(vertices: Point[]): Point {
  if (vertices.length === 0) {
    return { easting: 0, northing: 0 };
  }
  
  let sumE = 0;
  let sumN = 0;
  
  for (const v of vertices) {
    sumE += v.easting;
    sumN += v.northing;
  }
  
  return {
    easting: sumE / vertices.length,
    northing: sumN / vertices.length,
  };
}

export function calculateBounds(vertices: Point[]): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} {
  if (vertices.length === 0) {
    return { minE: 0, maxE: 0, minN: 0, maxN: 0 };
  }
  
  let minE = Infinity, maxE = -Infinity;
  let minN = Infinity, maxN = -Infinity;
  
  for (const v of vertices) {
    minE = Math.min(minE, v.easting);
    maxE = Math.max(maxE, v.easting);
    minN = Math.min(minN, v.northing);
    maxN = Math.max(maxN, v.northing);
  }
  
  return { minE, maxE, minN, maxN };
}

export function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  const n = vertices.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].easting;
    const yi = vertices[i].northing;
    const xj = vertices[j].easting;
    const yj = vertices[j].northing;
    
    if (((yi > point.northing) !== (yj > point.northing)) &&
        (point.easting < (xj - xi) * (point.northing - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

export function calculateMidpoint(from: Point, to: Point): Point {
  return {
    easting: (from.easting + to.easting) / 2,
    northing: (from.northing + to.northing) / 2,
  };
}

export function calculateOffsetPoint(
  from: Point,
  to: Point,
  offset: number
): Point {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (len === 0) return from;
  
  const px = -dy / len;
  const py = dx / len;
  
  const midE = (from.easting + to.easting) / 2;
  const midN = (from.northing + to.northing) / 2;
  
  return {
    easting: midE + px * offset,
    northing: midN + py * offset,
  };
}

export function snapToVertex(
  point: Point,
  vertices: Point[],
  tolerance: number = 1.0
): Point | null {
  let minDist = Infinity;
  let snapped: Point | null = null;
  
  for (const v of vertices) {
    const dist = calculateDistance(point, v);
    if (dist < tolerance && dist < minDist) {
      minDist = dist;
      snapped = v;
    }
  }
  
  return snapped;
}

export function snapToLine(
  point: Point,
  from: Point,
  to: Point,
  tolerance: number = 1.0
): Point | null {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const len2 = dx * dx + dy * dy;
  
  if (len2 === 0) return null;
  
  const t = ((point.easting - from.easting) * dx + (point.northing - from.northing) * dy) / len2;
  const tClamped = Math.max(0, Math.min(1, t));
  
  const proj: Point = {
    easting: from.easting + tClamped * dx,
    northing: from.northing + tClamped * dy,
  };
  
  const dist = calculateDistance(point, proj);
  
  if (dist <= tolerance) {
    return proj;
  }
  
  return null;
}