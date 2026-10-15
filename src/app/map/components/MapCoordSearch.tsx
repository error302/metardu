'use client'
/**
 * MapCoordSearch — Coordinate search input overlay
 *
 * Now reads handleCoordSearch from MapReactContext via useMapContext().
 * Lives in the workspace header. Accepts lat/lon, DMS, or UTM coordinates.
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
    <form className="map-coordinate-search" role="search" aria-label="Map location" onSubmit={(event) => { event.preventDefault(); void handleSearch() }}>
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Lat, lon · MGRS, beacon or parcel…"
          aria-label="Search Lat/Lon, UTM, MGRS, beacon, or parcel"
          className="map-search-input"
        />
        <button
          type="submit"
          aria-label="Search map location"
          className="map-search-submit"
          title="Search"
        >
          <SearchIcon className="w-3.5 h-3.5" />
        </button>
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
      </div>
    </form>
  )
})
