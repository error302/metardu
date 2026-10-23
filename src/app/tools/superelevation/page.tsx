'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import Calculator from '@/components/road-design/SuperelevationCalculator'

export default function Page() {
  const { t } = useLanguage()
  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <PageHeader title={t('tools.superelevation')} subtitle="Banking and crossfall rotation against declared project criteria" />
    <Calculator />
  </div>
}
