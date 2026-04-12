'use client'

import TraverseFieldBook from '@/components/TraverseFieldBook'

export default function TraverseFieldBookPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Traverse Field Book</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Raw field data reduction and traverse computation | Survey Act Cap 299 | RDM 1.1 (2025)
      </p>
      <TraverseFieldBook projectId="" />
    </div>
  )
}
