'use client'

/**
 * OfflineDownloadButton — Floating button on the map for quick tile download
 *
 * Shows a prominent button that lets surveyors pre-cache map tiles
 * for a specific area before going offline (field work).
 */

import { Download, Loader2, Check } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

export function OfflineDownloadButton() {
  const { setOfflineDialogOpen, offlineDialogOpen } = useMapContext()

  return (
    <button
      onClick={() => setOfflineDialogOpen(true)}
      className={`absolute bottom-32 left-3 z-20 flex items-center gap-2 px-3 h-10 rounded-xl backdrop-blur-xl border transition-all duration-200 shadow-lg ${
        offlineDialogOpen
          ? 'bg-[#D17B47]/15 border-[#D17B47]/30 text-[#D17B47]'
          : 'bg-[#0d0d14]/60 border-[var(--border-color)]/[0.06] text-[var(--text-secondary)] hover:bg-[#0d0d14]/80 hover:text-[var(--text-secondary)]'
      }`}
      title="Download offline map tiles for this area"
    >
      <Download className="w-4 h-4" />
      <span className="text-xs font-medium hidden sm:inline">Offline Tiles</span>
    </button>
  )
}
