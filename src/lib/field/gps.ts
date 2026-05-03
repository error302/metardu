import { Geolocation, Position } from '@capacitor/geolocation';
import { FieldCoordinate } from '@/types/field';

export async function requestGPSPermission(): Promise<boolean> {
  const { location } = await Geolocation.requestPermissions();
  return location === 'granted';
}

export async function getCurrentPosition(): Promise<FieldCoordinate> {
  const pos: Position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    altitude: pos.coords.altitude ?? undefined,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  };
}

export function watchPosition(
  onUpdate: (coord: FieldCoordinate) => void,
  onError: (err: unknown) => void
): Promise<string> {
  return Geolocation.watchPosition(
    { enableHighAccuracy: true },
    (pos, err) => {
      if (err || !pos) { onError(err); return; }
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        altitude: pos.coords.altitude ?? undefined,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    }
  );
}

export function clearWatch(watchId: string): Promise<void> {
  return Geolocation.clearWatch({ id: watchId });
}

// Haversine distance in metres between two coordinates
export function haversineDistance(a: FieldCoordinate, b: FieldCoordinate): number {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Compute polygon area in m² using the Shoelace formula on WGS84 lat/lng
export function computeAreaM2(coords: FieldCoordinate[]): number {
  if (coords.length < 3) return 0;
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const xi = (coords[i].lng * Math.PI) / 180 * R * Math.cos((coords[i].lat * Math.PI) / 180);
    const yi = (coords[i].lat * Math.PI) / 180 * R;
    const xj = (coords[j].lng * Math.PI) / 180 * R * Math.cos((coords[j].lat * Math.PI) / 180);
    const yj = (coords[j].lat * Math.PI) / 180 * R;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

export function computePerimeterM(coords: FieldCoordinate[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i], coords[i + 1]);
  }
  // Close polygon
  if (coords.length > 1) total += haversineDistance(coords[coords.length - 1], coords[0]);
  return total;
}
