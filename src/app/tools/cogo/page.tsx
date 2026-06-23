'use client';

import { PageHeader } from '@/components/shared/PageHeader'
import COGOCalculator from '@/components/cogo/COGOCalculator'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function COGOPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.cogo')}
        subtitle={t('tools.cogoDesc')}
        reference="Survey Act Cap 299 | RDM 1.1 (2025)"
      />
      <COGOCalculator compact />
    </div>
  )
}
