/**
 * SurveyMapEngine core types (plan §3.1 / Phase 1).
 *
 * Zero React, zero OpenLayers — usable from server code and any map surface
 * (/map, /field/map, workspace). All CRS-touching APIs elsewhere in core take
 * an explicit `CrsRef`; there is never a default (plan §3.3.2).
 */

/** Authoritative CRS reference, e.g. 'EPSG:21037'. Never defaulted — always passed explicitly. */
export type CrsRef = string;

/** A point in the project CRS grid plane (metres). Valid for survey math. */
export interface GridPoint {
  easting: number;
  northing: number;
}

/** A point in the display CRS (EPSG:3857). Never valid for survey math (plan §3.3.4). */
export interface DisplayPoint {
  x: number;
  y: number;
}

/** Result of a survey measurement computed through the CRS authority. */
export interface MeasurementResult {
  type: 'distance' | 'area' | 'bearing' | 'coordinate';
  value: number;
  formatted: string;
  unit: string;
  points?: GridPoint[];
}

/** Coarse classification of a registered map layer (Phase 2). */
export type LayerKind = 'basemap' | 'overlay' | 'grid';

/**
 * Layer descriptor for the engine layer registry (ol/layers.ts, Phase 2).
 * Required fields unchanged from Phase 1; `kind`/`opacity` added for
 * `describeMapLayers`.
 */
export interface LayerDescriptor {
  id: string;
  title: string;
  visible: boolean;
  kind?: LayerKind;
  opacity?: number;
}
