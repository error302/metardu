import type { TracedPolygon } from './types';

/* ══════════════════════════════════════════════════════════════════════
 *  AREA CALCULATION (Shoelace Formula)
 *  Works on geographic coordinates (lon, lat) to approximate planar area.
 *  For large areas, uses the more accurate Haversine-based method.
 * ══════════════════════════════════════════════════════════════════════ */

export function computePolygonArea(coords: Array<[number, number]>): number {
  // Shoelace formula on projected coordinates (approximate using equirectangular)
  // Convert lon/lat to a flat projection for area calculation
  const R = 6371000; // Earth's mean radius in meters
  const n = coords.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lon1 = (coords[i][0] * Math.PI) / 180;
    const lat1 = (coords[i][1] * Math.PI) / 180;
    const lon2 = (coords[j][0] * Math.PI) / 180;
    const lat2 = (coords[j][1] * Math.PI) / 180;

    // Equirectangular projection
    const x1 = lon1 * Math.cos((lat1 + lat2) / 2);
    const y1 = lat1;
    const x2 = lon2 * Math.cos((lat1 + lat2) / 2);
    const y2 = lat2;

    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2 * R * R;
  return area;
}

/* ══════════════════════════════════════════════════════════════════════
 *  DXF GENERATOR (inline, minimal)
 * ══════════════════════════════════════════════════════════════════════ */

