'use client';

import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import SlopeAnalysisPanel from '@/components/engineering/SlopeAnalysisPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function SlopeAnalysisPage() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || undefined

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.slopeAnalysis')}
        subtitle={t('tools.slopeAnalysisDesc')}
      />
      <SlopeAnalysisPanel projectId={projectId} />
    </div>
  )
}
