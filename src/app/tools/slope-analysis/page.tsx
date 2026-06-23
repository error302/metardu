'use client';

import { PageHeader } from '@/components/shared/PageHeader'
import SlopeAnalysisPanel from '@/components/engineering/SlopeAnalysisPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function SlopeAnalysisPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.slopeAnalysis')}
        subtitle={t('tools.slopeAnalysisDesc')}
      />
      <SlopeAnalysisPanel />
    </div>
  )
}
