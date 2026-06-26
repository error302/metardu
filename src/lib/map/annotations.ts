/**
 * Map Annotation Layer — displays survey annotations on the parcel boundary.
 *
 * Renders:
 *  - Bearing labels (WCB format) on each boundary edge
 *  - Distance labels on each boundary edge (opposite side of bearing)
 *  - Area label at the polygon centroid
 *
 * All measurement math runs in EPSG:21037 (Kenya grid, meters).
 * All rendered features use EPSG:3857 (Web Mercator).
 */

import {
  calculateBearing,
  formatBearingWCB,
  calculateDistance,
  formatDistance,
  calculateArea,
  formatArea,
  calculateCentroid,
  calculateOffsetPoint,
  type Point,
} from '@/lib/map/measurements';

export interface AnnotationOptions {
  /** Closed polygon in EPSG:3857 (first point repeated at end) */
  coords3857: Array<[number, number]>;
  /** The original adjusted stations in EPSG:21037 */
  stations21037: Array<{ pointName: string; easting: number; northing: number }>;
}

/**
 * Perpendicular offset in ground units (meters) — enough to separate
 * bearing from distance labels at typical survey-map zoom levels.
 */
const OFFSET_METERS = 3;

/**
 * Convert a survey bearing (clockwise from north, 0–360°)
 * to an OpenLayers text rotation (counter-clockwise from east, radians).
 * Text is clamped so it is never rendered upside-down.
 */
function bearingToOLRotation(bearingDeg: number): number {
  // Convert CW-from-north to CCW-from-east
  let rotDeg = 90 - bearingDeg;

  // If the text would be upside-down, flip it
  if (bearingDeg > 90 && bearingDeg < 270) {
    rotDeg += 180;
  }

  // Normalize to [-180, 180]
  while (rotDeg > 180) rotDeg -= 360;
  while (rotDeg < -180) rotDeg += 360;

  return (rotDeg * Math.PI) / 180;
}

export async function createAnnotationLayer(
  options: AnnotationOptions,
): Promise<import('ol/layer/Vector').default> {
  const { stations21037 } = options;

  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: PointGeom },
    { default: Style },
    { default: Fill },
    { default: Stroke },
    { default: Text },
    { transform },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/Fill'),
    import('ol/style/Stroke'),
    import('ol/style/Text'),
    import('ol/proj'),
  ]);

  const features: InstanceType<typeof Feature>[] = [];
  const n = stations21037.length;

  // ─── Edge labels: bearings & distances ───────────────────────────────
  for (let i = 0; i < n; i++) {
    const from = stations21037[i];
    const to = stations21037[(i + 1) % n];

    const fromPt: Point = { easting: from.easting, northing: from.northing };
    const toPt: Point = { easting: to.easting, northing: to.northing };

    // Measurement math in EPSG:21037
    const bearing = calculateBearing(fromPt, toPt);
    const bearingStr = formatBearingWCB(bearing);
    const distance = calculateDistance(fromPt, toPt);
    const distanceStr = formatDistance(distance);

    // Text rotation (never upside-down)
    const rotation = bearingToOLRotation(bearing);
    const flipped = bearing > 90 && bearing < 270;

    // Bearing label on the left side of travel direction,
    // distance label on the right.  When the text is flipped we swap
    // the offsets so the visual relationship stays consistent.
    const bearingPt = calculateOffsetPoint(
      fromPt,
      toPt,
      flipped ? -OFFSET_METERS : OFFSET_METERS,
    );
    const distancePt = calculateOffsetPoint(
      fromPt,
      toPt,
      flipped ? OFFSET_METERS : -OFFSET_METERS,
    );

    // Convert to EPSG:3857 for rendering
    const bearingCoord = transform(
      [bearingPt.easting, bearingPt.northing],
      'EPSG:21037',
      'EPSG:3857',
    );
    const distanceCoord = transform(
      [distancePt.easting, distancePt.northing],
      'EPSG:21037',
      'EPSG:3857',
    );

    // Shared edge-label style helpers
    const edgeLabelStyle = (text: string) =>
      new Style({
        text: new Text({
          text,
          rotation,
          font: '11px Calibri, sans-serif',
          fill: new Fill({ color: '#1B3A5C' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
          textAlign: 'center',
          textBaseline: 'middle',
        }),
      });

    const bearingFeature = new Feature({
      geometry: new PointGeom(bearingCoord),
    });
    bearingFeature.setStyle(edgeLabelStyle(bearingStr));
    features.push(bearingFeature);

    const distanceFeature = new Feature({
      geometry: new PointGeom(distanceCoord),
    });
    distanceFeature.setStyle(edgeLabelStyle(distanceStr));
    features.push(distanceFeature);
  }

  // ─── Area label at centroid ─────────────────────────────────────────
  const centroid = calculateCentroid(stations21037);
  const area = calculateArea(stations21037);
  const areaStr = formatArea(area);

  const centroidCoord = transform(
    [centroid.easting, centroid.northing],
    'EPSG:21037',
    'EPSG:3857',
  );

  const areaFeature = new Feature({ geometry: new PointGeom(centroidCoord) });
  areaFeature.setStyle(
    new Style({
      text: new Text({
        text: areaStr,
        font: 'bold 13px Calibri, sans-serif',
        fill: new Fill({ color: '#1B3A5C' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3.5 }),
        textAlign: 'center',
        textBaseline: 'middle',
      }),
    }),
  );
  features.push(areaFeature);

  const source = new VectorSource({ features });
  return new VectorLayer({ source, zIndex: 4 });
}
