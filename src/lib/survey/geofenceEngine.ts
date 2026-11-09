import { isSimplePolygonRing, strictPointInRing } from '@/lib/spatial/simplePolygon'

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
  | 'POSITION_UNCERTAIN'
  | 'UNKNOWN';

/**
 * Determines if a point is inside a polygon using ray-casting.
 * Based on Jordan curve theorem.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  return strictPointInRing(point, polygon);
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

export function parseGeofenceBoundary(text: string): Point[] {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 501) throw new Error('Use at most 500 boundary vertices.')
  const points = lines.map((line, index) => {
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*,\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(line)
    if (!match) throw new Error(`Line ${index + 1} needs one easting and one northing.`)
    return { easting: Number(match[1]), northing: Number(match[2]) }
  })
  const first = points[0]
  const last = points.at(-1)
  if (points.length > 1 && first.easting === last?.easting && first.northing === last.northing) points.pop()
  if (points.length > 500) throw new Error('Use at most 500 boundary vertices.')
  if (points.some(point => Math.abs(point.easting) > 1e8 || Math.abs(point.northing) > 1e8) || !isSimplePolygonRing(points)) {
    throw new Error('Use at least three distinct vertices in perimeter order. The boundary must have area and cannot cross itself.')
  }
  return points
}

interface ZoneResult {
  status: GeofenceStatus
  distanceToBoundary: number
  hazard?: string
}

/** Evaluate a point or a reported accuracy disk in the same metre grid as the perimeter. */
export function evaluateZoneStatus(
  point: Point,
  zone: GeofenceZone,
  hazards: HazardZone[] = [],
  accuracy = 0,
): ZoneResult {
  if (
    zone.boundary.length < 3 ||
    ![point.easting, point.northing, zone.bufferDistance, accuracy].every(Number.isFinite) ||
    zone.bufferDistance < 0 || accuracy < 0
  ) return { status: 'UNKNOWN', distanceToBoundary: 0 }

  const distanceToBoundary = distanceToPolygonBoundary(point, zone.boundary)
  const inside = pointInPolygon(point, zone.boundary)
  const hazard = hazards.find(zone => distancePoints(point, zone.center) + accuracy <= zone.radius)
  const possibleHazard = hazard ?? hazards.find(zone => distancePoints(point, zone.center) <= zone.radius + accuracy)
  const affectedHazard = possibleHazard?.type
  if (!inside && distanceToBoundary > accuracy) {
    return { status: 'OUTSIDE_BREACH', distanceToBoundary, hazard: affectedHazard }
  }
  if (hazard) return { status: 'HAZARD_PROXIMITY', distanceToBoundary, hazard: affectedHazard }
  if (possibleHazard || (accuracy > 0 && distanceToBoundary <= accuracy)) {
    return { status: 'POSITION_UNCERTAIN', distanceToBoundary, hazard: affectedHazard }
  }
  return {
    status: distanceToBoundary <= zone.bufferDistance + accuracy ? 'BOUNDARY_WARNING' : 'INSIDE_SAFE',
    distanceToBoundary,
  }
}

let audioContext: AudioContext | null = null;

export async function playGeofenceAlert(type: 'warning' | 'breach'): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    return await playTone(type)
  } catch {
    return false
  }
}

async function playTone(type: 'warning' | 'breach'): Promise<boolean> {
  
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return false;
    audioContext = new AudioContextConstructor();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (audioContext.state !== 'running') return false;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.onended = () => {
    oscillator.disconnect()
    gainNode.disconnect()
  }
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
  return true
}
