'use client'
/**
 * MapNotifications — Toast-style notification overlays for import/save messages
 *
 * Positioned at top center, auto-dismiss via parent timeout.
 * Memoized for performance.
 */

import React, { memo } from 'react'

interface MapNotificationsProps {
  importMsg: string
  saveMsg: string
}

export const MapNotifications = memo(function MapNotifications({
  importMsg,
  saveMsg,
}: MapNotificationsProps) {
  return (
    <>
      {importMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#E8841A] text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold">
          {importMsg}
        </div>
      )}
      {saveMsg && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold ${
          saveMsg.startsWith('Error') ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {saveMsg}
        </div>
      )}
    </>
  )
})
