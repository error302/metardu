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
      className="w-11 h-11 sm:w-10 sm:h-10 !rounded-xl !p-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] backdrop-blur-xl border border-[var(--border-color)]/[0.15] shadow-lg hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
      printTarget="metardu-global-map"
      printTitle="METARDU Global Map"
    />
  )
})
