/**
 * Cadastral Styles Module — Survey of Kenya (SoK) compliant symbology
 *
 * Provides status-aware parcel boundary styles, beacon marker styles per
 * SoK classification, edge annotation styles for bearing/distance labels,
 * and traverse leg styles with direction arrows.
 *
 * All OpenLayers imports are dynamic (`import()`) for SSR safety.
 * Factory functions are async and return OL style functions suitable
 * for direct use with `ol/layer/Vector.style`.
 *
 * @module cadastralStyles
 * @see annotations.ts — bearing/distance rendering pattern
 * @see layers.ts — existing parcel/beacon layer conventions
 */

// ─── Exported Type Definitions ──────────────────────────────────────────

/**
 * Parcel approval status.
 *
 * Controls the visual appearance of parcel polygon boundaries:
 * - `approved` — green solid boundary, light green fill
 * - `pending`  — red dashed boundary, light red fill
 * - `rejected` — red solid boundary, no fill
 * - `default`  — dark blue solid boundary, light blue fill (existing style)
 */
export type ParcelStatus = 'approved' | 'pending' | 'rejected' | 'default';

/**
 * Beacon classification per SoK standards.
 *
 * - `boundary`  — Standard cadastral beacon (gold circle)
 * - `trig`      — Trigonometrical station (green triangle)
 * - `control`   — Control station (blue square, rotated 45°)
 * - `benchmark` — Benchmark / level point (purple diamond)
 */
export type BeaconType = 'boundary' | 'trig' | 'control' | 'benchmark';

/**
 * Options for the parcel style function factory.
 */
export interface ParcelStyleOptions {
  /** Boundary stroke width in pixels (default: `2.5`) */
  strokeWidth?: number;
  /** Whether to render the parcel number label at the polygon interior point (default: `false`) */
  showLabel?: boolean;
  /** Font family used for labels (default: `'Calibri, sans-serif'`) */
  labelFont?: string;
  /** Override the default zIndex for the polygon style (default: `2`) */
  zIndex?: number;
}

/**
 * Options for the beacon style function factory.
 */
export interface BeaconStyleOptions {
  /** Marker radius in pixels (default: `7`) */
  radius?: number;
  /** Whether to append the beacon description on a second text line (default: `false`) */
  showDescription?: boolean;
  /** Font family used for beacon labels (default: `'Calibri, sans-serif'`) */
  labelFont?: string;
  /** Label X-offset in pixels (default: `10`) */
  labelOffsetX?: number;
  /** Label Y-offset in pixels (default: `-10`) */
  labelOffsetY?: number;
}

/**
 * Options for the edge annotation style function factory.
 * Used for bearing / distance labels along cadastral edges.
 */
export interface EdgeAnnotationStyleOptions {
  /** Font size in pixels (default: `11`) */
  fontSize?: number;
  /** Font family (default: `'Calibri, sans-serif'`) */
  fontFamily?: string;
  /** Text colour (default: `'#1B3A5C'` — Metardu dark blue) */
  textColor?: string;
  /** Halo / stroke colour behind text for readability (default: `'#FFFFFF'`) */
  haloColor?: string;
  /** Halo stroke width in pixels (default: `3`) */
  haloWidth?: number;
  /** Whether the text should be rendered in bold (default: `false`) */
  bold?: boolean;
}

/**
 * Options for the traverse leg style function factory.
 * Used for observed traverse lines between survey stations.
 */
export interface TraverseLegStyleOptions {
  /** Line stroke colour (default: `'#0066CC'`) */
  color?: string;
  /** Line stroke width in pixels (default: `2`) */
  width?: number;
  /** Dash pattern as `[dashLength, gapLength]` (default: `[8, 4]`) */
  dashPattern?: [number, number];
  /** Arrow marker colour (defaults to `color`) */
  arrowColor?: string;
  /** Arrow marker size in pixels (default: `14`) */
  arrowSize?: number;
}

// ─── SoK Colour Constants ───────────────────────────────────────────────

