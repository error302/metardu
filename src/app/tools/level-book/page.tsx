'use client';

import { PageHeader } from '@/components/shared/PageHeader'
import LevelBook from '@/components/LevelBook'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function LevelBookPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.levelBook')}
        subtitle={t('tools.levelBookDesc')}
        reference="RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299 | Survey Regulations 1994"
      />
      <LevelBook />
    </div>
  )
}
