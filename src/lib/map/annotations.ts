/**
 * Map Annotation Layer — displays survey annotations on the parcel boundary.
 *
 * Renders:
 *  - Bearing labels (WCB format) on each boundary edge
 *  - Distance labels on each boundary edge (opposite side of bearing)
 *  - Area label at the polygon centroid
 *
 * All measurement math runs in the project CRS grid plane (metres).
 * All rendered features use EPSG:3857 (Web Mercator).
 */

import {
  formatBearingWCB,
  formatDistance,
  formatArea,
} from '@/lib/surveyMapEngine/core/format';
import {
  calculateCentroid,
  calculateOffsetPoint,
} from '@/lib/surveyMapEngine/core/measure';
import type { GridPoint as Point } from '@/lib/surveyMapEngine/core/types';
import {
  surveyArea,
  surveyBearing,
  surveyDistance,
} from '@/lib/spatial/projectCrs';

export interface AnnotationOptions {
  /** Closed polygon in EPSG:3857 (first point repeated at end) */
  coords3857: Array<[number, number]>;
  /** The original adjusted stations in the project CRS */
  stations21037: Array<{ pointName: string; easting: number; northing: number }>;
  /** Project UTM EPSG for the stations (e.g. 'EPSG:21037') — required; never defaulted (plan F4) */
  epsg: string;
}

/**
 * Perpendicular offset in ground units (meters) — enough to separate
 * bearing from distance labels at typical survey-map zoom levels.
 */
const OFFSET_METERS = 3;

/**
 * Grid bearing via the CRS authority. Undefined bearings remain errors.
 */
function edgeBearing(from: Point, to: Point, crs: string): number {
  return surveyBearing(from.easting, from.northing, to.easting, to.northing, crs);
}

/**
 * Convert a survey bearing (clockwise from north, 0–360°)
 * to a canvas text rotation (clockwise from east, radians).
 * Text is clamped so it is never rendered upside-down.
 */
export function bearingToOLRotation(bearingDeg: number): number {
  let rotDeg = ((bearingDeg % 360) + 360) % 360 - 90;
  if (rotDeg > 90) rotDeg -= 180;
  if (rotDeg < -90) rotDeg += 180;
  return (rotDeg * Math.PI) / 180;
}

export async function createAnnotationLayer(
  options: AnnotationOptions,
): Promise<import('ol/layer/Vector').default> {
  const { stations21037, epsg } = options;

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
  // A point-only view has no ordered polygon. The legacy centroid/area helpers
  // return zero for an empty set, which would otherwise create a false label.
  if (n < 3) return new VectorLayer({ source: new VectorSource({ features }), zIndex: 4 });

  // ─── Edge labels: bearings & distances ───────────────────────────────
  for (let i = 0; i < n; i++) {
    const from = stations21037[i];
    const to = stations21037[(i + 1) % n];

    const fromPt: Point = { easting: from.easting, northing: from.northing };
    const toPt: Point = { easting: to.easting, northing: to.northing };

    // Measurement math in the project CRS
    const bearing = edgeBearing(fromPt, toPt, epsg);
    const bearingStr = formatBearingWCB(bearing);
    const distance = surveyDistance(
      fromPt.easting,
      fromPt.northing,
      toPt.easting,
      toPt.northing,
      epsg,
    );
    const distanceStr = formatDistance(distance);

    // Text rotation (never upside-down)
    const rotation = bearingToOLRotation(bearing);
    const flipped = bearing > 180;

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
      epsg,
      'EPSG:3857',
    );
    const distanceCoord = transform(
      [distancePt.easting, distancePt.northing],
      epsg,
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
  const area = surveyArea(
    stations21037.map((s): [number, number] => [s.easting, s.northing]),
    epsg,
  );
  const areaStr = formatArea(area);

  const centroidCoord = transform(
    [centroid.easting, centroid.northing],
    epsg,
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