/**
 * Parcel boundary & fill colours per approval status.
 *
 * Each entry provides `stroke`, `fill` (RGBA), and `label` colours that
 * conform to Survey of Kenya cartographic standards.
 */
export const PARCEL_STATUS_COLORS: Record<
  ParcelStatus,
  { stroke: string; fill: string; label: string }
> = {
  approved: {
    stroke: '#006600',
    fill: 'rgba(0, 102, 0, 0.08)',
    label: '#006600',
  },
  pending: {
    stroke: '#CC0000',
    fill: 'rgba(204, 0, 0, 0.08)',
    label: '#CC0000',
  },
  rejected: {
    stroke: '#FF0000',
    fill: 'rgba(255, 0, 0, 0)',
    label: '#FF0000',
  },
  default: {
    stroke: '#1B3A5C',
    fill: 'rgba(27, 58, 92, 0.08)',
    label: '#1B3A5C',
  },
};

/**
 * Beacon marker colours per SoK beacon classification.
 *
 * Each entry provides `fill` (semi-transparent interior) and `stroke`
 * (solid outline) colours, plus a `label` colour for the text halo.
 */
export const BEACON_TYPE_COLORS: Record<
  BeaconType,
  { fill: string; stroke: string; label: string }
> = {
  boundary: {
    fill: '#FFD700',
    stroke: '#1B3A5C',
    label: '#1B3A5C',
  },
  trig: {
    fill: 'rgba(0, 128, 0, 0.20)',
    stroke: '#006600',
    label: '#006600',
  },
  control: {
    fill: 'rgba(0, 102, 204, 0.20)',
    stroke: '#0066CC',
    label: '#0066CC',
  },
  benchmark: {
    fill: 'rgba(107, 63, 160, 0.20)',
    stroke: '#6B3FA0',
    label: '#6B3FA0',
  },
};

// ─── Utility Functions ──────────────────────────────────────────────────

/**
 * Convert a survey bearing (clockwise from north, 0–360°)
 * to an OpenLayers text rotation (counter-clockwise from east, in radians).
 *
 * The result is clamped so that text is **never rendered upside-down**:
 * when the bearing falls between 90° and 270° (i.e. the text would be
 * inverted), the rotation is flipped by an additional 180°.
 *
 * @param bearingDeg - Whole-circle bearing in degrees (CW from north)
 * @returns Rotation angle in radians for `ol/style/Text.rotation`
 *
 * @example
 * ```ts
 * // North (0°) → text reads left-to-right along horizontal
 * bearingToOLRotation(0);    // ≈ 1.5708  (π/2)
 * // East (90°) → text reads top-to-bottom but flipped upright
 * bearingToOLRotation(90);   // ≈ 1.5708
 * // South (180°) → flipped so it reads left-to-right
 * bearingToOLRotation(180);  // ≈ -1.5708 (-π/2)
 * ```
 */
export function bearingToOLRotation(bearingDeg: number): number {
  // Convert CW-from-north → CCW-from-east
  let rotDeg = 90 - bearingDeg;

  // Flip when bearing would render text upside-down
  if (bearingDeg > 90 && bearingDeg < 270) {
    rotDeg += 180;
  }

  // Normalise to [-180, 180]
  while (rotDeg > 180) rotDeg -= 360;
  while (rotDeg < -180) rotDeg += 360;

  return (rotDeg * Math.PI) / 180;
}

/**
 * Compute an approximate bearing (CW from north, 0–360°) from two
 * coordinate pairs.  Suitable for visual arrow placement when an
 * accurate survey bearing is not available as a feature property.
 *
 * **Note:** Coordinates are assumed to be in the same CRS.  For
 * geometrically accurate bearings on Web Mercator features, always
 * prefer a `bearing` feature property computed in EPSG:21037.
 *
 * @param from - Start coordinate `[x, y]`
 * @param to   - End coordinate `[x, y]`
 * @returns Bearing in degrees (0–360)
 */
