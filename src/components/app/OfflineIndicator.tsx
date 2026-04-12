'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const updateStatus = () => setIsOffline(!navigator.onLine)
    updateStatus()

    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

  // Auto-dismiss when coming back online
  useEffect(() => {
    if (!isOffline) setDismissed(false)
  }, [isOffline])

  if (!isOffline || dismissed) return null

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[200] bg-amber-600 text-black text-center text-sm font-semibold py-2 px-4 flex items-center justify-center gap-3"
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
        />
      </svg>
      <span>You&apos;re offline — calculations still work</span>
      <Link
        href="/offline"
        className="underline underline-offset-2 font-bold hover:text-amber-900 transition-colors"
      >
        Details
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 hover:bg-amber-700 rounded p-0.5 transition-colors"
        aria-label="Dismiss offline indicator"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
