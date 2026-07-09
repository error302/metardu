'use client'
/**
 * MapCoordSearch — Coordinate search input overlay
 *
 * T1.5g FIX (2026-07-10): Migrated from raw absolute positioning to
 * MapOverlaySlot. Previously used 'absolute top-3 left-[344px] z-20'
 * which overflowed on mobile (the 344px magic number assumed the left
 * dock was always open at 260px + 84px margin). Now anchored at
 * top-left with order=5 (below the hamburger toggle).
 */

import React, { memo, useState, useCallback } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { MapOverlaySlot } from '@/app/map/components/MapOverlayManager'

export const MapCoordSearch = memo(function MapCoordSearch() {
  const { handleCoordSearch, isMobile, panelOpen } = useMapContext()
  const [searchInput, setSearchInput] = useState('')

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return
    await handleCoordSearch(searchInput)
    setSearchInput('')
  }, [searchInput, handleCoordSearch])

  return (
    <MapOverlaySlot id="coord-search" anchor="top-left" order={5} layer="CONTROLS" edgeMargin={12}>
      <div className="relative" style={{ marginLeft: (!isMobile && panelOpen) ? '260px' : '0px' }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          aria-label="Search coord, beacon, or parcel" placeholder="Search coord, beacon, or parcel"
          className="h-8 bg-[#0d0d14]/90 backdrop-blur-xl border border-[var(--border-color)]/[0.06] rounded-lg pl-7 pr-3 text-[11px] text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[#D17B47]/30 transition-colors w-[140px] sm:w-[200px] md:w-[280px]"
        />
        <button
          onClick={handleSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[#D17B47] transition-colors"
          title="Search"
        >
          <SearchIcon className="w-3.5 h-3.5" />
        </button>
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
      </div>
    </MapOverlaySlot>
  )
})