export function computeBearingDeg(
  from: [number, number],
  to: [number, number],
): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Compute the midpoint of two coordinates.
 */
function midpoint(
  a: [number, number],
  b: [number, number],
): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// ─── Parcel Style Function Factory ──────────────────────────────────────

/**
 * Create an OL style function for status-aware parcel polygons.
 *
 * Features should expose the following properties:
 * - **`status`** (`ParcelStatus`) — determines stroke/fill colour;
 *   falls back to `'default'` if absent or unrecognised.
 * - **`parcelNumber`** (`string`) — displayed at the polygon interior
 *   point when `showLabel` is `true`.
 *
 * The function returns either a single `ol/Style` (when no label) or an
 * array of two styles (polygon + label).
 *
 * @param options - Configuration for stroke width, label visibility, etc.
 * @returns A Promise resolving to an OL style function compatible with
 *          `ol/layer/Vector.style`.
 *
 * @example
 * ```ts
 * const parcelStyle = await createParcelStyleFunction({ showLabel: true });
 * vectorLayer.setStyle(parcelStyle);
 * ```
 */
export async function createParcelStyleFunction(
  options: ParcelStyleOptions = {},
): Promise<
  (
    feature: import('ol/Feature').default,
  ) =>
    | import('ol/style/Style').default
    | Array<import('ol/style/Style').default>
> {
  const {
    strokeWidth = 2.5,
    showLabel = false,
    labelFont = 'Calibri, sans-serif',
    zIndex = 2,
  } = options;

  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: Text },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
  ]);

  return function parcelStyleFunction(feature) {
    const status: ParcelStatus =
      (feature.get('status') as ParcelStatus) || 'default';
    const colors = PARCEL_STATUS_COLORS[status] || PARCEL_STATUS_COLORS.default;
    const parcelNumber = feature.get('parcelNumber') as string | undefined;

    const isPending = status === 'pending';

    const styles: Array<InstanceType<typeof Style>> = [];

    // ── Polygon boundary + fill ───────────────────────────────────────
    styles.push(
      new Style({
        stroke: new Stroke({
          color: colors.stroke,
          width: strokeWidth,
          lineDash: isPending ? [10, 5] : undefined,
        }),
        fill: new Fill({
          color: colors.fill,
        }),
        zIndex,
      }),
    );

    // ── Optional parcel number label at interior point ───────────────
    if (showLabel && parcelNumber) {
      const geom = feature.getGeometry();
      // Polygon.getInteriorPoint() returns a Point at the centroid
      const geomAny = geom as unknown as Record<string, unknown>;
      const interiorPoint =
        geom != null &&
        typeof geomAny.getInteriorPoint === 'function'
          ? (geomAny as { getInteriorPoint(): unknown }).getInteriorPoint()
          : undefined;

      if (interiorPoint != null) {
        styles.push(
          new Style({
            geometry: interiorPoint as import('ol/geom/Point').default,
            text: new Text({
              text: parcelNumber,
              font: `bold 12px ${labelFont}`,
              fill: new Fill({ color: colors.label }),
              stroke: new Stroke({ color: '#FFFFFF', width: 3.5 }),
              textAlign: 'center',
              textBaseline: 'middle',
            }),
          }),
        );
      }
    }

    return styles.length === 1 ? styles[0] : styles;
  };
}

// ─── Beacon Style Function Factory ──────────────────────────────────────

/**
 * Create an OL style function for SoK-classified beacon markers.
 *
 * Features should expose the following properties:
 * - **`beacon_type`** (`BeaconType`) — marker shape & colour;
 *   falls back to `'boundary'` if absent.
 * - **`label`** (`string`) — beacon ID displayed as a white-halo text label.
 * - **`description`** (`string`, optional) — appended on a second line
 *   when `showDescription` is `true`.
 *
 * Marker shapes follow SoK cartographic standards:
 * | Type       | Shape        | Colour           |
 * |------------|-------------|------------------|
 * | boundary   | Circle      | Gold `#FFD700`   |
 * | trig       | ▲ Triangle  | Green            |
 * | control    | ◆ Square 45°| Blue `#0066CC`   |
 * | benchmark  | ◇ Diamond   | Purple `#6B3FA0` |
 *
 * @param options - Configuration for radius, label offsets, etc.
 * @returns A Promise resolving to an OL style function.
 *
 * @example
 * ```ts
 * const beaconStyle = await createBeaconStyleFunction({ showDescription: true });
 * beaconLayer.setStyle(beaconStyle);
 * ```
 */
