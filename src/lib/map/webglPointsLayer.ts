/**
 * @module webglPointsLayer
 *
 * Optional WebGL renderer candidate for dense elevation point layers.
 * This helper is not wired into a production map workflow. Its performance
 * must be benchmarked with representative survey files and target devices
 * before it is used to make product speed claims.
 *
 * OpenLayers 10.8 recommends WebGLVector over the deprecated WebGLPoints
 * layer. Keep this helper isolated until a measured workload needs it.
 *
 * Features:
 * - Color interpolation by elevation (blue=low, red=high)
 * - Size scaling by zoom level
 * - Opacity control
 * - Dynamic style updates without re-rendering
 *
 * Usage:
 *   const layer = createWebGLPointsLayer(features, { elevationField: 'elevation' })
 *   map.addLayer(layer)
 */

import WebGLVectorLayer from 'ol/layer/WebGLVector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import type { FlatStyle } from 'ol/style/flat'

const layerOptions = new WeakMap<WebGLVectorLayer<VectorSource>, Required<WebGLPointsOptions>>()

function pointStyle(options: Required<WebGLPointsOptions>): FlatStyle {
  const { elevationField, minElevation, maxElevation, pointRadius, opacity, strokeWidth } = options
  const upper = maxElevation > minElevation ? maxElevation : minElevation + 1
  return {
    'circle-radius': pointRadius,
    'circle-fill-color': [
      'interpolate', ['linear'], ['get', elevationField],
      minElevation, '#0000FF',
      (minElevation + upper) / 2, '#00FF00',
      upper, '#FF0000',
    ],
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': strokeWidth,
    'circle-opacity': opacity,
  }
}

export interface WebGLPointsOptions {
  /** Property name for elevation-based coloring */
  elevationField?: string
  /** Min elevation for color scale (default: auto-detect) */
  minElevation?: number
  /** Max elevation for color scale (default: auto-detect) */
  maxElevation?: number
  /** Point radius (default: 4) */
  pointRadius?: number
  /** Opacity (default: 0.8) */
  opacity?: number
  /** Stroke width (default: 1) */
  strokeWidth?: number
}

/**
 * Create a WebGL points layer from an array of features.
 *
 * @param features - Array of OpenLayers features with Point geometry
 * @param options - Styling options
 */
export function createWebGLPointsLayer(
  features: Feature<Point>[],
  options: WebGLPointsOptions = {},
): WebGLVectorLayer<VectorSource> {
  const {
    elevationField = 'elevation',
    minElevation,
    maxElevation,
    pointRadius = 4,
    opacity = 0.8,
    strokeWidth = 1,
  } = options

  // Auto-detect elevation range if not specified
  let minElev = minElevation ?? Infinity
  let maxElev = maxElevation ?? -Infinity

  if (minElevation == null || maxElevation == null) {
    for (const feature of features) {
      const elev: unknown = feature.get(elevationField)
      if (typeof elev === 'number' && Number.isFinite(elev)) {
        if (minElevation == null) minElev = Math.min(minElev, elev)
        if (maxElevation == null) maxElev = Math.max(maxElev, elev)
      }
    }
    if (!isFinite(minElev)) minElev = 0
    if (!isFinite(maxElev)) maxElev = 1000
  }

  const source = new VectorSource({ features })
  const resolvedOptions = { elevationField, minElevation: minElev, maxElevation: maxElev, pointRadius, opacity, strokeWidth }
  const layer = new WebGLVectorLayer({
    source,
    style: pointStyle(resolvedOptions),
    disableHitDetection: false,
  })
  layerOptions.set(layer, resolvedOptions)
  return layer
}

/**
 * Create a WebGL points layer from raw coordinate array.
 *
 * @param points - Array of { easting, northing, elevation }
 * @param options - Styling options
 */
export function createWebGLPointsFromCoords(
  points: Array<{ easting: number; northing: number; elevation?: number }>,
  options: WebGLPointsOptions = {},
): WebGLVectorLayer<VectorSource> {
  const features: Feature<Point>[] = points.map((pt, i) => {
    const feature = new Feature({
      geometry: new Point([pt.easting, pt.northing]),
    })
    feature.set('elevation', pt.elevation ?? 0)
    feature.set('index', i)
    return feature
  })

  return createWebGLPointsLayer(features, options)
}

/**
 * Create a WebGL points layer from GeoJSON.
 *
 * @param geojson - GeoJSON FeatureCollection with Point features
 * @param options - Styling options
 */
export function createWebGLPointsFromGeoJSON(
  geojson: string | object,
  options: WebGLPointsOptions = {},
): WebGLVectorLayer<VectorSource> {
  const format = new GeoJSON()
  const features = format.readFeatures(
    typeof geojson === 'string' ? geojson : JSON.stringify(geojson),
  ) as Feature<Point>[]

  return createWebGLPointsLayer(features, options)
}

/**
 * Update the style of an existing WebGL points layer.
 * Useful for changing color scale without recreating the layer.
 */
export function updateWebGLPointsStyle(
  layer: WebGLVectorLayer<VectorSource>,
  options: WebGLPointsOptions,
): void {
  if (Object.values(options).every((value) => value === undefined)) return
  const current = layerOptions.get(layer)
  if (!current) throw new Error('Create the point layer with createWebGLPointsLayer before updating its style.')
  const supplied = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
  const updated = { ...current, ...supplied }
  layer.setStyle(pointStyle(updated))
  layerOptions.set(layer, updated)
}
