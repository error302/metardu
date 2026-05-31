'use client'
/**
 * useMapInteractions — Map interaction hooks (draw, measure, edit, export, GPS, stakeout)
 *
 * All interaction logic extracted from MapClient for maintainability.
 * Uses useCallback for stable references to prevent unnecessary re-renders.
 */

import { useCallback } from 'react'
import type { DrawMode, MeasureMode } from '@/app/map/mapTypes'
import { downloadDXF, type SurveyPoint } from '@/lib/export/generateDXF'
import { downloadLandXML, type LandXMLProject, type LandXMLPoint } from '@/lib/export/generateLandXML'

interface UseMapInteractionsParams {
  mapInstance: React.MutableRefObject<any>
  drawSourceRef: React.MutableRefObject<any>
  drawLayerRef: React.MutableRefObject<any>
  drawInteractionRef: React.MutableRefObject<any>
  selectInteractionRef: React.MutableRefObject<any>
  modifyInteractionRef: React.MutableRefObject<any>
  measureInteractionRef: React.MutableRefObject<any>
  measureSourceRef: React.MutableRefObject<any>
  measureLayerRef: React.MutableRefObject<any>
  annotationLayerRef: React.MutableRefObject<any>
  drawMode: DrawMode
  editMode: boolean
  measureMode: MeasureMode
  showAnnotations: boolean
  gpsTracking: boolean
  stakeoutTarget: { e: number; n: number } | null
  gpsPos: { lon: number; lat: number; accuracy: number } | null
  hasFeature: (feature: string) => boolean
  setDrawMode: (m: DrawMode) => void
  setEditMode: (m: boolean) => void
  setMeasureMode: (m: MeasureMode) => void
  setMeasureResult: (s: string) => void
  setFeatureCount: (n: number) => void
  setSelectedFeature: (f: any) => void
  setFeatureName: (s: string) => void
  setGpsTracking: (v: boolean) => void
  setGpsPos: (v: { lon: number; lat: number; accuracy: number } | null) => void
  setStakeoutTarget: (v: { e: number; n: number } | null) => void
  setStakeoutActive: (v: boolean) => void
  setShowAnnotations: (v: boolean) => void
  setSaveMsg: (s: string) => void
  pushHistory: () => void
  clearHistory: () => void
  popupRef: React.MutableRefObject<HTMLDivElement | null>
  toggleGPS: () => void
}