export async function createBeaconStyleFunction(
  options: BeaconStyleOptions = {},
): Promise<
  (
    feature: import('ol/Feature').default,
  ) =>
    | import('ol/style/Style').default
    | Array<import('ol/style/Style').default>
> {
  const {
    radius = 7,
    showDescription = false,
    labelFont = 'Calibri, sans-serif',
    labelOffsetX = 10,
    labelOffsetY = -10,
  } = options;

  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: Text },
    { default: CircleStyle },
    { default: RegularShape },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
    import('ol/style/Circle'),
    import('ol/style/RegularShape'),
  ]);

  return function beaconStyleFunction(feature) {
    const beaconType: BeaconType =
      (feature.get('beacon_type') as BeaconType) || 'boundary';
    const label = feature.get('label') as string | undefined;
    const description = feature.get('description') as string | undefined;
    const colors =
      BEACON_TYPE_COLORS[beaconType] || BEACON_TYPE_COLORS.boundary;

    // ── Build the marker image based on beacon type ──────────────────
    let image:
      | InstanceType<typeof CircleStyle>
      | InstanceType<typeof RegularShape>;

    switch (beaconType) {
      case 'trig':
        // Upward-pointing triangle — trigonometrical station
        image = new RegularShape({
          points: 3,
          radius,
          radius2: 0,
          angle: 0,
          stroke: new Stroke({ color: colors.stroke, width: 2 }),
          fill: new Fill({ color: colors.fill }),
        });
        break;

      case 'control':
        // Square rotated 45° — control station
        image = new RegularShape({
          points: 4,
          radius,
          angle: Math.PI / 4,
          stroke: new Stroke({ color: colors.stroke, width: 2 }),
          fill: new Fill({ color: colors.fill }),
        });
        break;

      case 'benchmark':
        // Diamond (square at 0°) — benchmark / level point
        image = new RegularShape({
          points: 4,
          radius,
          angle: 0,
          stroke: new Stroke({ color: colors.stroke, width: 2 }),
          fill: new Fill({ color: colors.fill }),
        });
        break;

      default:
        // Filled circle — standard cadastral boundary beacon
        image = new CircleStyle({
          radius,
          stroke: new Stroke({ color: colors.stroke, width: 2 }),
          fill: new Fill({ color: colors.fill }),
        });
        break;
    }

    const styles: Array<InstanceType<typeof Style>> = [];

    // ── Beacon marker ────────────────────────────────────────────────
    styles.push(new Style({ image }));

    // ── White-halo text label ────────────────────────────────────────
    if (label) {
      const labelText =
        showDescription && description ? `${label}\n${description}` : label;

      styles.push(
        new Style({
          text: new Text({
            text: labelText,
            offsetX: labelOffsetX,
            offsetY: labelOffsetY,
            font: `bold 11px ${labelFont}`,
            fill: new Fill({ color: colors.label }),
            stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
          }),
        }),
      );
    }

    return styles.length === 1 ? styles[0] : styles;
  };
}

// ─── Edge Annotation Style Function Factory ─────────────────────────────

/**
 * Create an OL style function for bearing / distance labels on cadastral
 * edges.  Text is rendered with a white halo for readability over any
 * background and is rotation-aware (never displayed upside-down).
 *
 * Features should expose the following properties:
 * - **`text`** (`string`) — the annotation text to display (e.g. bearing
 *   in WCB format, or distance).
 * - **`bearing`** (`number`) — whole-circle bearing in degrees (CW from
 *   north).  Used to rotate the text along the edge direction.
 *
 * @param options - Font, colour, and halo configuration.
 * @returns A Promise resolving to an OL style function.
 *
 * @example
 * ```ts
 * const edgeStyle = await createEdgeAnnotationStyleFunction();
 * annotationLayer.setStyle(edgeStyle);
 * ```
 */
