'use client'
/**
 * MapOverlays — Floating map UI overlays (zoom controls, GPS badge, stakeout HUD, project count)
 *
 * Now reads state from MapReactContext via useMapContext().
 * Memoized to prevent re-renders from unrelated state changes.
 * All overlays are absolutely positioned within the map container.
 * Mobile-responsive: adjusts sizes and positions for small screens.
 */

import React, { memo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapOverlays = memo(function MapOverlays() {
  const { panelOpen, setPanelOpen, isMobile } = useMapContext()

  return (
    <>
      {/* Hamburger toggle when panel is open */}
      {panelOpen && (
        <button
          onClick={() => setPanelOpen(false)}
          className="absolute top-3 z-30 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/[0.06] transition-colors"
          style={{ left: isMobile ? '0px' : '260px' }}
          title="Collapse panel"
        >
          <span className="text-sm">{'\u2039'}</span>
        </button>
      )}
    </>
  )
})
