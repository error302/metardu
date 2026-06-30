'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AlertCircle } from 'lucide-react'

const DataCleaner = dynamic(
  () => import('@/components/fieldguard/DataCleaner'),
  { ssr: false, loading: () => <div className="p-8">Loading...</div> }
)

export default function FieldGuardPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || ''
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    setShowWarning(!projectId)
  }, [projectId])

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">FieldGuard AI</h1>

      {showWarning && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">
            No project selected. Pass a project ID via the URL: <code className="font-mono">/fieldguard?project=YOUR_PROJECT_ID</code>
          </p>
        </div>
      )}

      {projectId && <DataCleaner projectId={projectId} />}
    </div>
  )
}
