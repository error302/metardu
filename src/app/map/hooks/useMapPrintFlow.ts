'use client'

/**
 * useMapPrintFlow — sheet-layout + print orchestration for /map
 * (plan Phase 5: MapClient thinning).
 *
 * Loads the SheetLayout overlay chunk before showing it (without the pre-load
 * the first print can render a blank overlay), derives the plan geometry from
 * the current draw source so the sheet shows a real scale/area/perimeter,
 * then triggers the browser print and tears the overlay down on `afterprint`.
 */
import { useCallback, useEffect, useState } from 'react'
import type { PlanGeometry } from '@/lib/engine/planGeometry'
import type { PrintOptions } from '@/lib/surveyMapEngine/io/printSurface'
import { loadSheetLayout } from '@/lib/surveyMapEngine/io/printSurface'

export interface UseMapPrintFlowParams {
  print: (overrides?: Partial<PrintOptions>) => void | Promise<void>
  drawSourceRef: React.RefObject<import('ol/source/Vector').default | null>
  currentSurveyCrs: string | null
}

export function useMapPrintFlow({ print, drawSourceRef, currentSurveyCrs }: UseMapPrintFlowParams) {
  const [showSheetLayout, setShowSheetLayout] = useState(false)
  // Derived at print time from the largest drawn polygon so the sheet's scale,
  // area and perimeter reflect the actual survey (not the "As Noted" fallback).
  const [printPlanGeometry, setPrintPlanGeometry] = useState<PlanGeometry | null>(null)

  // Print handler: show sheet layout overlay then trigger browser print
  const handlePrintMap = useCallback(
    async (overrides?: Partial<PrintOptions>) => {
      // Force the SheetLayout chunk to load BEFORE we show + print. Without this,
      // the dynamic import races the 500ms delay and the first print can come out
      // blank (overlay not yet mounted) on slow connections.
      try {
        await loadSheetLayout()
      } catch {}
      // Derive plan geometry from the largest drawn polygon so the sheet shows a
      // real scale / area / perimeter instead of "As Noted". The state is
      // cleared first so the sheet can never mount with a previous run's value.
      setPrintPlanGeometry(null)
      try {
        if (!currentSurveyCrs) throw new Error('A survey CRS is required for measured sheet geometry.')
        const { derivePlanGeometryFromDrawSource } = await import(
          '@/app/map/utils/derivePlanGeometry'
        )
        const geom = await derivePlanGeometryFromDrawSource(
          drawSourceRef.current,
          currentSurveyCrs
        )
        setPrintPlanGeometry(geom)
      } catch {
        setPrintPlanGeometry(null)
      }
      setShowSheetLayout(true)
      await new Promise((resolve) => setTimeout(resolve, 500))
      await print(overrides)

      // Fallback timer: clear sheet layout and plan geometry if afterprint never fires (iOS Safari / cancel path)
      setTimeout(() => {
        setShowSheetLayout(false)
        setPrintPlanGeometry(null)
      }, 10000)
    },
    [print, currentSurveyCrs, drawSourceRef]
  )

  // Phase 4 (plan §3.1): export/print entry points reachable from the engine
  const printApi = {
    sheetLayoutOpen: showSheetLayout,
    openSheetLayout: () => setShowSheetLayout(true),
    closeSheetLayout: () => setShowSheetLayout(false),
    toggleSheetLayout: () => setShowSheetLayout((v) => !v),
    print: handlePrintMap,
  }

  // Hide the sheet-layout overlay when the print dialog closes. Also drop the
  // derived geometry so a future sheet-open can never render the previous
  // print's stale scale label — the sheet only ever shows a value derived in
  // the same tick it was opened.
  useEffect(() => {
    const onAfterPrint = () => {
      setShowSheetLayout(false)
      setPrintPlanGeometry(null)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  return { showSheetLayout, setShowSheetLayout, printPlanGeometry, handlePrintMap, printApi }
}
