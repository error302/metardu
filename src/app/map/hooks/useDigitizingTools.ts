'use client'

/**
 * OpenLayers interactions and explicit Apply actions for the global survey map.
 * Survey geometry operations are performed in the declared project CRS; map
 * geometry remains in the display projection.
 */
import { useCallback, useEffect, useRef } from 'react'
import type Feature from 'ol/Feature'
import type VectorSource from 'ol/source/Vector'
import type Select from 'ol/interaction/Select'
import { SRID_3857 } from '@/lib/map/projection'
import { logger } from '@/lib/logger'

export type DigitizingTool = 'draw' | 'split' | 'merge' | 'reshape' | 'rotate' | 'offset'
type Coordinate = [number, number]

export interface UseDigitizingToolsParams {
  activeDigitizingTool: DigitizingTool | null
  setActiveDigitizingTool: (tool: DigitizingTool | null) => void
  mapInstance: React.RefObject<import('ol/Map').default | null>
  mapReady: boolean
  selectedFeature: Feature | null
  selectedFeatures: Feature[]
  setSelectedFeature: (feature: Feature | null) => void
  setSelectedFeatures: (features: Feature[]) => void
  selectInteractionRef: React.RefObject<Select | null>
  offsetDistance: number
  rotateAngle: number
  drawSourceRef: React.RefObject<VectorSource | null>
  currentSurveyCrs: string | null
  pushHistory: () => void
  setSaveMsg: (msg: string) => void
}

function report(setSaveMsg: (msg: string) => void, message: string, duration = 4000) {
  setSaveMsg(message)
  setTimeout(() => setSaveMsg(''), duration)
}

function getPolygonFeatures(source: VectorSource): Feature[] {
  return source.getFeatures().filter((feature) => feature.getGeometry()?.getType() === 'Polygon')
}

async function transformCoordinates(
  coordinates: number[][],
  sourceCrs: string,
  targetCrs: string,
): Promise<Coordinate[]> {
  const { transform } = await import('ol/proj')
  return coordinates.map(([x, y]) => transform([x, y], sourceCrs, targetCrs) as Coordinate)
}

