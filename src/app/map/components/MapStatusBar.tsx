'use client'
/**
 * MapStatusBar — Bottom coordinate bar overlay
 *
 * Shows live mouse coordinates in both Lon/Lat and EPSG:21037 (E/N).
 * Memoized to prevent re-renders from unrelated state changes.
 * Responsive: hides E/N on mobile, adjusts font sizes.
 */

import React, { memo } from 'react'

interface MapStatusBarProps {
  mouseCoord: { lon: number; lat: number; e: number; n: number } | null
  dragHint: boolean
  isMobile: boolean
}

export const MapStatusBar = memo(function MapStatusBar({
  mouseCoord,
  dragHint,
  isMobile,
}: MapStatusBarProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10" style={{ bottom: isMobile ? '64px' : '0px' }}>
      <div className="mx-2 mb-2 h-8 bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-lg flex items-center justify-between px-2 md:px-3 overflow-x-auto">
        {/* Coordinates */}
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          {mouseCoord ? (
            <div className="flex items-center gap-1.5 md:gap-3 text-[10px] md:text-[11px] font-mono whitespace-nowrap">
              <span className="text-gray-600">Lon</span>
              <span className="text-gray-300 w-[60px] md:w-[76px] text-right">{mouseCoord.lon.toFixed(6)}</span>
              <span className="text-gray-600">Lat</span>
              <span className="text-gray-300 w-[60px] md:w-[76px] text-right">{mouseCoord.lat.toFixed(6)}</span>
              <span className="hidden md:block w-px h-3.5 bg-white/[0.06]" />
              <span className="text-[#E8841A]/70">E</span>
              <span className="text-[#E8841A] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.e.toFixed(1)}</span>
              <span className="text-[#E8841A]/70">N</span>
              <span className="text-[#E8841A] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.n.toFixed(1)}</span>
              <span className="text-gray-600 text-[9px] md:text-[10px]">EPSG:21037</span>
            </div>
          ) : (
            <span className="text-[10px] md:text-[11px] text-gray-600">Move cursor for coordinates</span>
          )}
        </div>
        <div />
      </div>

      {/* Drag-drop hint */}
      {dragHint && (
        <div className="text-center mb-1 transition-opacity duration-1000">
          <span className="text-[10px] text-gray-700 bg-[#0d0d14]/60 px-3 py-0.5 rounded-full backdrop-blur-sm">
            Drag &amp; drop GeoJSON, KML, or WKT files onto the map
          </span>
        </div>
      )}
    </div>
  )
})
