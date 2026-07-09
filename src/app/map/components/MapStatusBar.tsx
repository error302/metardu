'use client'
/**
 * MapStatusBar — Bottom coordinate bar overlay
 *
 * Reads state from MapReactContext via useMapContext().
 * Shows live mouse coordinates in both Lon/Lat (WGS84 degrees) and UTM (E/N meters).
 *
 * T1.5b FIX (2026-07-10):
 *   - lon/lat are now actual WGS84 degrees (transformed from EPSG:3857 → EPSG:4326),
 *     not raw Web Mercator meters mislabeled as "Lon/Lat"
 *   - The UTM EPSG label now reads from context (currentUtmEpsg), not hardcoded
 */

import React, { memo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapStatusBar = memo(function MapStatusBar() {
  const { mouseCoord, dragHint, isMobile, currentUtmEpsg } = useMapContext()

  return (
    <div className="w-full" style={{ paddingBottom: isMobile ? '64px' : '0px' }}>
      <div className="mx-2 mb-2 h-8 bg-[#0d0d14]/95 backdrop-blur-xl border border-[var(--border-color)]/[0.06] rounded-lg flex items-center justify-between px-2 md:px-3 overflow-x-auto">
        {/* Coordinates */}
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          {mouseCoord ? (
            <div className="flex items-center gap-1.5 md:gap-3 text-[10px] md:text-[11px] font-mono whitespace-nowrap">
              {/* WGS84 geographic — Lon/Lat in DEGREES */}
              <span className="text-[var(--text-muted)]">Lon</span>
              <span className="text-[var(--text-secondary)] w-[60px] md:w-[76px] text-right">{mouseCoord.lon.toFixed(6)}</span>
              <span className="text-[var(--text-muted)]">Lat</span>
              <span className="text-[var(--text-secondary)] w-[60px] md:w-[76px] text-right">{mouseCoord.lat.toFixed(6)}</span>
              <span className="text-[var(--text-muted)] text-[9px] md:text-[10px]">WGS84</span>
              <span className="hidden md:block w-px h-3.5 bg-[var(--bg-card)]/[0.06]" />
              {/* Projected — Easting/Northing in METERS */}
              <span className="text-[#D17B47]/70">E</span>
              <span className="text-[#D17B47] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.e.toFixed(1)}</span>
              <span className="text-[#D17B47]/70">N</span>
              <span className="text-[#D17B47] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.n.toFixed(1)}</span>
              <span className="text-[var(--text-muted)] text-[9px] md:text-[10px]">{currentUtmEpsg}</span>
            </div>
          ) : (
            <span className="text-[10px] md:text-[11px] text-[var(--text-muted)]">Move cursor for coordinates</span>
          )}
        </div>
        <div />
      </div>

      {/* Drag-drop hint */}
      {dragHint && (
        <div className="text-center mb-1 transition-opacity duration-1000">
          <span className="text-[10px] text-[var(--text-secondary)] bg-[#0d0d14]/60 px-3 py-0.5 rounded-full backdrop-blur-sm">
            Drag &amp; drop GeoJSON, KML, or WKT files onto the map
          </span>
        </div>
      )}
    </div>
  )
})
