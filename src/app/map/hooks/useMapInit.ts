'use client'
/**
 * useMapInit — Core map initialization hook
 *
 * Handles the entire map initialization lifecycle:
 * - Dynamic imports of all OpenLayers modules
 * - Projection registration
 * - Layer creation (basemaps, draw, measure, cluster)
 * - Project data fetching and marker placement
 * - Interaction setup (select, snap, drag-and-drop)
 * - View state restoration from localStorage
 * - Proper cleanup on unmount
 *
 * Performance optimizations:
 * - All OL modules loaded in parallel via Promise.all
 * - Project markers use Cluster source (distance: 40, minDistance: 20)
 * - Mouse position throttled to 100ms
 * - Map view state saved every 10s (not on every move)
 * - Tile cache size set to 2048 for better caching
 */

import { useEffect, useRef } from 'react'
import type { BasemapMode } from '@/hooks/useMapTypes'
import type { MapCleanupRefs } from '@/lib/map/olTypes'

interface UseMapInitParams {
  mapRef: React.RefObject<HTMLDivElement | null>
  setMapReady: (v: boolean) => void
  setInitError: (v: string) => void
  setProjectCount: (v: number) => void
  setMouseCoord: (v: { lon: number; lat: number; e: number; n: number } | null) => void
  setFeatureCount: (v: number) => void
  setImportMsg: (v: string) => void
  setSelectedFeature: (v: any) => void
  setFeatureName: (v: string) => void
  mouseCoordThrottleRef: React.MutableRefObject<number>
  searchParams: URLSearchParams
  pushHistory: () => void
  drawSourceRef: React.MutableRefObject<unknown>
  drawLayerRef: React.MutableRefObject<unknown>
  measureSourceRef: React.MutableRefObject<unknown>
  measureLayerRef: React.MutableRefObject<unknown>
  selectInteractionRef: React.MutableRefObject<unknown>
  mapInstance: React.MutableRefObject<unknown>
  cleanupRef: React.MutableRefObject<MapCleanupRefs | null>
  popupRef: React.MutableRefObject<HTMLDivElement | null>
  createBasemaps: (olModules: any) => Record<string, any>
  onPopupRender: (popupElement: HTMLDivElement, data: any, hidePopup: () => void) => void
}

