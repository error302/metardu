'use client'
/**
 * useMapInteractions — Map interaction hooks (draw, measure, edit, export, GPS, stakeout)
 *
 * All interaction logic extracted from MapClient for maintainability.
 * Uses useCallback for stable references to prevent unnecessary re-renders.
 *
 * Stakeout mode: Full GPS-guided point navigation with overlay, audio alerts,
 * bearing/distance computation, and proximity color-coding.
 */

import { useCallback, useRef, useEffect } from 'react'
import type { DrawMode, MeasureMode } from '@/app/map/mapTypes'
import type { MapExtent } from '@/app/map/MapReactContext'
import type Map from 'ol/Map'
import type VectorSource from 'ol/source/Vector'
import type VectorLayer from 'ol/layer/Vector'
import type { Interaction as RealInteraction } from 'ol/interaction'
import type Select from 'ol/interaction/Select'
import type Feature from 'ol/Feature'
import type Point from 'ol/geom/Point'
import type Polygon from 'ol/geom/Polygon'
import type LineString from 'ol/geom/LineString'
import type { MapBrowserEvent } from 'ol'
import type { DrawEvent } from 'ol/interaction/Draw'
import type { ModifyEvent } from 'ol/interaction/Modify'
import type { FeatureLike } from 'ol/Feature'
import { downloadDXF } from '@/lib/export/generateDXF'
import { mapGeometryToDxfEntities, type MapDxfGeometryLike } from '@/lib/export/mapGeometryToDxf'
import { downloadLandXML, type LandXMLProject, type LandXMLPoint } from '@/lib/export/generateLandXML'
import { describeCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { reportCrs } from '@/lib/generators/reportCrs'
import type { ProjectReferenceSystemRecord } from '@/lib/spatial/projectReferenceSystem'
import {
  endpointsBearingInCrs,
  polygonAreaInCrs,
  polygonPerimeterInCrs,
  polylineLengthInCrs,
} from '@/lib/surveyMapEngine/core/measure'
import { applyOverlayOpacity, isStandardBasemapId } from '@/lib/surveyMapEngine/ol/layers'
import {
  createStakeoutOverlay,
  updateStakeoutDirection,
  updateTargetProximityStyle,
  createStakeoutAudioAlert,
  stopStakeoutAudio,
  computeStakeoutState,
  type StakeoutTarget,
  type StakeoutState,
  type StakeoutPosition,
} from '@/lib/surveyMapEngine/ol/stakeout'
import { logger } from '@/lib/logger'
import { zoomToSurveyPointCluster } from '@/lib/surveyMapEngine/ol/pointLoading'

interface UseMapInteractionsParams {
  mapInstance: React.MutableRefObject<Map | null>
  drawSourceRef: React.MutableRefObject<VectorSource | null>
  drawLayerRef: React.MutableRefObject<VectorLayer | null>
  drawInteractionRef: React.MutableRefObject<RealInteraction | null>
  selectInteractionRef: React.MutableRefObject<Select | null>
  modifyInteractionRef: React.MutableRefObject<RealInteraction | null>
  measureInteractionRef: React.MutableRefObject<RealInteraction | null>
  measureSourceRef: React.MutableRefObject<VectorSource | null>
  measureLayerRef: React.MutableRefObject<VectorLayer | null>
  annotationLayerRef: React.MutableRefObject<VectorLayer | null>
  cleanupRef: React.MutableRefObject<import('@/lib/map/olTypes').MapCleanupRefs | null>
  drawMode: DrawMode
  editMode: boolean
  measureMode: MeasureMode
  showAnnotations: boolean
  gpsTracking: boolean
  stakeoutActive: boolean
  stakeoutTarget: { e: number; n: number } | null
  gpsPos: { lon: number; lat: number; accuracy: number } | null
  /** GPS position already transformed to the declared project CRS. */
  gpsPosInSurveyCrs: { easting: number; northing: number; accuracy: number } | null
  hasFeature: (feature: string) => boolean
  setDrawMode: (m: DrawMode) => void
  setEditMode: (m: boolean) => void
  setMeasureMode: (m: MeasureMode) => void
  setMeasureResult: (s: string) => void
  setFeatureCount: (n: number) => void
  setSelectedFeature: (f: Feature | null) => void
  setFeatureName: (s: string) => void
  setGpsTracking: (v: boolean) => void
  setGpsPos: (v: { lon: number; lat: number; accuracy: number } | null) => void
  setStakeoutTarget: (v: { e: number; n: number } | null) => void
  setStakeoutActive: (v: boolean) => void
  setStakeoutState: (v: StakeoutState | null) => void
  setShowAnnotations: (v: boolean) => void
  setSaveMsg: (s: string) => void
  /** Current project ID from URL params (null = no project linked) */
  projectId: string | null
  /** Saved project CRS, or an explicitly selected grid on an unlinked map. */
  currentSurveyCrs: string | null
  /** Called when a feature is drawn — used to compute live area/perimeter */
  onDrawEnd?: (areaSqM: number, perimeterM: number, featureType: string) => void
  /** Called when a feature is identified by single-click */
  onIdentify?: (feature: Feature | null) => void
  pushHistory: () => void
  clearHistory: () => void
  popupRef: React.MutableRefObject<HTMLDivElement | null>
  toggleGPS: () => void
}

export function useMapInteractions(p: UseMapInteractionsParams) {
  // The caller supplies the working projection explicitly. Project LandXML
  // export resolves the authoritative declaration separately below.
  const epsg = p.currentSurveyCrs

  // ── SINGLE-CLICK IDENTIFY: click any feature → show its attributes ──
  useEffect(() => {
    if (!p.mapInstance.current) return
    const map = p.mapInstance.current

    const handleClick = (evt: MapBrowserEvent) => {
      const onIdentify = p.onIdentify
      // Don't interfere when drawing or measuring
      if (p.drawMode !== 'none' || p.measureMode !== 'none') return

      const features: FeatureLike[] = []
      map.forEachFeatureAtPixel(evt.pixel, (f: FeatureLike) => {
        features.push(f)
        return false // collect all
      }, {
        hitTolerance: 5,
      })

      if (features.length > 0) {
        const feature = features[0] as Feature
        if (onIdentify) onIdentify(feature)

        const isSurveyCluster = feature.get('pointType') === 'survey-cluster'
        if (isSurveyCluster) {
          // The cluster geometry is a display centroid only. Zoom to the
          // represented cell to request finer groups; never use it as a
          // measured or set-out coordinate.
          zoomToSurveyPointCluster(map, feature.get('clusterExtent'))
        }

        // Show popup with basic info
        if (p.popupRef.current) {
          const el = p.popupRef.current
          const name = (feature.get('pointName') as string | undefined) || (feature.get('parcelNumber') as string | undefined) || (feature.get('name') as string | undefined) || (feature.get('projectName') as string | undefined) || ''
          const code = (feature.get('code') as string | undefined) || ''
          const elev = feature.get('elevation') as number | undefined
          const isControl = feature.get('isControl') as boolean | undefined
          const type = (feature.get('pointType') as string | undefined) || (feature.get('featureType') as string | undefined) || ''

          el.replaceChildren()
          const build = (tag: string, text: string, css: string) => {
            const node = document.createElement(tag)
            node.textContent = text
            node.style.cssText = css
            el.append(node)
          }
          let hasContent = false
          if (name) { build('div', name, 'font-weight:600;color:#E8E4DE;font-size:13px;margin-bottom:4px'); hasContent = true }
          if (isSurveyCluster) {
            build('div', 'Scale summary only · centroid is not a survey coordinate', 'color:#E8E4DE;font-size:10px;margin-bottom:4px')
            hasContent = true
          }
          if (code) { build('div', `Code: ${code}`, 'color:#A89E92;font-size:11px;font-family:monospace'); hasContent = true }
          if (elev != null) { build('div', `Elevation: ${elev.toFixed(3)} m`, 'color:#A89E92;font-size:11px;font-family:monospace'); hasContent = true }
          if (isControl) { build('div', 'Control point', 'color:#D17B47;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.04em'); hasContent = true }
          if (type) { build('div', type, 'color:#787774;font-size:10px;font-family:monospace;text-transform:uppercase'); hasContent = true }
          if (!hasContent) build('div', 'Feature (no attributes)', 'color:#787774;font-size:11px')
          el.className = 'ol-popup'
          el.style.cssText = `
            background: #1F1C19; border: 1px solid #332E29; border-radius: 6px;
            padding: 10px 14px; font-family: 'Geist', sans-serif; font-size: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); min-width: 120px; max-width: 240px;
            color: #E8E4DE; cursor: pointer;
          `
          el.onclick = () => { el.className = 'hidden'; el.onclick = null }
        }
      } else {
        // Clicked empty space — clear selection
        if (onIdentify) onIdentify(null)
        if (p.popupRef.current) p.popupRef.current.className = 'hidden'
      }
    }

    map.on('singleclick', handleClick)
    return () => map.un('singleclick', handleClick)
  }, [p.drawMode, p.measureMode, p.onIdentify, p.popupRef, p.mapInstance])

  // ── Stakeout overlay refs (persist across renders) ──
  const stakeoutOverlayRef = useRef<import('ol/Overlay').default | null>(null)
  const stakeoutTargetSourceRef = useRef<VectorSource | null>(null)
  const stakeoutTargetLayerRef = useRef<VectorLayer | null>(null)
  const stakeoutDirectionSourceRef = useRef<VectorSource | null>(null)
  const stakeoutDirectionLayerRef = useRef<VectorLayer | null>(null)
  const stakeoutCleanupDone = useRef(false)

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

    const surveyCrs = epsg
    if (!surveyCrs) {
      p.setSaveMsg('Set the project CRS before drawing survey geometry or calculating measurements.')
      return
    }

    const source = p.drawSourceRef.current
    if (!source) return

    const geomType = mode as 'Point' | 'LineString' | 'Polygon' | 'Circle'
    const draw = new Draw({
      source,
      type: geomType,
      style: new Style({
        fill: new Fill({ color: 'rgba(209, 123, 71,0.3)' }),
        stroke: new Stroke({ color: '#D17B47', width: 2, lineDash: [8, 4] }),
        image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#D17B47' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      }),
    })

    draw.on('drawend', (e: DrawEvent) => {
      // Compute live area/perimeter for the drawn feature — measured in the
      // project CRS (survey plane maths), never in Web Mercator display units.
      if (p.onDrawEnd && e.feature) {
        const geom = e.feature.getGeometry()
        if (geom) {
          const type = geom.getType()
          try {
            if (type === 'Polygon' || type === 'MultiPolygon') {
              const rings = (type === 'Polygon'
                ? (geom as Polygon).getCoordinates()
                : (geom as Polygon).getCoordinates()[0]) as number[][][]
              const outer = rings[0] || []
              p.onDrawEnd(polygonAreaInCrs(outer, surveyCrs), polygonPerimeterInCrs(outer, surveyCrs), 'Polygon')
            } else if (type === 'LineString') {
              p.onDrawEnd(0, polylineLengthInCrs((geom as LineString).getCoordinates(), surveyCrs), 'LineString')
            } else if (type === 'Point') {
              p.onDrawEnd(0, 0, 'Point')
            }
          } catch (err) {
            // Never turn an unavailable survey-plane measurement into a plausible zero.
            logger.warn('[drawend] Survey measurement unavailable', { error: err })
            p.setSaveMsg('Survey measurement unavailable. Confirm the project uses a supported projected CRS.')
          }
        }
      }
      setTimeout(() => p.selectInteractionRef.current?.getFeatures()?.clear(), 100)
      setTimeout(p.pushHistory, 150)
    })

    p.mapInstance.current.addInteraction(draw)
    p.drawInteractionRef.current = draw
    p.setDrawMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.drawMode, p.editMode, p.measureMode, p.pushHistory, epsg, p.setSaveMsg])

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

    if (!epsg) {
      p.setSaveMsg('Set the project CRS before editing survey geometry.')
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
    modify.on('modifyend', async (e: ModifyEvent) => {
      setTimeout(p.pushHistory, 100)

      // ── Vertex editing persistence: save modified geometry to project ──
      if (p.projectId && e.features) {
        try {
          const features = e.features.getArray()
          for (const feature of features) {
            const geom = feature.getGeometry()
            if (!geom) continue

            const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
            const fmt = new GeoJSONFormat()

            // Convert modified feature to GeoJSON
            const geojson = fmt.writeFeatureObject(feature, {
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326',
            })

            // Update the project's boundary_data with the modified feature
            const { createClient } = await import('@/lib/api-client/client')
            const dbClient = createClient()
            const projRow = (await dbClient
              .from('projects')
              .select('boundary_data')
              .eq('id', p.projectId)
              .single()) as { data: { boundary_data?: { drawnFeatures?: { features?: unknown[] } } } | null }
            const bd = projRow.data?.boundary_data || {}
            const drawnFeatures: import('ol/format/GeoJSON').GeoJSONFeature[] = (bd.drawnFeatures?.features as import('ol/format/GeoJSON').GeoJSONFeature[] | undefined) || []

            // Find and replace the modified feature (by id if available)
            const featureId = feature.getId?.() || (feature.get('ol_uid') as string | number | undefined) || String(Date.now())
            const idx = drawnFeatures.findIndex((f) =>
              f.id === featureId || f.properties?.ol_uid === featureId
            )

            if (idx >= 0) {
              drawnFeatures[idx] = geojson
            } else {
              drawnFeatures.push(geojson)
            }

            await dbClient
              .from('projects')
              .update({
                boundary_data: {
                  ...bd,
                  drawnFeatures: { type: 'FeatureCollection', features: drawnFeatures },
                  lastModifiedAt: new Date().toISOString(),
                },
              })
              .eq('id', p.projectId)

            if (p.setSaveMsg) {
              const setSaveMsg = p.setSaveMsg
              setSaveMsg(`Vertex edited — saved to project`)
              setTimeout(() => setSaveMsg?.(''), 3000)
            }
          }
        } catch (err) {
          logger.error('[VertexEdit] Failed to persist:', { error: err })
        }
      }
    })
    p.mapInstance.current.addInteraction(modify)
    p.modifyInteractionRef.current = modify
    p.setEditMode(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editMode, p.measureMode, p.pushHistory, epsg, p.setSaveMsg])

  // ── DELETE SELECTED ──
  const deleteSelected = useCallback(() => {
    if (!p.selectInteractionRef.current || !p.drawSourceRef.current) return
    const drawSource = p.drawSourceRef.current
    const features = p.selectInteractionRef.current.getFeatures().getArray()
    features.forEach((f: Feature) => drawSource.removeFeature(f))
    p.selectInteractionRef.current.getFeatures().clear()
    const setSelectedFeature = p.setSelectedFeature
    const pushHistory = p.pushHistory
    setSelectedFeature(null)
    pushHistory()
  }, [p.pushHistory, p.selectInteractionRef, p.drawSourceRef, p.setSelectedFeature])

  // ── MEASURE ──
  const toggleMeasure = useCallback(async (mode: MeasureMode) => {
    if (!p.mapInstance.current) return
    const surveyCrs = epsg
    if (mode !== 'none' && mode !== p.measureMode && !surveyCrs) {
      p.setSaveMsg('Set the project CRS before calculating survey distances or areas.')
      return
    }
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

    if (!surveyCrs) return

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

    draw.on('drawend', (evt: DrawEvent) => {
      const geom = evt.feature.getGeometry()
      if (!geom) return
      try {
        if (mode === 'distance') {
          // Survey plane maths in the project CRS — Web Mercator lengths are
          // inflated by 1/cos(latitude) and must never be shown to a surveyor.
          const coords = (geom as LineString).getCoordinates()
          const length = polylineLengthInCrs(coords, surveyCrs)
          const bearing = endpointsBearingInCrs(coords, surveyCrs)
          const bearingStr = bearing != null ? ` | Brg: ${bearing.toFixed(2)}\u00B0` : ''
          if (length > 1000) {
            p.setMeasureResult(`Distance: ${(length / 1000).toFixed(3)} km${bearingStr}`)
          } else {
            p.setMeasureResult(`Distance: ${length.toFixed(2)} m${bearingStr}`)
          }
        } else {
          const area = polygonAreaInCrs((geom as Polygon).getCoordinates()[0], surveyCrs)
          if (area > 1000000) {
            p.setMeasureResult(`Area: ${(area / 1000000).toFixed(4)} km\u00B2`)
          } else {
            p.setMeasureResult(`Area: ${area.toFixed(2)} m\u00B2`)
          }
        }
      } catch (err) {
        p.setMeasureResult(`Measurement unavailable: ${err instanceof Error ? err.message : 'set the project CRS'}`)
      }
      p.setMeasureMode('none')
    })

    p.mapInstance.current.addInteraction(draw)
    p.measureInteractionRef.current = draw
    p.setMeasureMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.drawMode, p.editMode, p.measureMode, epsg, p.setSaveMsg])

  // ── EXPORT ──
  const { hasFeature, drawSourceRef, projectId, setSaveMsg } = p
  const exportFeatures = useCallback(async (format: 'GeoJSON' | 'KML' | 'WKT' | 'DXF' | 'LandXML') => {
    if (!drawSourceRef.current || drawSourceRef.current.getFeatures().length === 0) return

    if (format === 'DXF') {
      if (!hasFeature('dxf_export')) return
      if (!projectId) {
        setSaveMsg('Link this map to a project and declare its CRS before exporting a survey DXF.')
        return
      }

      let declaration: ProjectReferenceSystemRecord | null = null
      try {
        const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/reference-system`)
        if (!response.ok) throw new Error(`Project CRS request failed (${response.status})`)
        const data: unknown = await response.json()
        declaration = (data as { referenceSystem?: ProjectReferenceSystemRecord | null } | null)?.referenceSystem ?? null
      } catch (error) {
        setSaveMsg(error instanceof Error ? error.message : 'Project CRS could not be loaded.')
        return
      }
      const declared = declaration?.prs
      const crs = reportCrs({
        utmZone: declared?.zone,
        hemisphere: declared?.hemisphere,
        datum: declared?.datum,
      })
      if (!declared || !crs.verified || crs.epsgCode !== declared.horizontalCrs || !describeCrs(crs.epsgCode)) {
        setSaveMsg('Declare a supported project CRS in Project Settings before exporting a survey DXF.')
        return
      }

      const features = drawSourceRef.current.getFeatures()
      const { transform } = await import('ol/proj')
      const coordinateWarnings = new Set<string>()
      let mapEntities
      try {
        mapEntities = mapGeometryToDxfEntities(features.map((feature) => ({
          geometry: feature.getGeometry() as MapDxfGeometryLike | null,
          label: (feature.get('name') as string | undefined) || (feature.get('label') as string | undefined),
          dxfLayer: feature.get('dxfLayer') as string | undefined,
          dxfClosed: feature.get('dxfClosed') as boolean | undefined,
          dxfEntityType: feature.get('dxfEntityType') as string | undefined,
        })), (coordinate) => {
          const [easting, northing] = transform(coordinate, 'EPSG:3857', crs.epsgCode) as [number, number]
          const validation = validateCoordinateRange(easting, northing, crs.epsgCode)
          if (!validation.valid) throw new Error(validation.errors.join('; '))
          validation.warnings.forEach((warning) => coordinateWarnings.add(warning))
          return [easting, northing]
        })
      } catch (error) {
        setSaveMsg(error instanceof Error ? error.message : 'Map geometry could not be exported as DXF.')
        return
      }
      if (mapEntities.length === 0) {
        setSaveMsg('No supported map geometry is available for DXF export.')
        return
      }
      downloadDXF({ projectName: `metardu-${projectId}-map`, points: [], mapEntities })
      const rangeNote = coordinateWarnings.size ? ` Check the project extent: ${[...coordinateWarnings].join(' ')}` : ''
      setSaveMsg(`DXF exported in ${crs.crsName} (${crs.epsg}). DXF does not retain CRS metadata; keep the CRS with the file.${rangeNote}`)
      return
    }

    if (format === 'LandXML') {
      if (!hasFeature('landxml')) return
      if (!projectId) {
        setSaveMsg('Link a project and declare its CRS before exporting LandXML.')
        return
      }

      // The map's working UTM code may be a central-Kenya fallback. Fetch the
      // authoritative project declaration before transforming or labeling data.
      let declaration: ProjectReferenceSystemRecord | null = null
      try {
        const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/reference-system`)
        if (!response.ok) throw new Error(`Project CRS request failed (${response.status})`)
        const data: unknown = await response.json()
        declaration = (data as { referenceSystem?: ProjectReferenceSystemRecord | null } | null)?.referenceSystem ?? null
      } catch (error) {
        setSaveMsg(error instanceof Error ? error.message : 'Project CRS could not be loaded.')
        return
      }
      const declared = declaration?.prs
      const crs = reportCrs({
        utmZone: declared?.zone,
        hemisphere: declared?.hemisphere,
        datum: declared?.datum,
      })
      if (!declared || !crs.verified || crs.epsgCode !== declared.horizontalCrs ||
          !describeCrs(crs.epsgCode)) {
        setSaveMsg('Declare a supported project CRS in Project Settings before exporting LandXML.')
        return
      }

      const features = drawSourceRef.current.getFeatures()
      const { transform } = await import('ol/proj')
      const points: LandXMLPoint[] = []
      for (const f of features) {
        const geom = f.getGeometry()
        if (!geom) continue
        const geomType = geom.getType()
        if (geomType === 'Point') {
          const coord = (geom as Point).getCoordinates()
          try {
            const [e, n] = transform(coord, 'EPSG:3857', crs.epsgCode) as [number, number]
            points.push({ name: (f.get('name') as string | undefined) || (f.get('label') as string | undefined) || `P${points.length + 1}`, easting: e, northing: n, is_control: false })
          } catch { /* skip */ }
        } else if (geomType === 'LineString' || geomType === 'Polygon') {
          const coords = geomType === 'Polygon' ? ((geom as Polygon).getCoordinates()[0] || []) : (geom as LineString).getCoordinates()
          for (const coord of coords) {
            try {
              const [e, n] = transform(coord, 'EPSG:3857', crs.epsgCode)
              points.push({ name: `V${points.length + 1}`, easting: e, northing: n, is_control: false })
            } catch { /* skip */ }
          }
        }
      }
      if (points.length === 0) {
        setSaveMsg('No project geometry points are available for LandXML export.')
        return
      }
      const project: LandXMLProject = {
        name: 'metardu-map-export',
        utm_zone: crs.zone,
        hemisphere: crs.hemi,
        datum: crs.datum,
        vertical_datum: declared.verticalDatum,
        vertical_reference: declared.verticalReference,
        geoid_model: declaration?.geoidModel,
        benchmark_basis: declaration?.benchmarkBasis,
      }
      try {
        downloadLandXML(project, points)
      } catch (error) {
        setSaveMsg(error instanceof Error ? error.message : 'LandXML export failed.')
      }
      return
    }

    let output = ''
    let filename = ''
    let mimeType = ''

    if (format === 'GeoJSON') {
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      output = fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      })
      filename = 'metardu-export.geojson'
      mimeType = 'application/geo+json'
    } else if (format === 'KML') {
      const { default: KMLFormat } = await import('ol/format/KML')
      const fmt = new KMLFormat()
      output = fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      })
      filename = 'metardu-export.kml'
      mimeType = 'application/vnd.google-earth.kml+xml'
    } else {
      const { default: WKTFormat } = await import('ol/format/WKT')
      const fmt = new WKTFormat()
      const features = drawSourceRef.current.getFeatures()
      output = features.map((f: Feature) => fmt.writeGeometry(f.getGeometry() as import('ol/geom/Geometry').default, {
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
  }, [hasFeature, drawSourceRef, projectId, setSaveMsg])

  // ── CLEAR DRAWN ──
  const clearDrawn = useCallback(() => {
    const setFeatureCount = p.setFeatureCount
    const setSelectedFeature = p.setSelectedFeature
    const clearHistory = p.clearHistory
    if (p.drawSourceRef.current) {
      p.drawSourceRef.current.clear()
      setFeatureCount(0)
    }
    if (p.measureSourceRef.current) p.measureSourceRef.current.clear()
    setSelectedFeature(null)
    if (p.popupRef.current && p.mapInstance.current) {
      p.mapInstance.current.getOverlays().forEach((o) => o.setPosition(undefined))
    }
    clearHistory()
  }, [p.drawSourceRef, p.setFeatureCount, p.measureSourceRef, p.setSelectedFeature, p.popupRef, p.mapInstance, p.clearHistory])

  // ── GPS ──
  const toggleGPSInternal = useCallback(() => {
    const setGpsTracking = p.setGpsTracking
    const setStakeoutActive = p.setStakeoutActive
    if (!p.mapInstance.current) return
    if (!p.cleanupRef.current?.geolocation) return

    if (p.gpsTracking) {
      p.cleanupRef.current.geolocation.setTracking(false)
      setGpsTracking(false)
      setStakeoutActive(false)
    } else {
      p.cleanupRef.current.geolocation.setTracking(true)
      setGpsTracking(true)
      const mapInstance = p.mapInstance.current
      p.cleanupRef.current.geolocation.once('change:position', () => {
        const pos = p.cleanupRef.current?.geolocation?.getPosition()
        if (pos && mapInstance) mapInstance.getView().animate({ center: pos, zoom: 16, duration: 1000 })
      })
    }
  }, [p.gpsTracking, p.mapInstance, p.cleanupRef, p.setGpsTracking, p.setStakeoutActive])

  // ── STAKEOUT: Activate with full overlay ──
  const activateStakeout = useCallback(async (target: StakeoutTarget) => {
    const hasFeature = p.hasFeature
    if (!hasFeature('gps_stakeout')) return
    if (!p.mapInstance.current) return
    if (!epsg) {
      p.setSaveMsg('Declare the project CRS before starting stakeout.')
      return
    }

    // Deactivate any existing stakeout first
    await deactivateStakeout()

    try {
      const { overlay, targetSource, targetLayer, directionSource, directionLayer } =
        await createStakeoutOverlay(target, epsg)

      // Store refs
      stakeoutOverlayRef.current = overlay
      stakeoutTargetSourceRef.current = targetSource
      stakeoutTargetLayerRef.current = targetLayer
      stakeoutDirectionSourceRef.current = directionSource
      stakeoutDirectionLayerRef.current = directionLayer

      // Add overlay and layers to the map
      p.mapInstance.current.addOverlay(overlay)
      p.mapInstance.current.addLayer(targetLayer)
      p.mapInstance.current.addLayer(directionLayer)

      // Set the target state
      p.setStakeoutTarget({ e: target.easting, n: target.northing })
      p.setStakeoutActive(true)

      // Initialize stakeoutState immediately so the panel shows live data
      // without waiting for the first GPS position update.
      // If we have a GPS position, compute initial distance/bearing.
      // Without a fix, leave measurements unknown.
      if (p.gpsPos) {
        const { transform } = await import('ol/proj')
        const [gpsE, gpsN] = transform(
          [p.gpsPos.lon, p.gpsPos.lat],
          'EPSG:4326',
          epsg
        ) as [number, number]
        const initialPos: StakeoutPosition = {
          easting: gpsE,
          northing: gpsN,
          accuracy: p.gpsPos.accuracy,
        }
        const targetPt: StakeoutTarget = {
          easting: target.easting,
          northing: target.northing,
        }
        const initialState = computeStakeoutState(initialPos, targetPt)
        p.setStakeoutState(initialState)
      } else {
        p.setStakeoutState(null)
      }

      stakeoutCleanupDone.current = false

      // Enable GPS if not already tracking
      if (!p.gpsTracking) p.toggleGPS()

      // Zoom to target
      const { transform } = await import('ol/proj')
      const targetCoord = transform([target.easting, target.northing], epsg, 'EPSG:3857')
      p.mapInstance.current.getView().animate({ center: targetCoord, zoom: 18, duration: 800 })
    } catch (err) {
      logger.error('[activateStakeout] Failed:', { error: err })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.hasFeature, p.gpsTracking, p.toggleGPS, p.gpsPos, p.setSaveMsg, epsg])

  // ── STAKEOUT: Deactivate and clean up ──
  const deactivateStakeout = useCallback(async () => {
    if (stakeoutCleanupDone.current) return
    stakeoutCleanupDone.current = true

    stopStakeoutAudio()

    if (p.mapInstance.current) {
      // Remove overlay
      if (stakeoutOverlayRef.current) {
        try {
          p.mapInstance.current.removeOverlay(stakeoutOverlayRef.current)
        } catch { /* already removed */ }
        stakeoutOverlayRef.current = null
      }

      // Remove target layer
      if (stakeoutTargetLayerRef.current) {
        try {
          stakeoutTargetSourceRef.current?.clear()
          p.mapInstance.current.removeLayer(stakeoutTargetLayerRef.current)
        } catch { /* already removed */ }
        stakeoutTargetLayerRef.current = null
        stakeoutTargetSourceRef.current = null
      }

      // Remove direction layer
      if (stakeoutDirectionLayerRef.current) {
        try {
          stakeoutDirectionSourceRef.current?.clear()
          p.mapInstance.current.removeLayer(stakeoutDirectionLayerRef.current)
        } catch { /* already removed */ }
        stakeoutDirectionLayerRef.current = null
        stakeoutDirectionSourceRef.current = null
      }
    }

    const setStakeoutTarget = p.setStakeoutTarget
    const setStakeoutActive = p.setStakeoutActive
    const setStakeoutState = p.setStakeoutState
    setStakeoutTarget(null)
    setStakeoutActive(false)
    setStakeoutState(null)
  }, [p.mapInstance, p.setStakeoutTarget, p.setStakeoutActive, p.setStakeoutState])

  // ── STAKEOUT: Update on GPS position change ──
  const updateStakeoutOnGPS = useCallback(async () => {
    if (!epsg || !p.stakeoutActive || !p.stakeoutTarget || !p.gpsPos) return
    if (!stakeoutDirectionSourceRef.current) return

    try {
      const { transform } = await import('ol/proj')
      const [gpsE, gpsN] = transform(
        [p.gpsPos.lon, p.gpsPos.lat],
        'EPSG:4326',
        epsg
      ) as [number, number]

      const currentPos: StakeoutPosition = {
        easting: gpsE,
        northing: gpsN,
        accuracy: p.gpsPos.accuracy,
      }

      const target: StakeoutTarget = {
        easting: p.stakeoutTarget.e,
        northing: p.stakeoutTarget.n,
      }

      // Update direction line on the map
      const state = await updateStakeoutDirection(
        stakeoutDirectionSourceRef.current,
        currentPos,
        target,
        epsg,
      )

      // Update target marker proximity color
      if (stakeoutTargetSourceRef.current) {
        await updateTargetProximityStyle(
          stakeoutTargetSourceRef.current,
          state.proximityColor
        )
      }

      // Update state for the panel
      const setStakeoutState = p.setStakeoutState
      setStakeoutState(state)

      // Trigger audio alert
      createStakeoutAudioAlert(state.distance)
    } catch { /* skip update */ }
  }, [p.stakeoutActive, p.stakeoutTarget, p.gpsPos, p.setStakeoutState, epsg])

  // ── STAKEOUT: Legacy toggle (for backward compat) ──
  const toggleStakeout = useCallback(() => {
    // LINT FIX (2026-08-30): destructure once so exhaustive-deps can track
    // individual fields (listing `p.x` in deps while also reading `p.y`
    // chains like p.mapInstance.current made the rule demand the whole `p`).
    const { hasFeature, setSaveMsg } = p
    // FIX (2026-08-30): previously returned silently when the plan gate
    // failed — the button appeared dead. Surface a visible message instead.
    if (!hasFeature('gps_stakeout')) {
      if (setSaveMsg) {
        setSaveMsg('GPS Stakeout requires a Pro plan — upgrade in Pricing to enable it')
        setTimeout(() => setSaveMsg(''), 4000)
      }
      return
    }
    // FIX (2026-08-30): starting stakeout now auto-enables GPS tracking so
    // the HUD/direction line actually receives position updates. Previously
    // the panel sat on "Waiting for GPS position..." if GPS wasn't on.
    if (!p.gpsTracking) {
      p.toggleGPS()
    }
    if (!p.stakeoutTarget) {
      if (!epsg) {
        setSaveMsg('Declare the project CRS before starting stakeout.')
        return
      }
      if (!p.mapInstance.current) return
      const center = p.mapInstance.current.getView().getCenter()
      if (center) {
        import('ol/proj').then(({ transform }) => {
          const [e, n] = transform(center, 'EPSG:3857', epsg)
          activateStakeout({ easting: e, northing: n })
        })
      }
    } else {
      deactivateStakeout()
    }
  }, [p, activateStakeout, deactivateStakeout, epsg])

  // ── STAKEOUT INFO (uses pre-transformed UTM position — no require()) ──
  const stakeoutInfo = useCallback(() => {
    if (!epsg || !p.stakeoutTarget || !p.gpsPosInSurveyCrs) return null

    // Use the already-transformed UTM coordinates (set by async import in MapClient)
    const gpsE = p.gpsPosInSurveyCrs.easting
    const gpsN = p.gpsPosInSurveyCrs.northing

    const dE = p.stakeoutTarget.e - gpsE
    const dN = p.stakeoutTarget.n - gpsN
    const dist = Math.sqrt(dE * dE + dN * dN)
    let bearing = (Math.atan2(dE, dN) * 180) / Math.PI
    if (bearing < 0) bearing += 360
    return { distance: dist, bearing, dE, dN }
  }, [p.stakeoutTarget, p.gpsPosInSurveyCrs, epsg])

  // ── SAVE TO PROJECT — saves drawn features to current project (not throwaway) ──
  const drawingSaveInFlight = useRef(false)
  const saveToProject = useCallback(async () => {
    if (drawingSaveInFlight.current) return
    const setSaveMsg = p.setSaveMsg
    if (!epsg) {
      setSaveMsg('Declare or select a supported project CRS before saving survey geometry.')
      return
    }
    if (!p.drawSourceRef.current) return
    const features = p.drawSourceRef.current.getFeatures()
    if (features.length === 0) {
      setSaveMsg('Nothing to save — draw something first')
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }

    drawingSaveInFlight.current = true
    try {
      const { createClient } = await import('@/lib/api-client/client')
      const dbClient = createClient()
      const { data: { session } } = await dbClient.auth.getSession()
      if (!session?.user) {
        setSaveMsg('Not authenticated')
        setTimeout(() => setSaveMsg(''), 3000)
        return
      }

      // Convert features to GeoJSON in EPSG:4326
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      const geojson = fmt.writeFeatures(features, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      })
      const featuresJson = JSON.parse(geojson) as { features?: import('ol/format/GeoJSON').GeoJSONFeature[] }

      // Compute total area and perimeter in the project CRS (survey maths —
      // Web Mercator areas are inflated by 1/cos²(latitude) and must not be
      // persisted as drawnAreaSqM).
      let totalArea = 0
      let totalPerimeter = 0
      for (const f of features) {
        const geom = f.getGeometry()
        if (!geom) continue
        const type = geom.getType()
        try {
          if (type === 'Polygon' || type === 'MultiPolygon') {
            const polys = (type === 'Polygon'
              ? [(geom as Polygon).getCoordinates()]
              : (geom as Polygon).getCoordinates()) as unknown as number[][][][]
            for (const poly of polys) {
              const outer = poly[0] || []
              if (outer.length < 3) continue
              totalArea += polygonAreaInCrs(outer, epsg)
              totalPerimeter += polygonPerimeterInCrs(outer, epsg)
            }
          } else if (type === 'LineString') {
            totalPerimeter += polylineLengthInCrs((geom as LineString).getCoordinates(), epsg)
          }
        } catch { /* skip feature whose CRS could not be resolved */ }
      }

      if (p.projectId) {
        // ── Save to current project ──
        // Fetch existing boundary_data to merge
        const existingRow = (await dbClient
          .from('projects')
          .select('name, boundary_data')
          .eq('id', p.projectId)
          .single()) as { data: { name?: string; boundary_data?: { drawnFeatures?: { features?: unknown[] } } } | null }
        const existing = existingRow.data

        const existingBd: { drawnFeatures?: { features?: unknown[] } } = existing?.boundary_data || {}
        const existingDrawn: unknown[] = existingBd.drawnFeatures?.features || []
        const newFeatures: unknown[] = featuresJson.features || []

        const { error } = await dbClient
          .from('projects')
          .update({
            boundary_data: {
              ...existingBd,
              source: 'map-drawing',
              drawnFeatures: {
                type: 'FeatureCollection',
                features: [...existingDrawn, ...newFeatures],
              },
              lastDrawnAt: new Date().toISOString(),
              drawnAreaSqM: totalArea,
              drawnPerimeterM: totalPerimeter,
            },
          })
          .eq('id', p.projectId)

        if (error) {
          setSaveMsg(`Error: ${error.message}`)
        } else {
          const areaStr = totalArea > 0 ? ` · ${totalArea.toFixed(1)} m²` : ''
          setSaveMsg(`Saved ${features.length} feature(s) to "${existing?.name || 'project'}"${areaStr}`)
        }
      } else {
        // ── No project linked — create a new one ──
        const projectName = prompt('Enter a name for the new project:', `Map Drawing — ${new Date().toLocaleDateString()}`)
        if (!projectName) {
          setSaveMsg('Save cancelled')
          setTimeout(() => setSaveMsg(''), 3000)
          return
        }

        // Declare the CRS from the active map projection — never guess a zone.
        const crsInfo = describeCrs(epsg)
        if (!crsInfo || !crsInfo.projected || !crsInfo.zone || !crsInfo.hemisphere) {
          setSaveMsg('Cannot create project: the active map CRS has no declared UTM zone')
          setTimeout(() => setSaveMsg(''), 4000)
          return
        }

        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectName,
            survey_type: 'cadastral',
            location: 'Drawn on map',
            utm_zone: crsInfo.zone,
            hemisphere: crsInfo.hemisphere,
            datum: crsInfo.datum,
            boundary_data: {
              source: 'map-drawing', createdFrom: 'map-client',
              coordinateCrs: 'EPSG:4326', measurementCrs: crsInfo.code,
              drawnFeatures: featuresJson,
              drawnAreaSqM: totalArea, drawnPerimeterM: totalPerimeter,
            },
          }),
        })
        const result = await response.json() as { data?: { id?: string; name?: string }; error?: string }
        if (!response.ok) throw new Error(result.error || `Project save failed (HTTP ${response.status}). Your drawing is retained.`)
        const newProject = result.data
        if (!newProject?.id || typeof newProject.name !== 'string') throw new Error('Project save was not confirmed. Your drawing is retained; review Projects before retrying.')
        const areaStr = totalArea > 0 ? ` · ${totalArea.toFixed(1)} m²` : ''
        setSaveMsg(`Saved to "${newProject.name}"${areaStr}`)
      }
      setTimeout(() => setSaveMsg(''), 5000)
    } catch (err: unknown) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}. Your drawing remains on this map. If the save was interrupted, review Projects before retrying.`)
    } finally { drawingSaveInFlight.current = false }
  }, [p.projectId, p.setSaveMsg, p.drawSourceRef, epsg])

  // ── ANNOTATIONS ──
  const annotationMapRef = p.mapInstance
  const annotationSourceRef = p.drawSourceRef
  const annotationLayerRef = p.annotationLayerRef
  const annotationsAreShown = p.showAnnotations
  const setAnnotationsShown = p.setShowAnnotations
  const setAnnotationMessage = p.setSaveMsg
  const toggleAnnotations = useCallback(async () => {
    if (!annotationMapRef.current) return

    if (annotationLayerRef.current) {
      // Remove ALL annotation layers (not just the first one)
      const allLayers = (annotationLayerRef.current as import('ol/layer/Vector').default & { _allAnnotationLayers?: import('ol/layer/Vector').default[] })._allAnnotationLayers
      if (allLayers && annotationMapRef.current) {
        for (const layer of allLayers) {
          try { annotationMapRef.current.removeLayer(layer) } catch { /* already removed */ }
        }
      } else {
        annotationMapRef.current.removeLayer(annotationLayerRef.current)
      }
      annotationLayerRef.current = null
    }

    if (annotationsAreShown) {
      setAnnotationsShown(false)
      return
    }

    if (!epsg) {
      setAnnotationMessage('Set the project CRS before creating bearing or area annotations.')
      return
    }

    if (!annotationSourceRef.current) return
    const features = annotationSourceRef.current.getFeatures()
    if (features.length === 0) { setAnnotationsShown(false); return }

    try {
      const { createDrawAnnotationLayer } = await import('@/lib/surveyMapEngine/ol/drawAnnotations')
      // Create annotation layers for ALL LineString and Polygon features, not just the first one
      const allAnnotationLayers: import('ol/layer/Vector').default[] = []

      for (const f of features) {
        const geom = f.getGeometry()
        if (!geom) continue
        const type = geom.getType()
        if (type !== 'LineString' && type !== 'Polygon') continue

        let coords: Array<[number, number]>
        if (type === 'LineString') {
          coords = (geom as LineString).getCoordinates() as Array<[number, number]>
        } else {
          coords = (geom as Polygon).getCoordinates()[0] as Array<[number, number]> || []
        }

        if (coords.length < 2) continue

        try {
          const layer = await createDrawAnnotationLayer({
            coords3857: coords,
            geomType: type as 'LineString' | 'Polygon',
            epsg, // T1.5: pass the active UTM EPSG
          })
          allAnnotationLayers.push(layer)
        } catch {
          // Skip features that fail to annotate
        }
      }

      if (allAnnotationLayers.length === 0) {
        setAnnotationsShown(false)
        return
      }

      // Add all annotation layers to the map
      // Store the first layer as the ref for cleanup; store all others via a closure
      for (const layer of allAnnotationLayers) {
        annotationMapRef.current.addLayer(layer)
      }

      // Use a composite cleanup: store the first layer in the ref,
      // and track all layers via a closure
      annotationLayerRef.current = allAnnotationLayers[0]
      // Store all layers on the ref for complete cleanup
      ;(annotationLayerRef.current as import('ol/layer/Vector').default & { _allAnnotationLayers?: import('ol/layer/Vector').default[] })._allAnnotationLayers = allAnnotationLayers

      setAnnotationsShown(true)
    } catch (err) {
      logger.warn('Failed to create annotations:', { error: err })
      setAnnotationsShown(false)
    }
  }, [annotationsAreShown, annotationMapRef, annotationLayerRef, annotationSourceRef, setAnnotationsShown, setAnnotationMessage, epsg])

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
            logger.warn('[fitToKenya] View center out of Kenya bounds, falling back')
            view.setCenter(fromLonLat([37.0, -1.0]))
            view.setZoom(7)
          }
        } catch { /* ignore */ }
      }, 700)
    } catch (err) {
      logger.error('[fitToKenya] Extent transform failed, falling back:', { error: err })
      try {
        const { fromLonLat } = await import('ol/proj')
        p.mapInstance.current.getView().setCenter(fromLonLat([37.0, -1.0]))
        p.mapInstance.current.getView().setZoom(7)
      } catch { /* absolute fallback */ }
    }
  }, [p.mapInstance])

  const fitToDrawn = useCallback(() => {
    if (!p.mapInstance.current || !p.drawSourceRef.current) return
    const extent = p.drawSourceRef.current.getExtent()
    if (extent && extent[0] !== Infinity) {
      p.mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400 })
    }
  }, [p.mapInstance, p.drawSourceRef])

  const resetToKenya = useCallback(() => {
    if (!p.mapInstance.current) return
    // Kenya bounds in EPSG:3857 (matches the View extent option). getExtent() is not a
    // real OL View method, so use the Kenya box directly.
    const KENYA_EXTENT: import('ol/extent').Extent = [-2.2e7, -1.2e7, 2.2e7, 1.5e7]
    p.mapInstance.current.getView().fit(KENYA_EXTENT, { duration: 400, padding: [0, 0, 0, 0] })
  }, [p.mapInstance])

  const getMapExtent = useCallback(async (): Promise<MapExtent | null> => {
    if (!p.mapInstance.current) return null
    try {
      const view = p.mapInstance.current.getView()
      const size = p.mapInstance.current.getSize()
      if (!size) return null
      const extent = view.calculateExtent(size)
      const { transform } = await import('ol/proj')
      const [minLon, minLat] = transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326')
      const [maxLon, maxLat] = transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326')
      return { minLat, minLon, maxLat, maxLon }
    } catch { return null }
  }, [p.mapInstance])

  const coordSearchMapRef = p.mapInstance
  const setCoordSearchMessage = p.setSaveMsg
  const handleCoordSearchLocal = useCallback(async (searchInput: string) => {
    const { handleCoordSearch } = await import('@/app/map/utils/coordSearch')
    await handleCoordSearch(searchInput, coordSearchMapRef, epsg, (message) => {
      setCoordSearchMessage(message)
      setTimeout(() => setCoordSearchMessage(''), 4500)
    })
  }, [epsg, coordSearchMapRef, setCoordSearchMessage])

  const updateFeatureName = useCallback((name: string, selectedFeature: Feature | null) => {
    if (selectedFeature) {
      selectedFeature.set('name', name)
      selectedFeature.set('label', name)
    }
  }, [])

  const handleOpacityChange = useCallback((val: number, setLayerOpacity: (v: number) => void) => {
    const opacity = Math.max(0, Math.min(1, val))
    setLayerOpacity(opacity)
    const mapInstance = p.mapInstance.current
    if (mapInstance) applyOverlayOpacity(mapInstance, opacity, isStandardBasemapId)
  }, [p.mapInstance])

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
    activateStakeout,
    deactivateStakeout,
    updateStakeoutOnGPS,
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
