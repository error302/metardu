/**
 * Project Points Layer — loads survey points from a project and renders them
 * on the OpenLayers map with distinct styles for control points vs topo points.
 *
 * Project points are fetched by viewport. Dense topographic points are drawn
 * as scale-dependent visual clusters; controls and singleton points retain
 * exact coordinates and identity.
 */

import type { Map } from 'ol'
import type { FeatureLike } from 'ol/Feature'

export interface ProjectPointsLayerResult {
  pointsLayer: import('ol/layer/Vector').default
  pointsSource: import('ol/source/Vector').default
  cleanup: () => void
  /** Number of source records that produced finite map coordinates. */
  pointCount: number
  /** Number skipped because the record could not be transformed safely. */
  skippedPointCount: number
  controlPointCount: number
  /** Authoritative project CRS returned by the points API. */
  projectCrs: string
}

export interface ProjectPointsViewportStatus {
  pointCount: number
  skippedPointCount: number
  controlPointCount: number
  truncated: boolean
  message: string | null
}

interface ProjectPointsExtentPayload {
  extent?: unknown
  total?: unknown
  meta?: { project_crs?: ProjectCrs | null }
}

interface ProjectPointsViewportPayload {
  points?: unknown
  truncated?: unknown
  clustered?: unknown
  truncationReason?: unknown
}

/**
 * Raw database/map-feature shape returned by `/api/project/[id]/map-points`.
 *
 * This is intentionally distinct from the canonical `SurveyPoint` interface
 * (which uses `name`, not `point_name`) — API/DB boundaries should map
 * between the two explicitly rather than pretending they're the same shape.
 */
interface SurveyPointRow {
  id: string | null
  name: string | null
  easting: number | string | null
  northing: number | string | null
  elevation: number | string | null
  code: string | null
  description: string | null
  is_control: boolean
  feature_kind: 'point' | 'cluster'
  cluster_count: number | string
  cell_extent: unknown
}

/**
 * Project-level CRS metadata returned in `meta.project_crs` by the endpoint.
 * Used to derive the correct EPSG code for coordinate transforms.
 */
interface ProjectCrs {
  horizontal_crs: string | null
}

/**
 * Resolve only the CRS declared in project_reference_systems. Older project
 * columns may contain values materialized from former defaults, so they are
 * not authoritative evidence that the surveyor selected that CRS.
 */
export function requireDeclaredProjectCrs(crs: ProjectCrs | null | undefined): string {
  const horizontalCrs = crs?.horizontal_crs?.trim()
  if (!horizontalCrs) {
    throw new Error(
      'This project has no declared coordinate reference system. Declare one in project settings before loading survey points.',
    )
  }
  return horizontalCrs
}