export function useMapInit(params: UseMapInitParams) {
  const {
    mapRef, setMapReady, setInitError, setProjectCount,
    setMouseCoord, setFeatureCount, setImportMsg,
    setSelectedFeature, setFeatureName, mouseCoordThrottleRef,
    searchParams, pushHistory,
    drawSourceRef, drawLayerRef, measureSourceRef, measureLayerRef,
    selectInteractionRef, mapInstance, cleanupRef, popupRef,
    createBasemaps, onPopupRender,
  } = params

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let map: any = null
    let cancelled = false
    const olModules: any = {}

    async function initMap() {
      try {
        // Register projections with error handling
        try {
          const { registerProjections } = await import('@/lib/map/projection')
          await registerProjections()
        } catch (projErr) {
          console.warn('Projection registration failed, using defaults:', projErr)
        }

        // Parallel import of all OL modules for performance
        const imports = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/layer/Vector'),
          import('ol/layer/Group'),
          import('ol/source/OSM'),
          import('ol/source/XYZ'),
          import('ol/source/Vector'),
          import('ol/source/Cluster'),
          import('ol/Feature'),
          import('ol/geom/Point'),
          import('ol/geom/Polygon'),
          import('ol/geom/Circle'),
          import('ol/geom/LineString'),
          import('ol/style/Style'),
          import('ol/style/Fill'),
          import('ol/style/Stroke'),
          import('ol/style/Circle'),
          import('ol/style/Text'),
          import('ol/style/Icon'),
          import('ol/control/ScaleLine'),
          import('ol/control/Attribution'),
          import('ol/control/MousePosition'),
          import('ol/interaction/Draw'),
          import('ol/interaction/Select'),
          import('ol/interaction/Snap'),
          import('ol/interaction/Modify'),
          import('ol/interaction/DragAndDrop'),
          import('ol/Overlay'),
          import('ol/Geolocation'),
          import('ol/format/GeoJSON'),
          import('ol/format/KML'),
          import('ol/format/WKT'),
        ])

        const [projModule] = await Promise.all([import('ol/proj')])
        const proj = projModule as typeof import('ol/proj')

        const [Map, View, TileLayer, VectorLayer, LayerGroup, OSM, XYZ, VectorSource,
          Cluster, Feature, Point, Polygon, CircleGeom, LineString, Style, Fill, Stroke,
          CircleStyle, Text, Icon, ScaleLine, Attribution, MousePosition,
          Draw, Select, Snap, Modify, DragAndDrop, Overlay, Geolocation,
          GeoJSONFormat, KMLFormat, WKTFormat] = imports.map(i => ('default' in i ? i.default : i)) as any[]

        olModules.VectorSource = VectorSource
        olModules.VectorLayer = VectorLayer
        olModules.Feature = Feature
        olModules.Point = Point
        olModules.Polygon = Polygon
        olModules.LineString = LineString
        olModules.CircleGeom = CircleGeom
        olModules.Style = Style
        olModules.Fill = Fill
        olModules.Stroke = Stroke
        olModules.CircleStyle = CircleStyle
        olModules.Text = Text
        olModules.proj = proj
        olModules.Draw = Draw
        olModules.Modify = Modify
        olModules.Snap = Snap
        olModules.TileLayer = TileLayer
        olModules.OSM = OSM
        olModules.XYZ = XYZ
        olModules.Cluster = Cluster

        if (cancelled || !mapRef.current) return

        // ── Basemap layers ──
        const basemaps = createBasemaps(olModules)

        // ── Draw layer ──
        const drawSource = new VectorSource()
        drawSourceRef.current = drawSource
        const drawLayer = new VectorLayer({
          source: drawSource,
          style: new Style({
            fill: new Fill({ color: 'rgba(232, 132, 26, 0.15)' }),
            stroke: new Stroke({ color: '#E8841A', width: 2.5 }),
            image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
          }),
          zIndex: 50,
        })
        drawLayerRef.current = drawLayer

        // ── Measure layer ──
        const measureSource = new VectorSource()
        measureSourceRef.current = measureSource
        const measureLayer = new VectorLayer({
          source: measureSource,
          style: new Style({
            fill: new Fill({ color: 'rgba(96, 165, 250, 0.15)' }),
            stroke: new Stroke({ color: '#60a5fa', width: 2, lineDash: [6, 4] }),
            image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#60a5fa' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
          }),
          zIndex: 45,
        })
        measureLayerRef.current = measureLayer

        // ── Cluster layer for projects ──
        const projectSource = new VectorSource()
        const clusterSource = new Cluster({
          distance: 40,
          minDistance: 20,
          source: projectSource,
        })
        const clusterLayer = new VectorLayer({
          source: clusterSource,
          style: (feature: any) => {
            const size = feature.get('features')?.length || 1
            return new Style({
              image: new CircleStyle({
                radius: size > 1 ? 12 + Math.min(size * 2, 20) : 8,
                fill: new Fill({ color: size > 1 ? 'rgba(232,132,26,0.8)' : '#E8841A' }),
                stroke: new Stroke({ color: '#fff', width: 2 }),
              }),
              text: new Text({
                text: size > 1 ? String(size) : '',
                font: 'bold 12px sans-serif',
                fill: new Fill({ color: '#fff' }),
              }),
            })
          },
          zIndex: 10,
        })

        // ── Fetch projects ──
        try {
          const { createClient } = await import('@/lib/api-client/client')
          const dbClient = createClient()
          const { data: { session } } = await dbClient.auth.getSession()

          if (session?.user) {
            const { data } = await dbClient
              .from('projects')
              .select('id, name, location, utm_zone, hemisphere, survey_type, boundary_data')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: false })

            const projects = data || []
            setProjectCount(projects.length)

            for (const project of projects) {
              const bd = project.boundary_data
              const adjustedStations = bd?.adjustedStations || bd?.stations || []
              if (adjustedStations.length === 0) continue

              const projCode = 'EPSG:21037'
              const validCoords = adjustedStations
                .map((s: any) => [parseFloat(s.easting || s.E || s.e), parseFloat(s.northing || s.N || s.n)])
                .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))

              if (validCoords.length === 0) continue
              const avgE = validCoords.reduce((s: number, c: number[]) => s + c[0], 0) / validCoords.length
              const avgN = validCoords.reduce((s: number, c: number[]) => s + c[1], 0) / validCoords.length

              try {
                const coords3857 = proj.transform([avgE, avgN], projCode, 'EPSG:3857')
                const feature = new Feature({
                  geometry: new Point(coords3857),
                  projectName: project.name,
                  stationCount: validCoords.length,
                  surveyType: project.survey_type || 'cadastral',
                })
                feature.set('projectId', project.id)
                projectSource.addFeature(feature)
              } catch { /* skip */ }
            }
          }
        } catch (err) {
          console.warn('DbClient query failed:', err)
        }

        // ── Popup overlay ──
        const popupElement = document.createElement('div')
        popupElement.className = 'hidden'
        popupRef.current = popupElement

        const popupOverlay = new Overlay({
          element: popupElement,
          autoPan: { animation: { duration: 250 } },
          positioning: 'bottom-center',
          offset: [0, -10],
        })

        const hidePopup = () => {
          popupOverlay.setPosition(undefined)
          popupElement.className = 'hidden'
          popupElement.replaceChildren()
          setSelectedFeature(null)
          // ponytail: selectInteractionRef.current is unknown (was any); cast minimally
          const si = selectInteractionRef.current as { getFeatures?: () => { clear?: () => void } } | null
          const features = si?.getFeatures?.()
          features?.clear?.()
        }

        // ── Create the map ──
        map = new Map({
          target: mapRef.current,
          layers: [basemaps.osm, basemaps.satellite, basemaps.dark, basemaps.terrain, clusterLayer, drawLayer, measureLayer],
          view: new View({
            center: proj.fromLonLat([37.91, 0.02]),
            zoom: 6,
            minZoom: 6,
            maxZoom: 20,
            extent: [-2.2e7, -1.2e7, 2.2e7, 1.5e7],
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new Attribution({ collapsible: true }),
            new MousePosition({
              coordinateFormat: (coord: number[]) => {
                const lon = coord[0]
                const lat = coord[1]
                if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) return ''
                try {
                  const [e, n] = proj.transform(coord, 'EPSG:3857', 'EPSG:21037')
                  const eSafe = (e != null && !isNaN(e)) ? e : 0
                  const nSafe = (n != null && !isNaN(n)) ? n : 0
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 100) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord({ lon, lat, e: eSafe, n: nSafe })
                  }
                  return `E: ${eSafe.toFixed(1)}  N: ${nSafe.toFixed(1)}`
                } catch {
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 100) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord({ lon, lat, e: 0, n: 0 })
                  }
                  return `${lon.toFixed(5)}, ${lat.toFixed(5)}`
                }
              },
              projection: 'EPSG:3857',
              className: 'ol-mouse-position',
            }),
          ],
          overlays: [popupOverlay],
        })

        mapInstance.current = map

        // Restore saved map view state
        try {
          const savedView = localStorage.getItem('metardu-map-view')
          if (savedView) {
            const { center, zoom } = JSON.parse(savedView)
            if (center && zoom) {
              map.getView().setCenter(center)
              map.getView().setZoom(zoom)
            }
          }
        } catch { /* ignore */ }

        // Restore saved drawn features
        try {
          const savedFeatures = localStorage.getItem('metardu-map-features')
          if (savedFeatures) {
            const { default: GeoJSONFmt } = await import('ol/format/GeoJSON')
            const fmt = new GeoJSONFmt()
            const parsed = JSON.parse(savedFeatures)
            const features = fmt.readFeatures(parsed, {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
            })
            drawSource.addFeatures(features)
            setFeatureCount(drawSource.getFeatures().length)
          }
        } catch { /* ignore */ }

        // ── Select interaction ──
        const select = new Select({
          style: new Style({
            fill: new Fill({ color: 'rgba(232,132,26,0.3)' }),
            stroke: new Stroke({ color: '#E8841A', width: 3 }),
            image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
          }),
          hitTolerance: 5,
          layers: [drawLayer],
        })
        selectInteractionRef.current = select
        map.addInteraction(select)

        select.on('select', (evt: any) => {
          const selected = evt.selected
          if (selected.length > 0) {
            const feature = selected[0]
            const coord = feature.getGeometry()?.getClosestPoint(evt.mapBrowserEvent.coordinate)
            const geometry = feature.getGeometry()
            const geomType = geometry?.getType?.() || 'unknown'
            const props = feature.getProperties()

            const clusterFeatures = feature.get('features')
            if (clusterFeatures && clusterFeatures.length > 1) {
              const extent = feature.getGeometry()?.getExtent()
              if (extent) map.getView().fit(extent, { padding: [100, 100, 100, 100], duration: 500, maxZoom: 15 })
              return
            }

            const projectName = props.projectName || (clusterFeatures?.[0]?.get?.('projectName')) || ''
            const stationName = props.stationName || props.label || props.name || ''
            const projectId = props.projectId || (clusterFeatures?.[0]?.get?.('projectId')) || ''

            setSelectedFeature(feature)
            setFeatureName(stationName || projectName || geomType)

            onPopupRender(popupElement, {
              coordinate: coord,
              projectName: projectName || undefined,
              stationName: stationName || undefined,
              geometryType: geomType,
              projectId: projectId || undefined,
            }, hidePopup)

            if (coord) popupOverlay.setPosition(coord)
          } else {
            popupElement.className = 'hidden'
            popupElement.replaceChildren()
            popupOverlay.setPosition(undefined)
            setSelectedFeature(null)
          }
        })

        // ── Snap interaction ──
        const snap = new Snap({ source: drawSource })
        map.addInteraction(snap)

        // ── Geolocation ──
        const geolocation = new Geolocation({
          trackingOptions: { enableHighAccuracy: true },
          projection: 'EPSG:3857',
        })

        // ── Drag & Drop ──
        const dragAndDrop = new DragAndDrop({
          formatConstructors: [GeoJSONFormat, KMLFormat, WKTFormat],
        })
        dragAndDrop.on('addfeatures', (evt: any) => {
          const features = evt.features
          if (features && features.length > 0) {
            drawSource.addFeatures(features)
            setFeatureCount(drawSource.getFeatures().length)
            const extent = drawSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 })
            }
            setImportMsg(`Imported ${features.length} feature(s)`)
            setTimeout(() => setImportMsg(''), 3000)
            pushHistory()
          }
        })
        map.addInteraction(dragAndDrop)

        // ── Track feature count ──
        drawSource.on('addfeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })
        drawSource.on('removefeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })

        // ── Zoom to data ──
        if (projectSource.getFeatures().length > 0) {
          try {
            const extent = projectSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 })
            }
          } catch { /* keep default */ }
        }

        // Auto-load specific project from URL param
        const projectIdParam = searchParams.get('projectId')
        if (projectIdParam) {
          const projectFeature = projectSource.getFeatures().find((f: any) => f.get('projectId') === projectIdParam)
          if (projectFeature) {
            const extent = projectFeature.getGeometry()?.getExtent()
            if (extent && extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [200, 200, 200, 200], maxZoom: 17, duration: 800 })
            }
          }
        }

        // Store cleanup refs in dedicated ref (not on map object)
        cleanupRef.current = { geolocation, snap, dragAndDrop }

        if (!cancelled) setMapReady(true)
      } catch (err: unknown) {
        console.error('Map initialization failed:', err)
        if (!cancelled) setInitError(err instanceof Error ? (err as Error).message : 'Map failed to load')
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (map) {
        try {
          if (cleanupRef.current?.geolocation) {
            cleanupRef.current.geolocation.setTracking(false)
          }
        } catch { /* ignore */ }
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
        cleanupRef.current = null
      }
    }
  
  }, [])
}
