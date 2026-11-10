'use client';

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import StatutoryWorkbookBuilder from '@/components/StatutoryWorkbookBuilder'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function StatutoryWorkbookPage() {
  return <Suspense fallback={<p role="status">Loading workbook…</p>}><WorkbookPageContent /></Suspense>
}

function WorkbookPageContent() {
  const { t } = useLanguage()
  const projectId = useSearchParams().get('projectId') || undefined
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.statutoryWorkbook')}
        subtitle={t('tools.statutoryWorkbookDesc')}
      />
      <StatutoryWorkbookBuilder key={projectId || 'template'} projectId={projectId} />
    </main>
  )
}
