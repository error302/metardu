'use client';

import BillableDocumentsBuilder from '@/components/BillableDocumentsBuilder'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function BillableDocumentsPage() {
  const { t } = useLanguage()
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.billableDocuments')}
        subtitle={t('tools.billableDocumentsDesc')}
      />
      <BillableDocumentsBuilder />
    </main>
  )
}
