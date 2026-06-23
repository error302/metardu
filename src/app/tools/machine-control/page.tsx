'use client';

import MachineControlExportPanel from '@/components/engineering/MachineControlExportPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function MachineControlPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title={t('tools.machineControl')} subtitle={t('tools.machineControlDesc')} />
      <MachineControlExportPanel />
    </div>
  )
}
