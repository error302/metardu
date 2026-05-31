'use client'
/**
 * MapCoordSearch — Coordinate search input overlay
 *
 * Positioned top-left on the map. Accepts lat/lon, DMS, or UTM coordinates.
 * Memoized for performance.
 */

import React, { memo, useState, useCallback } from 'react'
import { Search as SearchIcon } from 'lucide-react'

interface MapCoordSearchProps {
  onSearch: (input: string) => Promise<void>
}

export const MapCoordSearch = memo(function MapCoordSearch({
  onSearch,
}: MapCoordSearchProps) {
  const [searchInput, setSearchInput] = useState('')

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return
    await onSearch(searchInput)
    setSearchInput('')
  }, [searchInput, onSearch])

  return (
    <div className="absolute top-3 left-14 z-20 md:left-14">
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Search coordinates (lat, lon / UTM / DMS)"
          className="h-8 bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] rounded-lg pl-7 pr-3 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors w-[160px] sm:w-[200px] md:w-[280px]"
        />
        <button
          onClick={handleSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#E8841A] transition-colors"
          title="Search"
        >
          <SearchIcon className="w-3.5 h-3.5" />
        </button>
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
      </div>
    </div>
  )
})
