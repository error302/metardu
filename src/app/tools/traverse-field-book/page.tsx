'use client';

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/shared/PageHeader'
import { Suspense } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const TraverseFieldBook = dynamic(() => import('@/components/TraverseFieldBook'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-[var(--text-muted)]">Loading Field Book…</div>,
})

export default function TraverseFieldBookPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.traverseFieldBook')}
        subtitle={t('tools.traverseFieldBookDesc')}
      />
      <Suspense fallback={<div className="p-8 text-center text-[var(--text-muted)]">Loading Field Book…</div>}>
        <TraverseFieldBook projectId="" />
      </Suspense>
    </div>
  )
}