export async function createEdgeAnnotationStyleFunction(
  options: EdgeAnnotationStyleOptions = {},
): Promise<
  (
    feature: import('ol/Feature').default,
  ) => import('ol/style/Style').default
> {
  const {
    fontSize = 11,
    fontFamily = 'Calibri, sans-serif',
    textColor = '#1B3A5C',
    haloColor = '#FFFFFF',
    haloWidth = 3,
    bold = false,
  } = options;

  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: Text },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
  ]);

  return function edgeAnnotationStyleFunction(feature) {
    const text = (feature.get('text') as string) || '';
    const bearingDeg = (feature.get('bearing') as number) || 0;
    const rotation = bearingToOLRotation(bearingDeg);

    return new Style({
      text: new Text({
        text,
        rotation,
        font: `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`,
        fill: new Fill({ color: textColor }),
        stroke: new Stroke({ color: haloColor, width: haloWidth }),
        textAlign: 'center',
        textBaseline: 'middle',
      }),
    });
  };
}

// ─── Traverse Leg Style Function Factory ────────────────────────────────

/**
 * Create an OL style function for traverse observation lines with a
 * direction arrow at the midpoint.
 *
 * Each feature's geometry should be a `LineString`.  The function renders:
 * 1. A dashed line in the specified colour.
 * 2. A directional arrow () at the midpoint, rotated to match the
 *    traverse bearing.
 *
 * Features **may** expose a `bearing` property (degrees, CW from north)
 * for accurate arrow rotation.  When absent, the bearing is approximated
 * from the line geometry coordinates (acceptable for visual purposes but
 * less precise in Web Mercator).
 *
 * @param options - Line colour, width, dash pattern, and arrow config.
 * @returns A Promise resolving to an OL style function returning an array
 *          of `[lineStyle, arrowStyle]`.
 *
 * @example
 * ```ts
 * const traverseStyle = await createTraverseLegStyleFunction();
 * traverseLayer.setStyle(traverseStyle);
 * ```
 */
export async function createTraverseLegStyleFunction(
  options: TraverseLegStyleOptions = {},
): Promise<
  (
    feature: import('ol/Feature').default,
  ) => Array<import('ol/style/Style').default>
> {
  const {
    color = '#0066CC',
    width = 2,
    dashPattern = [8, 4],
    arrowColor,
    arrowSize = 14,
  } = options;

  const effectiveArrowColor = arrowColor || color;

  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: Text },
    { default: Point },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
    import('ol/geom/Point'),
  ]);

  return function traverseLegStyleFunction(feature) {
    // ── Determine bearing for arrow rotation ─────────────────────────
    let bearingDeg = feature.get('bearing') as number | undefined;

    if (bearingDeg == null || isNaN(bearingDeg)) {
      // Fallback: compute from geometry (approximate in Web Mercator)
      const lineGeom = feature.getGeometry();
      const lineGeomAny = lineGeom as unknown as Record<string, unknown>;
      if (
        lineGeom != null &&
        typeof lineGeomAny.getCoordinates === 'function'
      ) {
        const coords = (
          lineGeomAny as { getCoordinates(): Array<[number, number]> }
        ).getCoordinates();
        if (coords.length >= 2) {
          bearingDeg = computeBearingDeg(coords[0], coords[coords.length - 1]);
        }
      }
    }

    if (bearingDeg == null || isNaN(bearingDeg)) {
      bearingDeg = 0;
    }

    const rotation = bearingToOLRotation(bearingDeg);

    // ── Midpoint for arrow placement ─────────────────────────────────
    const midGeom = feature.getGeometry();
    const midGeomAny = midGeom as unknown as Record<string, unknown>;
    let arrowGeometry: InstanceType<typeof Point> | undefined;

    if (
      midGeom != null &&
      typeof midGeomAny.getCoordinates === 'function'
    ) {
      const coords = (
        midGeomAny as { getCoordinates(): Array<[number, number]> }
      ).getCoordinates();
      if (coords.length >= 2) {
        const mid = midpoint(coords[0], coords[coords.length - 1]);
        arrowGeometry = new Point(mid);
      }
    }

    const styles: Array<InstanceType<typeof Style>> = [];

    // ── Dashed traverse line ─────────────────────────────────────────
    styles.push(
      new Style({
        stroke: new Stroke({
          color,
          width,
          lineDash: dashPattern,
        }),
      }),
    );

    // ── Direction arrow at midpoint ──────────────────────────────────
    if (arrowGeometry) {
      styles.push(
        new Style({
          geometry: arrowGeometry,
          text: new Text({
            text: '\u27A4', //  right-pointing arrow
            rotation,
            font: `${arrowSize}px sans-serif`,
            fill: new Fill({ color: effectiveArrowColor }),
            stroke: new Stroke({ color: '#FFFFFF', width: 2 }),
            textAlign: 'center',
            textBaseline: 'middle',
          }),
        }),
      );
    }

    return styles;
  };
}

