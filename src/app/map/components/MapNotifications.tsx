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
  const { importMsg, saveMsg, projectPointsError } = useMapContext()
  const pointDisplayIsPartial = projectPointsError?.startsWith('More than 500 map features') ?? false

  return (
    <div aria-live="polite" aria-atomic="true">
      {projectPointsError && (
        <div
          className={`map-notification absolute left-1/2 -translate-x-1/2 w-max max-w-[min(92vw,36rem)] px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold ${
            pointDisplayIsPartial
              ? 'bg-amber-100 text-amber-950 border border-amber-300'
              : 'bg-red-950 text-red-100 border border-red-400'
          }`}
          role={pointDisplayIsPartial ? 'status' : 'alert'}
        >
          {projectPointsError}
        </div>
      )}
      {importMsg && (
        <div className="map-notification absolute left-1/2 -translate-x-1/2 w-max max-w-[min(92vw,36rem)] bg-amber-100 text-amber-950 border border-amber-300 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold" role="status">
          {importMsg}
        </div>
      )}
      {saveMsg && (
        <div className={`map-notification absolute left-1/2 -translate-x-1/2 w-max max-w-[min(92vw,36rem)] px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold border ${
          saveMsg.startsWith('Error') ? 'bg-red-950 text-red-100 border-red-400' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]'
        }`} role={saveMsg.startsWith('Error')?'alert':'status'}>
          {saveMsg}
        </div>
      )}
    </div>
  )
})
