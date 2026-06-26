'use client';

import { PageHeader } from '@/components/shared/PageHeader'
import SettingOutCalculator from '@/components/setting-out/SettingOutCalculator'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function SettingOutPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.settingOut')}
        subtitle={t('tools.settingOutDesc')}
      />
      <SettingOutCalculator />
    </div>
  )
}