// ─── Boundary Beacon Line Style ────────────────────────────────────────

/**
 * Create an OL style for boundary beacon lines with circle markers at vertices.
 *
 * Solid line, 2px, dark green (#006600), with circle markers at vertices (4px radius).
 * This style is applied to LineString features that represent beacon-to-beacon
 * boundary connections.
 *
 * @returns A Promise resolving to an OL style (not a function — static style).
 *
 * @example
 * ```ts
 * const boundaryStyle = await createBoundaryBeaconLineStyle();
 * boundaryLayer.setStyle(boundaryStyle);
 * ```
 */
export async function createBoundaryBeaconLineStyle() {
  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: CircleStyle },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Circle'),
  ]);

  return new Style({
    stroke: new Stroke({
      color: '#006600',
      width: 2,
    }),
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: '#006600' }),
      stroke: new Stroke({ color: '#fff', width: 1.5 }),
    }),
  });
}

// ─── Road Reserve Style ────────────────────────────────────────────────

/**
 * Create an OL style for road reserve boundaries.
 *
 * Dashed line, 1.5px, red (#CC0000), dash pattern [10, 5].
 * Applied to LineString or Polygon features with `featureType === 'road_reserve'`.
 *
 * @returns A Promise resolving to an OL style (not a function — static style).
 *
 * @example
 * ```ts
 * const roadStyle = await createRoadReserveStyle();
 * roadReserveLayer.setStyle(roadStyle);
 * ```
 */
export async function createRoadReserveStyle() {
  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
  ]);

  return new Style({
    stroke: new Stroke({
      color: '#CC0000',
      width: 1.5,
      lineDash: [10, 5],
    }),
    fill: new Fill({
      color: 'rgba(204, 0, 0, 0.05)',
    }),
  });
}

// ─── Easement Style ───────────────────────────────────────────────────

/**
 * Create an OL style for easement boundaries.
 *
 * Dash-dot line, 1px, blue (#0066CC), dash pattern [8, 3, 2, 3].
 * Applied to LineString or Polygon features with `featureType === 'easement'`.
 *
 * @returns A Promise resolving to an OL style (not a function — static style).
 *
 * @example
 * ```ts
 * const easementStyle = await createEasementStyle();
 * easementLayer.setStyle(easementStyle);
 * ```
 */
export async function createEasementStyle() {
  const [
    { default: Style },
    { default: Stroke },
    { default: Fill },
  ] = await Promise.all([
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
  ]);

  return new Style({
    stroke: new Stroke({
      color: '#0066CC',
      width: 1,
      lineDash: [8, 3, 2, 3],
    }),
    fill: new Fill({
      color: 'rgba(0, 102, 204, 0.05)',
    }),
  });
}
