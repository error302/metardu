'use client'

import { memo } from 'react'
import { Printer } from 'lucide-react'
import { useMapContext } from '../MapReactContext'

export const MapPrintButton = memo(function MapPrintButton() {
  const { printMap, isPrinting, paperSize, orientation } = useMapContext()
  return <button type="button" className="map-print-button" onClick={() => void printMap({ paperSize, orientation })} disabled={isPrinting} aria-label={isPrinting ? 'Preparing current map' : 'Print current map'} title="Download a print-ready PDF of the current map and drawing"><Printer className="h-4 w-4" /></button>
})
