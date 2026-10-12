'use client'

import { useEffect, useState } from 'react'
import { LoadingScreen } from '@/components/shared/LoadingScreen'

/** Explicit design preview only. Real navigation uses the route loading boundary. */
export function StartupSplash() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(new URLSearchParams(window.location.search).get('splash') === '1') }, [])
  if (!visible) return null
  return <div onClick={() => setVisible(false)}><LoadingScreen message="Loading preview" subMessage="Preview only. Click to close." /><button onClick={() => setVisible(false)} className="fixed right-6 top-6 z-[101] rounded border border-white/30 px-4 py-2 text-white">Close preview</button></div>
}
