/**
 * METARDU Subdivision Types
 *
 * Types for parcel subdivision operations — splitting a parent parcel
 * boundary into smaller child parcels (lots) using various methods.
 *
 * Coordinates are in EPSG:21037 (Kenya Arc 1960 / UTM 37S), meters.
 * Bearings are WCB (whole circle bearing) 0-360° clockwise from North.
 */

import type { Point2D } from '@/lib/engine/types'

/** Supported subdivision algorithms */
export type SubdivisionMethod = 'grid' | 'radial' | 'area' | 'single-split'

/** A split line defined by two endpoints and optional bearing */
export interface SplitLine {
  startPoint: Point2D
  endPoint: Point2D
  angle?: number  // bearing in degrees (WCB)
}

/** A single subdivided lot */
export interface SubdividedLot {
  lotNumber: number
  vertices: Point2D[]       // ordered polygon vertices (closed)
  areaHa: number
  perimeter: number
  centroid: Point2D
  areaTarget?: number       // requested target area (for area-based method)
  areaError?: number        // difference from target (areaHa - areaTarget)
}

/** Parameters for each subdivision method */
export interface SubdivisionParams {
  /** Grid method: number of rows */
  rows?: number
  /** Grid method: number of columns */
  cols?: number
  /** Area-based method: target area per lot in hectares */
  targetArea?: number
  /** Radial method: center point of the radial subdivision */
  center?: Point2D
  /** Radial method: number of sectors/lots */
  numLots?: number
  /** Single-split method: the line to split by */
  splitLine?: SplitLine
  /** Area-based method: preferred cut bearing (degrees, WCB) */
  preferredBearing?: number
  /** Road reserve width in meters (e.g., 12 for a 2-lane road) */
  roadReserveWidth?: number
  /** Edge indices to apply road reserve to; empty array = auto-detect longest edge */
  roadReserveEdges?: number[]
}

/** Road reserve corridor information */
export interface RoadReserveInfo {
  /** Road corridor polygon vertices (closed) */
  roadPolygon: Point2D[]
  /** Width of the road reserve in meters */
  width: number
  /** Which parent edges the road reserve was applied to */
  clippedEdges: number[]
  /** Area of the road corridor in hectares */
  areaHa: number
}

/** Complete subdivision result */
export interface SubdivisionResult {
  method: SubdivisionMethod
  parentParcel: {
    vertices: Point2D[]
    areaHa: number
  }
  lots: SubdividedLot[]
  totalAreaHa: number
  remainderAreaHa: number  // area not allocated to any lot
  /** Road reserve information, if applied */
  roadReserve?: RoadReserveInfo
}
