'use client';

import MutationPlanGenerator from '@/components/mutationplan/MutationPlanGenerator'
import { MapPinned } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function MutationPlanPage() {
  const { t } = useLanguage()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-amber-500/10 rounded-lg">
          <MapPinned className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('tools.mutationPlan')}</h1>
          <p className="text-sm text-zinc-400">
            {t('tools.mutationPlanDesc')}
          </p>
        </div>
      </div>
      <MutationPlanGenerator />
    </div>
  )
}
