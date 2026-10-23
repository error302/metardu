'use client'

import { useState } from 'react'

// Generation is synchronous and uses the currently rendered calculation. There
// is no awaited import that can finish after an input edit and export stale data.
export function RoadDxfExportButton({ createDxf, filename, disabled = false }: { createDxf: () => string; filename: string; disabled?: boolean }) {
  const [error, setError] = useState('')
  function download() {
    setError('')
    let url: string | undefined
    const anchor = document.createElement('a')
    try {
      const content = createDxf()
      url = URL.createObjectURL(new Blob([content], { type: 'application/dxf' }))
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to export this calculation.')
    } finally {
      anchor.remove()
      // Allow the browser to consume the download before releasing the object.
      if (url) { const downloadedUrl = url; setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000) }
    }
  }
  return <div className="space-y-2">
    <button type="button" disabled={disabled} onClick={download} className="px-4 py-2 border border-[var(--border-color)] rounded text-sm disabled:opacity-50">Export Local Draft DXF</button>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </div>
}
