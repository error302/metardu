import { FieldProject, FieldExportOptions } from '@/types/field';
// @ts-ignore — togpx has no types
import togpx from 'togpx';

export function projectToGeoJSON(project: FieldProject): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  project.beacons.forEach(b => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.coordinate.lng, b.coordinate.lat] },
      properties: {
        label: b.label,
        beaconType: b.beaconType,
        notes: b.notes ?? '',
        capturedAt: new Date(b.capturedAt).toISOString(),
      },
    });
  });

  project.parcels.forEach(p => {
    if (p.walkPoints.length < 3) return;
    const coords = p.walkPoints.map(wp => [wp.coordinate.lng, wp.coordinate.lat]);
    coords.push(coords[0]); // close ring
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {
        label: p.label,
        areaM2: p.computedAreaM2,
        areaHa: p.computedAreaM2 ? (p.computedAreaM2 / 10000).toFixed(4) : null,
        perimeterM: p.computedPerimeterM,
      },
    });
  });

  return { type: 'FeatureCollection', features };
}

export function exportToKML(project: FieldProject): string {
  const geojson = projectToGeoJSON(project);
  return togpx(geojson); // togpx outputs KML-compatible XML
}

export function exportToCSV(project: FieldProject): string {
  const rows: string[] = ['Label,Latitude,Longitude,Altitude,Accuracy,Type,Notes,CapturedAt'];
  project.beacons.forEach(b => {
    rows.push([
      b.label,
      b.coordinate.lat.toFixed(8),
      b.coordinate.lng.toFixed(8),
      b.coordinate.altitude?.toFixed(3) ?? '',
      b.coordinate.accuracy?.toFixed(2) ?? '',
      b.beaconType,
      `"${(b.notes ?? '').replace(/"/g, '""')}"`,
      new Date(b.capturedAt).toISOString(),
    ].join(','));
  });
  return rows.join('\n');
}

export function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
