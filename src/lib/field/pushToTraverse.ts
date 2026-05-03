import proj4 from 'proj4';
import { FieldBeacon, TraverseStationInput } from '@/types/field';

// Define Kenya UTM projections
proj4.defs('EPSG:32736', '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs'); // UTM 36S
proj4.defs('EPSG:32737', '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs'); // UTM 37S

export type TargetCRS = 'EPSG:32736' | 'EPSG:32737';

// Determine best UTM zone for Kenya from longitude
export function detectUTMZone(lng: number): TargetCRS {
  return lng < 36.0 ? 'EPSG:32736' : 'EPSG:32737';
}

export function beaconsToTraverseStations(
  beacons: FieldBeacon[],
  targetCRS?: TargetCRS
): TraverseStationInput[] {
  return beacons.map(b => {
    const crs = targetCRS ?? detectUTMZone(b.coordinate.lng);
    const [easting, northing] = proj4('EPSG:4326', crs, [b.coordinate.lng, b.coordinate.lat]);
    return {
      id: b.id,
      label: b.label,
      easting: parseFloat(easting.toFixed(3)),
      northing: parseFloat(northing.toFixed(3)),
      elevation: b.coordinate.altitude ?? undefined,
      coordinateSystem: crs === 'EPSG:32736' ? 'UTM_36S' : 'UTM_37S',
    };
  });
}

// Encode stations into URL search params for /tools/traverse-field-book
export function buildTraverseURL(stations: TraverseStationInput[]): string {
  const payload = encodeURIComponent(JSON.stringify(stations));
  return `/tools/traverse-field-book?field_import=${payload}`;
}
