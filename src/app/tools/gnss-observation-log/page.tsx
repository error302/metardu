'use client';

import GNSSLogBuilder from '@/components/gnss/GNSSLogBuilder'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function GNSSObservationLogPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title={t('tools.gnssObservationLog')} subtitle={t('tools.gnssObservationLogDesc')} reference="Survey Act Cap 299  |  Survey Regulations 1994, Reg. 21  |  ISK GNSS Best Practice Guidelines 2019  |  ISO 17123-8" />
      <GNSSLogBuilder />
    </div>
  )
}
