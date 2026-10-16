'use client'

import { useCallback, useRef, useState } from 'react'
import type { PlanGeometry } from '@/lib/engine/planGeometry'
import type { PrintOptions } from '@/lib/surveyMapEngine/io/printSurface'
import { loadSheetLayout } from '@/lib/surveyMapEngine/io/printSurface'

export interface UseMapPrintFlowParams {
  mapInstance: React.RefObject<import('ol/Map').default | null>
  attributionTargetRef: React.RefObject<HTMLDivElement | null>
  drawSourceRef: React.RefObject<import('ol/source/Vector').default | null>
  currentSurveyCrs: string | null
  onError: (message: string) => void
}

export function useMapPrintFlow({ mapInstance, attributionTargetRef, drawSourceRef, currentSurveyCrs, onError }: UseMapPrintFlowParams) {
  const [showSheetLayout, setShowSheetLayout] = useState(false)
  const [printPlanGeometry, setPrintPlanGeometry] = useState<PlanGeometry | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const pending = useRef(false)
  const handlePrintMap = useCallback(async (options?: Partial<PrintOptions>) => {
    if (pending.current || !mapInstance.current) return
    const map = mapInstance.current
    pending.current = true; setIsPrinting(true); setShowSheetLayout(false)
    try {
      const { captureMapViewport, mapViewportPdf } = await import('@/lib/surveyMapEngine/io/mapViewportPrint')
      const raster = await captureMapViewport(map)
      const attribution = attributionTargetRef.current
      const links = attribution ? [...attribution.querySelectorAll<HTMLAnchorElement>('a[href]')].map(link => link.href) : []
      const creditList = attribution?.querySelector('ul') ?? attribution
      const credits = [creditList?.textContent?.trim() ?? '', ...new Set(links)].filter(Boolean).join(' · ')
      if (!credits) throw new Error('Map source credits are not ready. Wait for the map, then print again.')
      const pdf = await mapViewportPdf({ raster, surveyCrs: currentSurveyCrs, credits, capturedAt: new Date().toISOString(), rotation: map.getView().getRotation() }, options)
      const url = URL.createObjectURL(pdf)
      const link = document.createElement('a'); link.href = url; link.download = 'metardu-current-map.pdf'
      document.body.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not prepare the current map.'
      onError(`Error: ${message}`)
    } finally { pending.current = false; setIsPrinting(false) }
  }, [mapInstance, attributionTargetRef, currentSurveyCrs, onError])

  const openSheetLayout = useCallback(async () => {
    await loadSheetLayout()
    if (!currentSurveyCrs) { setPrintPlanGeometry(null); setShowSheetLayout(true); return }
    const { derivePlanGeometryFromDrawSource } = await import('@/app/map/utils/derivePlanGeometry')
    setPrintPlanGeometry(await derivePlanGeometryFromDrawSource(drawSourceRef.current, currentSurveyCrs))
    setShowSheetLayout(true)
  }, [currentSurveyCrs, drawSourceRef])
  const printApi = {
    sheetLayoutOpen: showSheetLayout,
    openSheetLayout: () => { void openSheetLayout().catch(error => onError(`Error: ${error instanceof Error ? error.message : 'Could not prepare survey sheet.'}`)) },
    closeSheetLayout: () => setShowSheetLayout(false),
    toggleSheetLayout: () => { if (showSheetLayout) setShowSheetLayout(false); else void openSheetLayout().catch(() => onError('Error: Could not prepare survey sheet.')) },
    print: handlePrintMap,
  }
  return { showSheetLayout, setShowSheetLayout, printPlanGeometry, handlePrintMap, printApi, isPrinting }
}
