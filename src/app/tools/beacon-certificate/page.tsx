'use client';

import BeaconCertificateBuilder from '@/components/BeaconCertificateBuilder'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function BeaconCertificatePage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title={t('tools.beaconCertificate')} subtitle={t('tools.beaconCertificateDesc')} reference="Survey Regulations 1994, Reg. 20  |  Survey Act Cap 299, s.22  |  Cadastral Survey Standards Manual" />
      <BeaconCertificateBuilder />
    </div>
  )
}
