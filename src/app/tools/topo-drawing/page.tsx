'use client';

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const TopoDrawingComposer = dynamic(() => import('@/components/topo/TopoDrawingComposer'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-[var(--text-muted)]">Loading Topo Drawing Composer…</div>,
})

export default function TopoDrawingPage() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || undefined

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title={t('tools.topoDrawing')} subtitle={t('tools.topoDrawingDesc')} />
      <div className="mb-6">
        <MobileDesktopNotice>
          Feature coding and DXF drawing review are desktop-first tasks. On mobile, use this for small checks; use desktop before final CAD export.
        </MobileDesktopNotice>
      </div>
      <TopoDrawingComposer projectId={projectId} />
    </div>
  )
}
