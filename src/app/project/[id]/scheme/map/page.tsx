'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'

const SchemeMapCanvas = dynamic(() => import('./SchemeMapCanvas'), {
  ssr: false,
  loading: () => null,
})

export default function SchemeMapPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [parcelCount, setParcelCount] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    setParcelCount(0)
  }, [projectId])

  const handleReady = useCallback((count: number) => {
    setParcelCount(count)
    setLoading(false)
    setError('')
  }, [])
  const handleError = useCallback((message: string) => {
    setError(message)
    setLoading(false)
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={`/project/${projectId}/scheme`} aria-label="Back to scheme" className="rounded-lg p-2 transition-colors hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Scheme Map</h1>
            <p className="text-sm text-gray-400">
              {loading ? 'Loading parcels…' : `${parcelCount} parcels shown`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/api/scheme/export/geojson?project_id=${encodeURIComponent(projectId)}`} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700">
            <Download className="h-4 w-4" />
            GeoJSON
          </a>
          <a href={`/api/scheme/export/dxf?project_id=${encodeURIComponent(projectId)}`} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700">
            <Download className="h-4 w-4" />
            DXF
          </a>
        </div>
      </div>

      {error && (
        <div role="alert" className="mx-6 mt-4 rounded-lg border border-red-800 bg-red-900/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="relative" style={{ height: 'calc(100vh - 80px)' }}>
        <SchemeMapCanvas projectId={projectId} onReady={handleReady} onError={handleError} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/60">
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading scheme parcels…
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