export function useMapInteractions(p: UseMapInteractionsParams) {

  // ── DRAW ──
  const toggleDraw = useCallback(async (mode: DrawMode) => {
    if (!p.mapInstance.current) return
    const { default: Draw } = await import('ol/interaction/Draw')
    const { default: Style } = await import('ol/style/Style')
    const { default: Fill } = await import('ol/style/Fill')
    const { default: Stroke } = await import('ol/style/Stroke')
    const { default: CircleStyle } = await import('ol/style/Circle')

    if (p.measureMode !== 'none') {
      if (p.measureInteractionRef.current) {
        p.mapInstance.current.removeInteraction(p.measureInteractionRef.current)
        p.measureInteractionRef.current = null
      }
      if (p.measureSourceRef.current) p.measureSourceRef.current.clear()
      p.setMeasureMode('none')
      p.setMeasureResult('')
    }
    if (p.editMode) {
      if (p.modifyInteractionRef.current) {
        p.mapInstance.current.removeInteraction(p.modifyInteractionRef.current)
        p.modifyInteractionRef.current = null
      }
      p.setEditMode(false)
    }

    if (p.drawInteractionRef.current) {
      p.mapInstance.current.removeInteraction(p.drawInteractionRef.current)
      p.drawInteractionRef.current = null
    }

    if (mode === 'none' || mode === p.drawMode) {
      p.setDrawMode('none')
      return
    }

    const source = p.drawSourceRef.current
    if (!source) return

    const geomType = mode as 'Point' | 'LineString' | 'Polygon' | 'Circle'
    const draw = new Draw({
      source,
      type: geomType,
      style: new Style({
        fill: new Fill({ color: 'rgba(232,132,26,0.3)' }),
        stroke: new Stroke({ color: '#E8841A', width: 2, lineDash: [8, 4] }),
        image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      }),
    })

    draw.on('drawend', () => {
      setTimeout(() => p.selectInteractionRef.current?.getFeatures()?.clear(), 100)
      setTimeout(p.pushHistory, 150)
    })

    p.mapInstance.current.addInteraction(draw)
    p.drawInteractionRef.current = draw
    p.setDrawMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.drawMode, p.editMode, p.measureMode, p.pushHistory])

  // ── EDIT / MODIFY ──
  const toggleEdit = useCallback(async () => {
    if (!p.mapInstance.current) return

    if (p.editMode) {
      if (p.modifyInteractionRef.current) {
        p.mapInstance.current.removeInteraction(p.modifyInteractionRef.current)
        p.modifyInteractionRef.current = null
      }
      p.setEditMode(false)
      return
    }

    if (p.drawInteractionRef.current) {
      p.mapInstance.current.removeInteraction(p.drawInteractionRef.current)
      p.drawInteractionRef.current = null
    }
    p.setDrawMode('none')
    if (p.measureMode !== 'none') {
      if (p.measureInteractionRef.current) {
        p.mapInstance.current.removeInteraction(p.measureInteractionRef.current)
        p.measureInteractionRef.current = null
      }
      if (p.measureSourceRef.current) p.measureSourceRef.current.clear()
      p.setMeasureMode('none')
      p.setMeasureResult('')
    }

    const { default: Modify } = await import('ol/interaction/Modify')
    const source = p.drawSourceRef.current
    if (!source) return

    const modify = new Modify({ source })
    modify.on('modifyend', () => {
      setTimeout(p.pushHistory, 100)
    })
    p.mapInstance.current.addInteraction(modify)
    p.modifyInteractionRef.current = modify
    p.setEditMode(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editMode, p.measureMode, p.pushHistory])

  // ── DELETE SELECTED ──
  const deleteSelected = useCallback(() => {
    if (!p.selectInteractionRef.current || !p.drawSourceRef.current) return
    const features = p.selectInteractionRef.current.getFeatures().getArray()
    features.forEach((f: any) => p.drawSourceRef.current.removeFeature(f))
    p.selectInteractionRef.current.getFeatures().clear()
    p.setSelectedFeature(null)
    p.pushHistory()
  }, [p.pushHistory])

  // ── MEASURE ──
  const toggleMeasure = useCallback(async (mode: MeasureMode) => {
    if (!p.mapInstance.current) return
    const { default: Draw } = await import('ol/interaction/Draw')
    const { default: Style } = await import('ol/style/Style')
    const { default: Fill } = await import('ol/style/Fill')
    const { default: Stroke } = await import('ol/style/Stroke')
    const { default: CircleStyle } = await import('ol/style/Circle')

    if (p.drawInteractionRef.current) {
      p.mapInstance.current.removeInteraction(p.drawInteractionRef.current)
      p.drawInteractionRef.current = null
    }
    p.setDrawMode('none')
    if (p.editMode) {
      if (p.modifyInteractionRef.current) {
        p.mapInstance.current.removeInteraction(p.modifyInteractionRef.current)
        p.modifyInteractionRef.current = null
      }
      p.setEditMode(false)
    }

    if (p.measureInteractionRef.current) {
      p.mapInstance.current.removeInteraction(p.measureInteractionRef.current)
      p.measureInteractionRef.current = null
    }
    if (p.measureSourceRef.current) p.measureSourceRef.current.clear()
    p.setMeasureResult('')

    if (mode === 'none' || mode === p.measureMode) {
      p.setMeasureMode('none')
      return
    }

    const source = p.measureSourceRef.current
    if (!source) return

    const geomType = mode === 'distance' ? 'LineString' as const : 'Polygon' as const
    const draw = new Draw({
      source,
      type: geomType,
      style: new Style({
        fill: new Fill({ color: 'rgba(96,165,250,0.2)' }),
        stroke: new Stroke({ color: '#60a5fa', width: 2, lineDash: [6, 4] }),
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#60a5fa' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
      }),
    })

    draw.on('drawabort', () => {
      p.setMeasureMode('none')
      p.setMeasureResult('')
    })

    draw.on('drawend', async (evt: any) => {
      const geom = evt.feature.getGeometry()
      if (mode === 'distance') {
        const length = geom.getLength()
        const coords = geom.getCoordinates()
        let bearingStr = ''
        if (coords.length >= 2) {
          try {
            const { transform } = await import('ol/proj')
            const first = transform(coords[0], 'EPSG:3857', 'EPSG:21037')
            const last = transform(coords[coords.length - 1], 'EPSG:3857', 'EPSG:21037')
            const dE = last[0] - first[0]
            const dN = last[1] - first[1]
            let bearing = (Math.atan2(dE, dN) * 180) / Math.PI
            if (bearing < 0) bearing += 360
            bearingStr = ` | Brg: ${bearing.toFixed(2)}\u00B0`
          } catch { /* skip bearing */ }
        }
        if (length > 1000) {
          p.setMeasureResult(`Distance: ${(length / 1000).toFixed(3)} km${bearingStr}`)
        } else {
          p.setMeasureResult(`Distance: ${length.toFixed(2)} m${bearingStr}`)
        }
      } else {
        const area = geom.getArea()
        if (area > 1000000) {
          p.setMeasureResult(`Area: ${(area / 1000000).toFixed(4)} km\u00B2`)
        } else {
          p.setMeasureResult(`Area: ${area.toFixed(2)} m\u00B2`)
        }
      }
      p.setMeasureMode('none')
    })

    p.mapInstance.current.addInteraction(draw)
    p.measureInteractionRef.current = draw
    p.setMeasureMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.drawMode, p.editMode, p.measureMode])

  // ── EXPORT ──
  const exportFeatures = useCallback(async (format: 'GeoJSON' | 'KML' | 'WKT' | 'DXF' | 'LandXML') => {
    if (!p.drawSourceRef.current || p.drawSourceRef.current.getFeatures().length === 0) return

    if (format === 'DXF') {
      if (!p.hasFeature('dxf_export')) return
      const features = p.drawSourceRef.current.getFeatures()
      const { transform } = await import('ol/proj')
      const points: SurveyPoint[] = []
      for (const f of features) {
        const geom = f.getGeometry()
        if (!geom) continue
        const geomType = geom.getType()
        if (geomType === 'Point') {
          const coord = geom.getCoordinates()
          try {
            const [e, n] = transform(coord, 'EPSG:3857', 'EPSG:21037')
            points.push({ name: f.get('name') || f.get('label') || `P${points.length + 1}`, easting: e, northing: n, is_control: false })
          } catch { /* skip */ }
        }
      }
      if (points.length === 0) {
        for (const f of features) {
          const geom = f.getGeometry()
          if (!geom) continue
          const geomType = geom.getType()
          let coords: number[][] = []
          if (geomType === 'LineString') coords = geom.getCoordinates()
          else if (geomType === 'Polygon') coords = geom.getCoordinates()[0] || []
          for (const coord of coords) {
            try {
              const [e, n] = transform(coord, 'EPSG:3857', 'EPSG:21037')
              points.push({ name: `V${points.length + 1}`, easting: e, northing: n, is_control: false })
            } catch { /* skip */ }
          }
        }
      }
      downloadDXF({ projectName: 'metardu-map-export', points })
      return
    }

    if (format === 'LandXML') {
      if (!p.hasFeature('landxml')) return
      const features = p.drawSourceRef.current.getFeatures()
      const { transform } = await import('ol/proj')
      const points: LandXMLPoint[] = []
      for (const f of features) {
        const geom = f.getGeometry()
        if (!geom) continue
        const geomType = geom.getType()
        if (geomType === 'Point') {
          const coord = geom.getCoordinates()
          try {
            const [e, n] = transform(coord, 'EPSG:3857', 'EPSG:21037')
            points.push({ name: f.get('name') || f.get('label') || `P${points.length + 1}`, easting: e, northing: n, is_control: false })
          } catch { /* skip */ }
        } else if (geomType === 'LineString' || geomType === 'Polygon') {
          const coords = geomType === 'Polygon' ? (geom.getCoordinates()[0] || []) : geom.getCoordinates()
          for (const coord of coords) {
            try {
              const [e, n] = transform(coord, 'EPSG:3857', 'EPSG:21037')
              points.push({ name: `V${points.length + 1}`, easting: e, northing: n, is_control: false })
            } catch { /* skip */ }
          }
        }
      }
      const project: LandXMLProject = { name: 'metardu-map-export', utm_zone: 37, hemisphere: 'S' }
      downloadLandXML(project, points)
      return
    }

    let output = ''
    let filename = ''
    let mimeType = ''

    if (format === 'GeoJSON') {
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      output = JSON.stringify(fmt.writeFeatures(p.drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      }), null, 2)
      filename = 'metardu-export.geojson'
      mimeType = 'application/geo+json'
    } else if (format === 'KML') {
      const { default: KMLFormat } = await import('ol/format/KML')
      const fmt = new KMLFormat()
      output = fmt.writeFeatures(p.drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      })
      filename = 'metardu-export.kml'
      mimeType = 'application/vnd.google-earth.kml+xml'
    } else {
      const { default: WKTFormat } = await import('ol/format/WKT')
      const fmt = new WKTFormat()
      const features = p.drawSourceRef.current.getFeatures()
      output = features.map((f: any) => fmt.writeGeometry(f.getGeometry(), {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857', rightHanded: true,
      })).join('\n')
      filename = 'metardu-export.wkt'
      mimeType = 'text/plain'
    }

    const blob = new Blob([output], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [p.hasFeature])

  // ── CLEAR DRAWN ──
  const clearDrawn = useCallback(() => {
    if (p.drawSourceRef.current) {
      p.drawSourceRef.current.clear()
      p.setFeatureCount(0)
    }
    if (p.measureSourceRef.current) p.measureSourceRef.current.clear()
    p.setSelectedFeature(null)
    if (p.popupRef.current && p.mapInstance.current) {
      p.mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
    }
    p.clearHistory()
  }, [])

  // ── GPS ──
  const toggleGPSInternal = useCallback(() => {
    if (!p.mapInstance.current) return
    const cleanup = (p.mapInstance.current as any)._cleanup
    if (!cleanup?.geolocation) return

    if (p.gpsTracking) {
      cleanup.geolocation.setTracking(false)
      p.setGpsTracking(false)
      p.setStakeoutActive(false)
    } else {
      cleanup.geolocation.setTracking(true)
      p.setGpsTracking(true)
      cleanup.geolocation.once('change:position', () => {
        const pos = cleanup.geolocation.getPosition()
        if (pos) p.mapInstance.current.getView().animate({ center: pos, zoom: 16, duration: 1000 })
      })
    }
  }, [p.gpsTracking])

  // ── STAKEOUT ──
  const toggleStakeout = useCallback(() => {
    if (!p.hasFeature('gps_stakeout')) return
    if (!p.stakeoutTarget) {
      if (!p.mapInstance.current) return
      const center = p.mapInstance.current.getView().getCenter()
      if (center) {
        import('ol/proj').then(({ transform }) => {
          const [e, n] = transform(center, 'EPSG:3857', 'EPSG:21037')
          p.setStakeoutTarget({ e, n })
          p.setStakeoutActive(true)
          if (!p.gpsTracking) p.toggleGPS()
        })
      }
    } else {
      p.setStakeoutTarget(null)
      p.setStakeoutActive(false)
    }
  }, [p.hasFeature, p.stakeoutTarget, p.gpsTracking, p.toggleGPS])

  // ── STAKEOUT INFO ──
  const stakeoutInfo = useCallback(() => {
    if (!p.stakeoutTarget || !p.gpsPos) return null
    const { transform } = require('ol/proj')
    let gpsE = 0, gpsN = 0
    try {
      const [e, n] = transform(
        [p.gpsPos.lon, p.gpsPos.lat],
        'EPSG:4326',
        'EPSG:21037'
      )
      gpsE = e; gpsN = n
    } catch { return null }
    const dE = p.stakeoutTarget.e - gpsE
    const dN = p.stakeoutTarget.n - gpsN
    const dist = Math.sqrt(dE * dE + dN * dN)
    let bearing = (Math.atan2(dE, dN) * 180) / Math.PI
    if (bearing < 0) bearing += 360
    return { distance: dist, bearing, dE, dN }
  }, [p.stakeoutTarget, p.gpsPos])

  // ── SAVE TO PROJECT ──
  const saveToProject = useCallback(async () => {
    if (!p.drawSourceRef.current) return
    const features = p.drawSourceRef.current.getFeatures()
    if (features.length === 0) return

    try {
      const { transform } = await import('ol/proj')
      const { createClient } = await import('@/lib/api-client/client')
      const dbClient = createClient()
      const { data: { session } } = await dbClient.auth.getSession()
      if (!session?.user) { p.setSaveMsg('Not authenticated'); setTimeout(() => p.setSaveMsg(''), 3000); return }

      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      const geojson = fmt.writeFeatures(features, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      })

      const { error } = await dbClient
        .from('projects')
        .insert({
          user_id: session.user.id,
          name: `Map Drawing \u2014 ${new Date().toLocaleDateString()}`,
          survey_type: 'topographic',
          location: 'Drawn on map',
          utm_zone: 37,
          hemisphere: 'S',
          boundary_data: {
            source: 'map-drawing',
            drawnFeatures: JSON.parse(geojson),
            createdFrom: 'map-client',
          },
        })

      if (error) {
        p.setSaveMsg(`Error: ${error.message}`)
      } else {
        p.setSaveMsg(`Saved ${features.length} feature(s) to new project`)
      }
      setTimeout(() => p.setSaveMsg(''), 4000)
    } catch (err: any) {
      p.setSaveMsg(`Error: ${err?.message || 'Save failed'}`)
      setTimeout(() => p.setSaveMsg(''), 4000)
    }
  }, [])

  // ── ANNOTATIONS ──
  const toggleAnnotations = useCallback(async () => {
    if (!p.mapInstance.current) return

    if (p.annotationLayerRef.current) {
      p.mapInstance.current.removeLayer(p.annotationLayerRef.current)
      p.annotationLayerRef.current = null
    }

    if (p.showAnnotations) {
      p.setShowAnnotations(false)
      return
    }

    if (!p.drawSourceRef.current) return
    const features = p.drawSourceRef.current.getFeatures()
    if (features.length === 0) { p.setShowAnnotations(false); return }

    const allCoords: Array<{ coords: Array<[number, number]>; type: string }> = []
    for (const f of features) {
      const geom = f.getGeometry()
      if (!geom) continue
      const type = geom.getType()
      if (type === 'LineString') {
        allCoords.push({ coords: geom.getCoordinates(), type: 'LineString' })
      } else if (type === 'Polygon') {
        allCoords.push({ coords: geom.getCoordinates()[0] || [], type: 'Polygon' })
      }
    }

    if (allCoords.length === 0) { p.setShowAnnotations(false); return }

    try {
      const { createDrawAnnotationLayer } = await import('@/app/map/utils/drawAnnotations')
      const layer = await createDrawAnnotationLayer({
        coords3857: allCoords[0].coords,
        geomType: allCoords[0].type as 'LineString' | 'Polygon',
      })
      p.mapInstance.current.addLayer(layer)
      p.annotationLayerRef.current = layer
      p.setShowAnnotations(true)
    } catch (err) {
      console.warn('Failed to create annotations:', err)
      p.setShowAnnotations(false)
    }
  }, [p.showAnnotations])

  // ── NAVIGATION ──
  const fitToKenya = useCallback(async () => {
    if (!p.mapInstance.current) return
    try {
      const { fromLonLat, toLonLat } = await import('ol/proj')
      const extent = [
        ...fromLonLat([33.9, -4.7]),
        ...fromLonLat([41.9, 5.5]),
      ]
      p.mapInstance.current.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 600 })

      setTimeout(() => {
        try {
          const view = p.mapInstance.current?.getView()
          if (!view) return
          const center = view.getCenter()
          if (!center) return
          const lonLat = toLonLat(center)
          const lon = lonLat[0]
          const lat = lonLat[1]
          if (lon < 30 || lon > 45 || lat < -10 || lat > 10) {
            console.warn('[fitToKenya] View center out of Kenya bounds, falling back')
            view.setCenter(fromLonLat([37.0, -1.0]))
            view.setZoom(7)
          }
        } catch { /* ignore */ }
      }, 700)
    } catch (err) {
      console.error('[fitToKenya] Extent transform failed, falling back:', err)
      try {
        const { fromLonLat } = await import('ol/proj')
        p.mapInstance.current.getView().setCenter(fromLonLat([37.0, -1.0]))
        p.mapInstance.current.getView().setZoom(7)
      } catch { /* absolute fallback */ }
    }
  }, [])

  const fitToDrawn = useCallback(() => {
    if (!p.mapInstance.current || !p.drawSourceRef.current) return
    const extent = p.drawSourceRef.current.getExtent()
    if (extent[0] !== Infinity) {
      p.mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400 })
    }
  }, [])

  const resetToKenya = useCallback(() => {
    if (!p.mapInstance.current) return
    const KENYA_EXTENT = p.mapInstance.current.getView().getExtent()
    p.mapInstance.current.getView().fit(KENYA_EXTENT, { duration: 400, padding: [0, 0, 0, 0] })
  }, [])

  const getMapExtent = useCallback(() => {
    if (!p.mapInstance.current) return null
    try {
      const view = p.mapInstance.current.getView()
      const size = p.mapInstance.current.getSize()
      if (!size) return null
      const extent = view.calculateExtent(size)
      const { transform } = require('ol/proj')
      const [minLon, minLat] = transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326')
      const [maxLon, maxLat] = transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326')
      return { minLat, minLon, maxLat, maxLon }
    } catch { return null }
  }, [])

  const handleCoordSearchLocal = useCallback(async (searchInput: string) => {
    const { handleCoordSearch } = await import('@/app/map/utils/coordSearch')
    await handleCoordSearch(searchInput, p.mapInstance)
  }, [])

  const updateFeatureName = useCallback((name: string, selectedFeature: any) => {
    if (selectedFeature) {
      selectedFeature.set('name', name)
      selectedFeature.set('label', name)
    }
  }, [])

  const handleOpacityChange = useCallback((val: number, setLayerOpacity: (v: number) => void) => {
    setLayerOpacity(val)
    if (p.drawLayerRef.current) {
      p.drawLayerRef.current.setOpacity(val / 100)
    }
  }, [])

  return {
    toggleDraw,
    toggleEdit,
    deleteSelected,
    toggleMeasure,
    exportFeatures,
    clearDrawn,
    toggleGPS: toggleGPSInternal,
    toggleStakeout,
    stakeoutInfo,
    saveToProject,
    toggleAnnotations,
    fitToKenya,
    fitToDrawn,
    resetToKenya,
    getMapExtent,
    handleCoordSearchLocal,
    updateFeatureName,
    handleOpacityChange,
  }
}
