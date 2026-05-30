'use client';

import TraverseFieldBook from '@/components/TraverseFieldBook'
import { PageHeader } from '@/components/shared/PageHeader'
import { Suspense } from 'react'

export default function TraverseFieldBookPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Traverse Field Book"
        subtitle="Raw field data reduction and traverse computation | Survey Act Cap 299 | RDM 1.1 (2025)"
      />
      <Suspense fallback={<div className="p-8 text-center text-[var(--text-muted)]">Loading Field Book...</div>}>
        <TraverseFieldBook projectId="" />
      </Suspense>
    </div>
  )
}
