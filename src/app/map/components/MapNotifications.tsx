'use client'
/**
 * MapNotifications — Toast-style notification overlays for import/save messages
 *
 * Now reads from MapReactContext via useMapContext().
 * Positioned at top center, auto-dismiss via parent timeout.
 */

import React, { memo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapNotifications = memo(function MapNotifications() {
  const { importMsg, saveMsg } = useMapContext()

  return (
    <div aria-live="polite" aria-atomic="true">
      {importMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#D17B47] text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold" role="status">
          {importMsg}
        </div>
      )}
      {saveMsg && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold ${
          saveMsg.startsWith('Error') ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`} role="status">
          {saveMsg}
        </div>
      )}
    </div>
  )
})
