'use client'
/**
 * MapCoordSearch — Coordinate search input overlay
 *
 * Now reads handleCoordSearch from MapReactContext via useMapContext().
 * Positioned top-left on the map. Accepts lat/lon, DMS, or UTM coordinates.
 */

import React, { memo, useState, useCallback } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

export const MapCoordSearch = memo(function MapCoordSearch() {
  const { handleCoordSearch } = useMapContext()
  const [searchInput, setSearchInput] = useState('')

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return
    await handleCoordSearch(searchInput)
    setSearchInput('')
  }, [searchInput, handleCoordSearch])

  return (
    <div className="absolute left-4 right-16 top-14 z-20 md:left-[344px] md:right-auto md:top-3">
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Search Lat/Lon, UTM, MGRS, Beacon..."
          aria-label="Search Lat/Lon, UTM, MGRS, beacon, or parcel"
          className="h-9 w-full rounded-lg border border-[var(--border-color)]/[0.12] bg-[color-mix(in_srgb,var(--bg-secondary)_92%,transparent)] pl-8 pr-9 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] shadow-lg backdrop-blur-xl transition-colors focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] focus:outline-none md:h-8 md:w-[280px] md:text-[11px]"
        />
        <button
          type="button"
          onClick={handleSearch}
          aria-label="Search map location"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          title="Search"
        >
          <SearchIcon className="w-3.5 h-3.5" />
        </button>
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
      </div>
    </div>
  )
})
