'use client'
/**
 * MapPrintButton — Thin wrapper around PrintButton that reads from context
 *
 * Reads printMap, isPrinting, paperSize, orientation from MapReactContext.
 * Passes static props (printTarget, printTitle, compact) directly.
 */

import React, { memo } from 'react'
import { PrintButton } from '@/hooks/usePrint'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapPrintButton = memo(function MapPrintButton() {
  const {
    printMap,
    isPrinting,
    paperSize,
    setPaperSize,
    orientation,
    setOrientation,
  } = useMapContext()

  return (
    <PrintButton
      print={printMap}
      isPrinting={isPrinting}
      paperSize={paperSize}
      setPaperSize={setPaperSize}
      orientation={orientation}
      setOrientation={setOrientation}
      compact
      printTarget="metardu-global-map"
      printTitle="METARDU Global Map"
    />
  )
})
