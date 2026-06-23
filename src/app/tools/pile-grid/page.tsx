'use client';

import { PageHeader } from '@/components/shared/PageHeader'
import PileGridPanel from '@/components/engineering/PileGridPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function PileGridPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.pileGrid')}
        subtitle={t('tools.pileGridDesc')}
      />
      <PileGridPanel />
    </div>
  )
}
