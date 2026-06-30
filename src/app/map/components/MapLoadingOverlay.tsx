'use client'
/**
 * MapLoadingOverlay — Loading and error states for the map
 *
 * Shows a spinner while the map initializes, or an error message
 * with retry/reload options if initialization fails.
 * Memoized for performance.
 *
 * Now consumes state from MapReactContext via useMapContext().
 */

import React, { memo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapLoadingOverlay = memo(function MapLoadingOverlay() {
  const { mapReady, initError, retryInit } = useMapContext()

  if (mapReady && !initError) return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="text-center max-w-md px-6 bg-[#14141e]/90 rounded-xl py-5 shadow-2xl">
        {initError ? (
          <>
            <div className="text-[var(--error)] text-lg mb-2">Map Error</div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{initError}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={retryInit}
                className="px-4 py-2 bg-[var(--bg-card)]/10 text-[var(--text-primary)] rounded-lg text-sm hover:bg-[var(--bg-card)]/20 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[#D17B47] text-[var(--text-primary)] rounded-lg text-sm hover:bg-[#D17B47]/80 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-[#D17B47] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Loading map...</p>
          </>
        )}
      </div>
    </div>
  )
})
