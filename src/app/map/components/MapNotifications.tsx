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
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[min(92vw,36rem)] px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold ${
            pointDisplayIsPartial
              ? 'bg-amber-100 text-amber-950 border border-amber-300'
              : 'bg-[var(--error)] text-[var(--text-primary)]'
          }`}
          role={pointDisplayIsPartial ? 'status' : 'alert'}
        >
          {projectPointsError}
        </div>
      )}
      {importMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#D17B47] text-[var(--text-primary)] px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold" role="status">
          {importMsg}
        </div>
      )}
      {saveMsg && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold ${
          saveMsg.startsWith('Error') ? 'bg-[var(--error)] text-[var(--text-primary)]' : 'bg-[var(--success)] text-[var(--text-primary)]'
        }`} role="status">
          {saveMsg}
        </div>
      )}
    </div>
  )
})
