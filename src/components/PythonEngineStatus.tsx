'use client'

import { useState, useEffect } from 'react'

type Status = 'checking' | 'online' | 'offline'

export default function PythonEngineStatus() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        // The compute route returns info even when Python is down (it falls back)
        const res = await fetch('/api/compute', { method: 'GET' })
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  if (status === 'checking' || status === 'online') return null

  return (
    <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-sm">
      <svg className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      <div>
        <p className="text-yellow-400 font-medium">Advanced compute engine offline</p>
        <p className="text-yellow-600 text-xs mt-0.5">
          TIN, contours, and raster analysis will use the fallback TS engine. 
          Set <code className="bg-yellow-500/10 px-1 rounded">PYTHON_COMPUTE_URL</code> to enable full precision processing.
        </p>
      </div>
    </div>
  )
}