export function useDigitizingTools({
  activeDigitizingTool,
  setActiveDigitizingTool,
  mapInstance,
  mapReady,
  selectedFeature,
  selectedFeatures,
  setSelectedFeature,
  setSelectedFeatures,
  selectInteractionRef,
  offsetDistance,
  rotateAngle,
  drawSourceRef,
  currentSurveyCrs,
  pushHistory,
  setSaveMsg,
}: UseDigitizingToolsParams) {
  const editingToolRef = useRef<import('ol/interaction').Interaction | null>(null)
  const applyingOneShotRef = useRef(false)

  // Split and reshape are the only tools that need a persistent Draw
  // interaction. They resolve the polygon actually crossed by the sketch.
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return

    if (editingToolRef.current) {
      map.removeInteraction(editingToolRef.current)
      editingToolRef.current = null
    }

    if (activeDigitizingTool !== 'split' && activeDigitizingTool !== 'reshape') return
    if (!currentSurveyCrs) {
      report(setSaveMsg, 'Set a supported project CRS before editing survey geometry.')
      setActiveDigitizingTool(null)
      return
    }

    const drawSource = drawSourceRef.current
    if (!drawSource) {
      report(setSaveMsg, 'The map geometry layer is not ready.')
      setActiveDigitizingTool(null)
      return
    }

    let cancelled = false
    let drawInteraction: import('ol/interaction').Interaction | null = null

    void (async () => {
      const [DrawModule, SourceModule, StyleModule, StrokeModule, FillModule] = await Promise.all([
        import('ol/interaction/Draw'),
        import('ol/source/Vector'),
        import('ol/style/Style'),
        import('ol/style/Stroke'),
        import('ol/style/Fill'),
      ])
      if (cancelled) return

      const temporarySource = new SourceModule.default()
      const draw = new DrawModule.default({
        source: temporarySource,
        type: 'LineString',
        style: new StyleModule.default({
          fill: new FillModule.default({ color: 'rgba(209, 123, 71, 0.2)' }),
          stroke: new StrokeModule.default({ color: '#D17B47', width: 2, lineDash: [8, 4] }),
        }),
      })

      draw.on('drawend', async (event) => {
        const lineGeometry = event.feature.getGeometry()
        if (!lineGeometry || cancelled) return

        try {
          const lineCoordinates = await transformCoordinates(
            (lineGeometry as import('ol/geom/LineString').default).getCoordinates(),
            SRID_3857,
            currentSurveyCrs,
          )
          const { reshapePolygon, splitPolygonWithLine } = await import('@/lib/surveyMapEngine/ol/editingTools')
          const candidates = getPolygonFeatures(drawSource)
          let targetFeature: Feature | null = null
          let result: [number, number][] | import('@/lib/surveyMapEngine/ol/editingTools').SplitResult | null = null
          let skippedInteriorRings = false

          for (const candidate of candidates) {
            const geometry = candidate.getGeometry()
            if (!geometry || geometry.getType() !== 'Polygon') continue
            const rings = (geometry as import('ol/geom/Polygon').default).getCoordinates()
            if (rings.length === 0) continue
            if (rings.length > 1) {
              skippedInteriorRings = true
              continue
            }
            const polygonCoordinates = await transformCoordinates(rings[0], SRID_3857, currentSurveyCrs)
            const candidateResult = activeDigitizingTool === 'split'
              ? splitPolygonWithLine(polygonCoordinates, lineCoordinates, currentSurveyCrs)
              : reshapePolygon(polygonCoordinates, lineCoordinates, currentSurveyCrs)
            if (candidateResult) {
              targetFeature = candidate
              result = candidateResult
              break
            }
          }

          if (cancelled) return
          if (!targetFeature || !result) {
            report(setSaveMsg, skippedInteriorRings
              ? 'Split and reshape currently preserve simple polygons only; this polygon has interior rings.'
              : activeDigitizingTool === 'split'
                ? 'Split failed — the line must cross one polygon at two points.'
                : 'Reshape failed — the line must intersect a polygon boundary.')
            return
          }

          const { transform } = await import('ol/proj')
          const { default: FeatureCtor } = await import('ol/Feature')
          const { default: Polygon } = await import('ol/geom/Polygon')
          if (cancelled) return

          if (activeDigitizingTool === 'split') {
            const split = result as import('@/lib/surveyMapEngine/ol/editingTools').SplitResult
            const polygon1 = split.polygon1.map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857))
            const polygon2 = split.polygon2.map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857))
            const replacements = [
              new FeatureCtor({ geometry: new Polygon([polygon1]), source: 'split' }),
              new FeatureCtor({ geometry: new Polygon([polygon2]), source: 'split' }),
            ]
            drawSource.removeFeature(targetFeature)
            drawSource.addFeatures(replacements)
            selectInteractionRef.current?.clearSelection()
            setSelectedFeature(null)
            setSelectedFeatures([])
            pushHistory()
            report(setSaveMsg, `Split into 2 polygons (${split.area1.toFixed(1)} grid m² + ${split.area2.toFixed(1)} grid m²)`, 5000)
          } else {
            const reshaped = (result as Coordinate[]).map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857))
            const replacement = new FeatureCtor({ geometry: new Polygon([reshaped]), source: 'reshape' })
            drawSource.removeFeature(targetFeature)
            drawSource.addFeature(replacement)
            selectInteractionRef.current?.clearSelection()
            setSelectedFeature(null)
            setSelectedFeatures([])
            pushHistory()
            report(setSaveMsg, 'Polygon reshaped.', 3000)
          }
        } catch (error) {
          logger.error('[DigitizingTool] Split/reshape failed:', { error })
          if (!cancelled) report(setSaveMsg, 'The polygon could not be edited in the project CRS.')
        }
      })

      if (cancelled) return
      drawInteraction = draw
      editingToolRef.current = draw
      map.addInteraction(draw)
    })().catch((error) => {
      logger.error('[DigitizingTool] Could not activate draw interaction:', { error })
      if (!cancelled) report(setSaveMsg, 'The drawing interaction could not be started.')
    })

    return () => {
      cancelled = true
      if (drawInteraction) map.removeInteraction(drawInteraction)
      if (editingToolRef.current === drawInteraction) editingToolRef.current = null
    }
  }, [
    activeDigitizingTool,
    currentSurveyCrs,
    drawSourceRef,
    mapInstance,
    mapReady,
    pushHistory,
    selectInteractionRef,
    setActiveDigitizingTool,
    setSaveMsg,
    setSelectedFeature,
    setSelectedFeatures,
  ])

  // Merge, rotate, and offset run only when the user presses Apply. Changing
  // the angle/distance slider or selecting a feature has no geometry side effect.
  const applyOneShotTool = useCallback(async () => {
    const tool = activeDigitizingTool
    if (tool !== 'merge' && tool !== 'rotate' && tool !== 'offset') return
    if (applyingOneShotRef.current) return
    const drawSource = drawSourceRef.current
    if (!mapReady || !mapInstance.current || !drawSource) {
      report(setSaveMsg, 'The map is not ready to edit geometry.')
      return
    }
    if (!currentSurveyCrs) {
      report(setSaveMsg, 'Set a supported project CRS before editing survey geometry.')
      return
    }

    applyingOneShotRef.current = true
    try {
      const [{ transform }, editingTools] = await Promise.all([
        import('ol/proj'),
        import('@/lib/surveyMapEngine/ol/editingTools'),
      ])

      if (tool === 'merge') {
        const currentSelection = selectInteractionRef.current?.getFeatures().getArray() ?? selectedFeatures
        const sourceFeatures = drawSource.getFeatures()
        const polygons = currentSelection.filter((feature) =>
          sourceFeatures.includes(feature) && feature.getGeometry()?.getType() === 'Polygon',
        )
        if (polygons.length < 2) {
          report(setSaveMsg, 'Select at least 2 drawn polygons with Shift+click, then apply Merge.')
          return
        }

        const projectRings: Coordinate[][] = []
        for (const feature of polygons) {
          const geometry = feature.getGeometry() as import('ol/geom/Polygon').default
          const rings = geometry.getCoordinates()
          if (rings.length > 1) {
            report(setSaveMsg, 'Merge currently supports simple polygons without interior rings.')
            return
          }
          if (!rings[0]) continue
          projectRings.push(await transformCoordinates(rings[0], SRID_3857, currentSurveyCrs))
        }
        const merged = editingTools.mergePolygons(projectRings)
        if (!merged) {
          report(setSaveMsg, 'Merge failed — selected polygons must share an edge and form a valid boundary.')
          return
        }

        const mergedCoordinates = merged.map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857))
        const [{ default: FeatureCtor }, { default: Polygon }] = await Promise.all([
          import('ol/Feature'),
          import('ol/geom/Polygon'),
        ])
        const mergedFeature = new FeatureCtor({
          geometry: new Polygon([mergedCoordinates]),
          source: 'merge',
          mergedFeatureCount: polygons.length,
        })
        polygons.forEach((feature) => drawSource.removeFeature(feature))
        drawSource.addFeature(mergedFeature)
        selectInteractionRef.current?.clearSelection()
        setSelectedFeature(null)
        setSelectedFeatures([])
        pushHistory()
        report(setSaveMsg, `Merged ${polygons.length} selected polygons.`, 3500)
        return
      }

      if (!selectedFeature || !drawSource.getFeatures().includes(selectedFeature)) {
        report(setSaveMsg, `Select a drawn feature before applying ${tool}.`)
        return
      }

      const geometry = selectedFeature.getGeometry()
      if (!geometry) {
        report(setSaveMsg, 'The selected feature has no geometry.')
        return
      }

      if (tool === 'rotate') {
        if (geometry.getType() !== 'Polygon') {
          report(setSaveMsg, 'Rotate requires a selected polygon.')
          return
        }
        if (!Number.isFinite(rotateAngle)) {
          report(setSaveMsg, 'Enter a valid rotation angle.')
          return
        }

        const { default: Polygon } = await import('ol/geom/Polygon')
        if (!drawSource.getFeatures().includes(selectedFeature)) {
          report(setSaveMsg, 'The selected polygon changed before rotation could be applied.')
          return
        }
        const rings3857 = (geometry as import('ol/geom/Polygon').default).getCoordinates()
        if (rings3857.length === 0 || rings3857[0].length < 4) {
          report(setSaveMsg, 'The selected polygon boundary is incomplete.')
          return
        }
        const ringsProject = await Promise.all(rings3857.map((ring) => transformCoordinates(ring, SRID_3857, currentSurveyCrs)))
        const outer = ringsProject[0]
        const outerVertices = outer.length > 1 && outer[0][0] === outer[outer.length - 1][0] && outer[0][1] === outer[outer.length - 1][1]
          ? outer.slice(0, -1)
          : outer
        const origin: Coordinate = [
          outerVertices.reduce((sum, point) => sum + point[0], 0) / outerVertices.length,
          outerVertices.reduce((sum, point) => sum + point[1], 0) / outerVertices.length,
        ]
        const rotatedProject = ringsProject.map((ring) => editingTools.rotatePolygon(ring, rotateAngle, origin))
        const rotated3857 = rotatedProject.map((ring) =>
          ring.map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857)),
        )
        selectedFeature.setGeometry(new Polygon(rotated3857))
        pushHistory()
        const direction = rotateAngle < 0 ? 'clockwise' : 'counter-clockwise'
        report(setSaveMsg, `Rotated polygon ${Math.abs(rotateAngle)}° ${direction}.`, 3500)
        return
      }

      const isPolygon = geometry.getType() === 'Polygon'
      const isLine = geometry.getType() === 'LineString'
      if (!isPolygon && !isLine) {
        report(setSaveMsg, 'Offset supports a selected polygon or line.')
        return
      }
      if (!Number.isFinite(offsetDistance) || offsetDistance === 0) {
        report(setSaveMsg, 'Choose a non-zero offset distance.')
        return
      }

      const sourceCoordinates = isPolygon
        ? (geometry as import('ol/geom/Polygon').default).getCoordinates()[0]
        : (geometry as import('ol/geom/LineString').default).getCoordinates()
      if (isPolygon && (geometry as import('ol/geom/Polygon').default).getCoordinates().length > 1) {
        report(setSaveMsg, 'Offset currently supports simple polygons without interior rings.')
        return
      }
      if (!sourceCoordinates || sourceCoordinates.length < 2) {
        report(setSaveMsg, 'The selected feature does not have enough coordinates to offset.')
        return
      }
      const projectCoordinates = await transformCoordinates(sourceCoordinates, SRID_3857, currentSurveyCrs)
      const offset = editingTools.createOffset(projectCoordinates, offsetDistance, isPolygon, currentSurveyCrs)
      if (!offset) {
        report(setSaveMsg, 'Offset could not be created for the selected geometry.')
        return
      }

      const offset3857 = offset.map(([e, n]) => transform([e, n], currentSurveyCrs, SRID_3857))
      const { default: FeatureCtor } = await import('ol/Feature')
      const newGeometry = isPolygon
        ? new (await import('ol/geom/Polygon')).default([offset3857])
        : new (await import('ol/geom/LineString')).default(offset3857)
      drawSource.addFeature(new FeatureCtor({
        geometry: newGeometry,
        source: 'offset',
        offsetDistance,
      }))
      pushHistory()
      report(setSaveMsg, `Created ${Math.abs(offsetDistance)} m offset.`, 3500)
    } catch (error) {
      logger.error(`[DigitizingTool] ${tool} failed:`, { error })
      report(setSaveMsg, `The ${tool} operation failed; no result was applied.`)
    } finally {
      applyingOneShotRef.current = false
    }
  }, [
    activeDigitizingTool,
    currentSurveyCrs,
    drawSourceRef,
    mapInstance,
    mapReady,
    offsetDistance,
    pushHistory,
    rotateAngle,
    selectInteractionRef,
    selectedFeature,
    selectedFeatures,
    setSaveMsg,
    setSelectedFeature,
    setSelectedFeatures,
  ])

  return { applyOneShotTool }
}