/** PostgreSQL NUMERIC values arrive as strings; normalize them before projection. */
export function finiteSurveyCoordinate(easting: unknown, northing: unknown): [number, number] | null {
  const parse = (value: unknown): number | null => {
    if (typeof value === 'string' && value.trim() === '') return null
    if (typeof value !== 'string' && typeof value !== 'number') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const e = parse(easting)
  const n = parse(northing)
  return e === null || n === null ? null : [e, n]
}

/** Zoom to a visual cell summary without treating its centroid as a survey coordinate. */
export function zoomToSurveyPointCluster(map: Map, rawExtent: unknown): boolean {
  if (!Array.isArray(rawExtent) || rawExtent.length !== 4 ||
      !rawExtent.every(value => typeof value === 'number' && Number.isFinite(value))) return false
  const [minX, minY, maxX, maxY] = rawExtent as [number, number, number, number]
  if (minX >= maxX || minY >= maxY) return false
  map.getView().fit([minX, minY, maxX, maxY], {
    padding: [96, 96, 96, 96],
    maxZoom: 22,
    duration: 250,
  })
  return true
}

/**
 * Load project survey points and create a styled vector layer.
 *
 * @param projectId The project ID
 * @param map The OpenLayers map instance
 * @returns Layer result with cleanup function
 */
export async function createProjectPointsLayer(
  projectId: string,
  map: Map,
  options: { onViewportStatus?: (status: ProjectPointsViewportStatus) => void } = {},
): Promise<ProjectPointsLayerResult> {
  // Fetch only the project extent/CRS first. Point records are requested for
  // the current map viewport below so a large field book is never sent whole.
  const extentResponse = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/map-points?mode=extent`,
  )
  if (!extentResponse.ok) {
    throw new Error(`Failed to load project map extent (${extentResponse.status})`)
  }
  const extentPayload = (await extentResponse.json()) as ProjectPointsExtentPayload
  const projCode = requireDeclaredProjectCrs(extentPayload.meta?.project_crs)
  const { registerProjectProjection } = await import('@/lib/map/projection')
  await registerProjectProjection(projCode)

  // Dynamic imports (ESM-safe)
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: Point },
    { default: Style },
    { default: CircleStyle },
    { default: Fill },
    { default: Stroke },
    { default: Text },
    proj,
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/Circle'),
    import('ol/style/Fill'),
    import('ol/style/Stroke'),
    import('ol/style/Text'),
    import('ol/proj'),
  ])

  const source = new VectorSource()

  // Style function: control points = sienna filled circle, topo = small dot
  const layer = new VectorLayer({
    source,
    style: (feature: FeatureLike) => {
      const isControl = feature.get('isControl') === true
      const code = feature.get('code') as string | null
      const name = feature.get('pointName') as string | null
      const clusterCount = Number(feature.get('clusterCount') ?? 0)

      if (clusterCount > 1) {
        return new Style({
          image: new CircleStyle({
            radius: Math.min(18, 8 + Math.log2(clusterCount) * 1.6),
            fill: new Fill({ color: '#6F8D7A' }),
            stroke: new Stroke({ color: '#E8E4DE', width: 2 }),
          }),
          text: new Text({
            text: clusterCount.toLocaleString(),
            font: 'bold 10px "JetBrains Mono", monospace',
            fill: new Fill({ color: '#FFFFFF' }),
            stroke: new Stroke({ color: '#1A1816', width: 2 }),
          }),
        })
      }

      if (isControl) {
        // Control point: larger sienna circle with white border + label
        return new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: '#D17B47' }),
            stroke: new Stroke({ color: '#E8E4DE', width: 2.5 }),
          }),
          text: new Text({
            text: name || '',
            font: '11px "JetBrains Mono", monospace',
            fill: new Fill({ color: '#E8E4DE' }),
            stroke: new Stroke({ color: '#1A1816', width: 3 }),
            offsetY: -14,
          }),
        })
      }

      // Topo point: small dot, color by code
      let dotColor = '#A89E92' // default muted
      if (code) {
        const uc = code.toUpperCase()
        if (uc.includes('BLD') || uc.includes('BUILD')) dotColor = '#8FA67E' // sage = buildings
        if (uc.includes('ROAD') || uc.includes('RD')) dotColor = '#C89759' // ochre = roads
        if (uc.includes('FENCE')) dotColor = '#7A7066' // muted = fence
        if (uc.includes('TREE')) dotColor = '#5A7551' // dark sage = vegetation
        if (uc.includes('BOUND') || uc.includes('BDRY')) dotColor = '#D17B47' // accent = boundary
      }

      return new Style({
        image: new CircleStyle({
          radius: 4,
          fill: new Fill({ color: dotColor }),
          stroke: new Stroke({ color: '#1A1816', width: 1 }),
        }),
      })
    },
    zIndex: 25, // above basemap (0), below draw (50) and measure (45)
  })

  map.addLayer(layer)

  let disposed = false
  let viewportRequest: AbortController | null = null
  let viewportTimer: ReturnType<typeof setTimeout> | null = null
  let pointCount = 0
  let skippedPointCount = 0
  let controlPointCount = 0
  let truncated = false

  const updateViewport = async () => {
    if (disposed) return
    const size = map.getSize()
    if (!size || size[0] <= 0 || size[1] <= 0) return

    viewportRequest?.abort()
    const request = new AbortController()
    viewportRequest = request
    source.clear(true)
    pointCount = 0
    skippedPointCount = 0
    controlPointCount = 0
    truncated = false

    try {
      const extent = map.getView().calculateExtent(size)
      const bbox = proj.transformExtent(extent, 'EPSG:3857', projCode, 8)
      if (bbox.length !== 4 || bbox.some(value => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
        options.onViewportStatus?.({
          pointCount, skippedPointCount, controlPointCount, truncated,
          message: 'The current map view cannot be transformed into the declared project CRS.',
        })
        return
      }

      // Choose a project-grid aggregation cell around 56 screen pixels wide.
      // Dense topographic points remain represented by count-bearing cells;
      // control points are always returned individually by the server.
      const cellSize = Math.max(
        (bbox[2] - bbox[0]) / Math.max(1, size[0] / 56),
        (bbox[3] - bbox[1]) / Math.max(1, size[1] / 56),
      )
      if (!Number.isFinite(cellSize) || cellSize <= 0) {
        options.onViewportStatus?.({
          pointCount, skippedPointCount, controlPointCount, truncated,
          message: 'The current map view has no usable scale for point aggregation.',
        })
        return
      }

      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/map-points?bbox=${encodeURIComponent(bbox.join(','))}` +
          `&clustered=true&cellSize=${encodeURIComponent(String(cellSize))}`,
        { signal: request.signal },
      )
      if (!response.ok) throw new Error(`Survey point request failed (${response.status})`)
      const payload = (await response.json()) as ProjectPointsViewportPayload
      if (!Array.isArray(payload.points) || typeof payload.truncated !== 'boolean' || payload.clustered !== true ||
          (payload.truncationReason !== null && payload.truncationReason !== 'control-points' &&
            payload.truncationReason !== 'topographic-density')) {
        throw new Error('Invalid survey point response')
      }
      if (disposed || request.signal.aborted || viewportRequest !== request) return

      const features = []
      let representedPointCount = 0
      for (const rawPoint of payload.points.slice(0, 500)) {
        if (!rawPoint || typeof rawPoint !== 'object') {
          skippedPointCount++
          continue
        }
        const pt = rawPoint as SurveyPointRow
        const clusterCount = Number(pt.cluster_count)
        if (!Number.isSafeInteger(clusterCount) || clusterCount < 1 ||
            (pt.feature_kind !== 'point' && pt.feature_kind !== 'cluster') ||
            (pt.feature_kind === 'cluster') !== (clusterCount > 1)) {
          skippedPointCount++
          continue
        }
        const isCluster = pt.feature_kind === 'cluster' && clusterCount > 1
        const sourceCoordinate = finiteSurveyCoordinate(pt.easting, pt.northing)
        if (!sourceCoordinate) {
          skippedPointCount++
          continue
        }
        try {
          const coords3857 = proj.transform(sourceCoordinate, projCode, 'EPSG:3857')
          if (!coords3857.every(Number.isFinite)) {
            skippedPointCount++
            continue
          }
          let clusterExtent: number[] | null = null
          if (isCluster) {
            if (!Array.isArray(pt.cell_extent) || pt.cell_extent.length !== 4 ||
                !pt.cell_extent.every(value => typeof value === 'number' && Number.isFinite(value))) {
              skippedPointCount++
              continue
            }
            const projectedExtent = proj.transformExtent(pt.cell_extent as number[], projCode, 'EPSG:3857', 8)
            if (projectedExtent.length !== 4 || !projectedExtent.every(Number.isFinite)) {
              skippedPointCount++
              continue
            }
            clusterExtent = projectedExtent
          }

          const properties: Record<string, unknown> = {
            geometry: new Point(coords3857),
            pointName: isCluster ? `${clusterCount.toLocaleString()} topo points` : pt.name,
            pointType: isCluster ? 'survey-cluster' : 'survey',
            clusterCount,
          }
          if (isCluster) {
            // Cluster centroids are visual summaries only. Never attach survey
            // coordinates or a source-record ID to an aggregate feature.
            properties.clusterExtent = clusterExtent
          } else {
            properties.pointId = pt.id
            properties.easting = sourceCoordinate[0]
            properties.northing = sourceCoordinate[1]
            properties.elevation = pt.elevation == null ? null : Number(pt.elevation)
            properties.code = pt.code
            properties.description = pt.description
            properties.isControl = pt.is_control
          }
          const feature = new Feature(properties)
          feature.set('projectId', projectId)
          features.push(feature)
          representedPointCount += clusterCount
          if (pt.is_control) controlPointCount++
        } catch {
          skippedPointCount++
        }
      }
      source.addFeatures(features)
      pointCount = representedPointCount
      truncated = payload.truncated

      const messages: string[] = []
      if (truncated && payload.truncationReason === 'control-points') {
        messages.push('More than 500 control points are in view; this map view is partial. Zoom in to inspect the control network.')
      } else if (truncated) {
        messages.push('More than 500 map features are in view; zoom in for finer groups. Coincident points remain grouped.')
      }
      if (skippedPointCount > 0) {
        messages.push(`${skippedPointCount} survey point${skippedPointCount === 1 ? '' : 's'} could not be plotted. Verify coordinates and source CRS.`)
      }
      options.onViewportStatus?.({
        pointCount, skippedPointCount, controlPointCount, truncated,
        message: messages.length ? messages.join(' ') : null,
      })
    } catch (error) {
      if (disposed || request.signal.aborted) return
      source.clear(true)
      pointCount = 0
      options.onViewportStatus?.({
        pointCount, skippedPointCount, controlPointCount, truncated,
        message: error instanceof Error
          ? `${error.message}. Pan or zoom to retry.`
          : 'Survey points could not load for this view. Pan or zoom to retry.',
      })
    }
  }

  const onViewportChange = () => {
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(() => {
      viewportTimer = null
      void updateViewport()
    }, 120)
  }

  map.on('moveend', onViewportChange)
  map.on('change:size', onViewportChange)

  const rawExtent = Array.isArray(extentPayload.extent) && extentPayload.extent.length === 4
    ? extentPayload.extent.map(Number)
    : null
  if (Number(extentPayload.total) > 0 && rawExtent?.every(Number.isFinite)) {
    const [minE, minN, maxE, maxN] = rawExtent as [number, number, number, number]
    const units = proj.get(projCode)?.getUnits()
    const padE = Math.max(Math.abs(maxE - minE) * 0.05, units === 'degrees' ? 0.0001 : 1)
    const padN = Math.max(Math.abs(maxN - minN) * 0.05, units === 'degrees' ? 0.0001 : 1)
    const fitExtent = proj.transformExtent(
      [minE - padE, minN - padN, maxE + padE, maxN + padN],
      projCode,
      'EPSG:3857',
      8,
    )
    if (fitExtent.every(Number.isFinite)) {
      map.getView().fit(fitExtent, { padding: [72, 72, 72, 72], maxZoom: 18, duration: 0 })
    }
  }

  // `fit` emits moveend asynchronously in some browsers, so load immediately
  // as well; the request token prevents duplicate/stale responses from winning.
  await updateViewport()

  return {
    pointsLayer: layer,
    pointsSource: source,
    cleanup: () => {
      disposed = true
      if (viewportTimer) clearTimeout(viewportTimer)
      viewportRequest?.abort()
      map.un('moveend', onViewportChange)
      map.un('change:size', onViewportChange)
      map.removeLayer(layer)
    },
    pointCount,
    skippedPointCount,
    controlPointCount,
    projectCrs: projCode,
  }
}