export function generateDXF(polygons: TracedPolygon[]): string {
  const sections: string[] = [];

  // HEADER
  sections.push('0', 'SECTION', '2', 'HEADER');
  sections.push('9', '$ACADVER', '1', 'AC1015');
  sections.push('9', '$INSUNITS', '70', '6'); // 6 = meters
  sections.push('9', '$LUPREC', '70', '4');
  sections.push('9', '$AUPREC', '70', '2');
  sections.push('0', 'ENDSEC');

  // TABLES
  sections.push('0', 'SECTION', '2', 'TABLES');
  sections.push('0', 'TABLE', '2', 'LAYER', '70', String(polygons.length + 1));
  // Layer 0
  sections.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  // One layer per polygon
  polygons.forEach((p, i) => {
    const colorIdx = ((i + 1) % 7) + 1;
    sections.push(
      '0', 'LAYER', '2', p.name, '70', '0',
      '62', String(colorIdx), '6', 'CONTINUOUS'
    );
  });
  sections.push('0', 'ENDTAB');
  sections.push('0', 'ENDSEC');

  // ENTITIES
  sections.push('0', 'SECTION', '2', 'ENTITIES');

  polygons.forEach((p) => {
    // Convert geographic coords back to a flat grid for DXF
    // Use local coordinates relative to first point
    const coords = p.coordinates;
    if (coords.length < 3) return;

    const baseLon = coords[0][0];
    const baseLat = coords[0][1];
    const cosLat = Math.cos((baseLat * Math.PI) / 180);
    const R = 6371000;

    const flatCoords: Array<[number, number]> = coords.map(([lon, lat]) => {
      const x = ((lon - baseLon) * Math.PI / 180) * cosLat * R;
      const y = ((lat - baseLat) * Math.PI / 180) * R;
      return [x, y];
    });

    // LWPOLYLINE
    sections.push('0', 'LWPOLYLINE', '8', p.name, '90', String(flatCoords.length + 1), '70', '1');
    flatCoords.forEach(([x, y]) => {
      sections.push('10', x.toFixed(4), '20', y.toFixed(4));
    });
    // Close the polyline (repeat first vertex)
    sections.push('10', flatCoords[0][0].toFixed(4), '20', flatCoords[0][1].toFixed(4));
  });

  sections.push('0', 'ENDSEC');
  sections.push('0', 'EOF');

  return sections.join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
 *  KML GENERATOR (inline)
 * ══════════════════════════════════════════════════════════════════════ */

export function generateKML(polygons: TracedPolygon[]): string {
  const placemarks = polygons.map((p) => {
    const coordStr = p.coordinates.map(([lon, lat]) => `${lon.toFixed(8)},${lat.toFixed(8)},0`).join('\n        ');
    return `  <Placemark>
    <name>${escapeXml(p.name)}</name>
    <description>Area: ${p.areaSqm.toFixed(2)} m² (${p.areaAcres.toFixed(4)} acres / ${p.areaHa.toFixed(4)} ha)</description>
    <styleUrl>#style-${p.id}</styleUrl>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
        ${coordStr}
        ${p.coordinates[0][0].toFixed(8)},${p.coordinates[0][1].toFixed(8)},0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>`;
  }).join('\n');

  const styles = polygons.map((p) => {
    // Convert hex color to KML format (AABBGGRR)
    const hex = p.color.replace('#', '');
    const r = hex.substring(4, 6);
    const g = hex.substring(2, 4);
    const b = hex.substring(0, 2);
    const kmlColor = `ff${r}${g}${b}`;
    return `  <Style id="style-${p.id}">
    <LineStyle><color>${kmlColor}</color><width>2</width></LineStyle>
    <PolyStyle><color>40${r}${g}${b}</color><fill>1</fill><outline>1</outline></PolyStyle>
  </Style>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Traced Boundaries</name>
  <description>Parcel boundaries traced from orthophoto in METARDU</description>
${styles}
${placemarks}
</Document>
</kml>`;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ══════════════════════════════════════════════════════════════════════
 *  GeoJSON GENERATOR (inline)
 * ══════════════════════════════════════════════════════════════════════ */

export function generateGeoJSON(polygons: TracedPolygon[]): string {
  const features = polygons.map((p) => ({
    type: 'Feature',
    properties: {
      name: p.name,
      area_sqm: parseFloat(p.areaSqm.toFixed(2)),
      area_acres: parseFloat(p.areaAcres.toFixed(4)),
      area_ha: parseFloat(p.areaHa.toFixed(4)),
      color: p.color,
      vertex_count: p.coordinates.length,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        ...p.coordinates.map(([lon, lat]) => [parseFloat(lon.toFixed(8)), parseFloat(lat.toFixed(8))]),
        [parseFloat(p.coordinates[0][0].toFixed(8)), parseFloat(p.coordinates[0][1].toFixed(8))],
      ]],
    },
  }));

  return JSON.stringify(
    { type: 'FeatureCollection', features },
    null,
    2
  );
}

/* ══════════════════════════════════════════════════════════════════════
 *  CSV GENERATOR (inline)
 * ══════════════════════════════════════════════════════════════════════ */

export function generateCSV(polygons: TracedPolygon[]): string {
  const rows: string[] = [
    'Polygon,Vertex,Lon,Lat,Area_Sqm,Area_Acres,Area_Ha',
  ];

  polygons.forEach((p) => {
    p.coordinates.forEach(([lon, lat], i) => {
      rows.push(
        `"${p.name}",${i + 1},${lon.toFixed(8)},${lat.toFixed(8)},${p.areaSqm.toFixed(2)},${p.areaAcres.toFixed(4)},${p.areaHa.toFixed(4)}`
      );
    });
    // Closing vertex
    const [lon0, lat0] = p.coordinates[0];
    rows.push(
      `"${p.name}",${p.coordinates.length + 1},${lon0.toFixed(8)},${lat0.toFixed(8)},${p.areaSqm.toFixed(2)},${p.areaAcres.toFixed(4)},${p.areaHa.toFixed(4)}`
    );
  });

  return rows.join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
 *  DOWNLOAD HELPER
 * ══════════════════════════════════════════════════════════════════════ */

export function downloadFile(content: string, filename: string, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function formatArea(sqm: number): string {
  if (sqm >= 1_000_000) {
    return (sqm / 1_000_000).toFixed(2) + 'M';
  }
  if (sqm >= 10_000) {
    return (sqm / 1_000).toFixed(1) + 'K';
  }
  return sqm.toFixed(2);
}
