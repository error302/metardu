export type Point = { easting: number; northing: number };

export interface GeofenceZone {
  boundary: Point[];
  bufferDistance: number;
}

export interface HazardZone {
  center: Point;
  radius: number;
  type: string;
}

export type GeofenceStatus = 
  | 'INSIDE_SAFE'
  | 'BOUNDARY_WARNING'
  | 'OUTSIDE_BREACH'
  | 'HAZARD_PROXIMITY'
  | 'UNKNOWN';

/**
 * Determines if a point is inside a polygon using ray-casting.
 * Based on Jordan curve theorem.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].easting, yi = polygon[i].northing;
    const xj = polygon[j].easting, yj = polygon[j].northing;

    const intersect = ((yi > point.northing) !== (yj > point.northing))
        && (point.easting < (xj - xi) * (point.northing - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Distance between two points.
 */
function distancePoints(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p1.easting - p2.easting, 2) + Math.pow(p1.northing - p2.northing, 2));
}

/**
 * Minimum distance from point to a line segment.
 */
function distanceToSegment(p: Point, v: Point, w: Point): number {
  const l2 = distancePoints(v, w) ** 2;
  if (l2 === 0) return distancePoints(p, v);
  let t = ((p.easting - v.easting) * (w.easting - v.easting) + (p.northing - v.northing) * (w.northing - v.northing)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distancePoints(p, {
    easting: v.easting + t * (w.easting - v.easting),
    northing: v.northing + t * (w.northing - v.northing)
  });
}

/**
 * Computes minimum distance to the polygon boundary perimeter.
 */
export function distanceToPolygonBoundary(point: Point, polygon: Point[]): number {
  if (polygon.length < 2) return 0;
  let minDistance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distanceToSegment(point, polygon[j], polygon[i]);
    if (d < minDistance) {
      minDistance = d;
    }
  }
  return minDistance;
}

/**
 * Evaluates the current zone status.
 */
export function evaluateZoneStatus(
  point: Point,
  zone: GeofenceZone,
  hazards: HazardZone[] = []
): { status: GeofenceStatus; distanceToBoundary: number; nearestHazardDistance?: number } {
  
  let nearestHazardDist = Infinity;
  for (const hazard of hazards) {
    const dist = distancePoints(point, hazard.center);
    if (dist < nearestHazardDist) {
      nearestHazardDist = dist;
    }
    if (dist <= hazard.radius) {
      return { 
        status: 'HAZARD_PROXIMITY', 
        distanceToBoundary: distanceToPolygonBoundary(point, zone.boundary), 
        nearestHazardDistance: dist 
      };
    }
  }

  const isInside = pointInPolygon(point, zone.boundary);
  const distToBound = distanceToPolygonBoundary(point, zone.boundary);

  if (!isInside) {
    return { status: 'OUTSIDE_BREACH', distanceToBoundary: distToBound, nearestHazardDistance: nearestHazardDist };
  }

  if (distToBound <= zone.bufferDistance) {
    return { status: 'BOUNDARY_WARNING', distanceToBoundary: distToBound, nearestHazardDistance: nearestHazardDist };
  }

  return { status: 'INSIDE_SAFE', distanceToBoundary: distToBound, nearestHazardDistance: nearestHazardDist };
}

let audioContext: AudioContext | null = null;

export function playGeofenceAlert(type: 'warning' | 'breach'): void {
  if (typeof window === 'undefined') return;
  
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  const now = audioContext.currentTime;

  if (type === 'warning') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, now);
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
    
    oscillator.start(now);
    oscillator.stop(now + 0.5);
  } else if (type === 'breach') {
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1200, now);
    
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.setValueAtTime(0, now + 0.1);
    gainNode.gain.setValueAtTime(0.5, now + 0.2);
    gainNode.gain.setValueAtTime(0, now + 0.3);
    gainNode.gain.setValueAtTime(0.5, now + 0.4);
    gainNode.gain.setValueAtTime(0, now + 0.5);

    oscillator.start(now);
    oscillator.stop(now + 0.5);
  }
}
