'use client';

import StatutoryWorkbookBuilder from '@/components/StatutoryWorkbookBuilder'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function StatutoryWorkbookPage() {
  const { t } = useLanguage()
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.statutoryWorkbook')}
        subtitle={t('tools.statutoryWorkbookDesc')}
      />
      <StatutoryWorkbookBuilder />
    </main>
  )
}
