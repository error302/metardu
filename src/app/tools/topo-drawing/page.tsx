import dynamic from 'next/dynamic'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'
import { PageHeader } from '@/components/shared/PageHeader'

const TopoDrawingComposer = dynamic(() => import('@/components/topo/TopoDrawingComposer'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-[var(--text-muted)]">Loading Topo Drawing Composer…</div>,
})

export default function TopoDrawingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="Topographic Drawing Composer" subtitle="Assign feature codes to survey points and produce professional DXF topographic drawings with proper layers, symbols, and sheet layout. Referenced from Survey of Kenya Topographic Mapping Standards, ASPRS Guidelines 2023, OGC ISO 19125." />
      <div className="mb-6">
        <MobileDesktopNotice>
          Feature coding and DXF drawing review are desktop-first tasks. On mobile, use this for small checks; use desktop before final CAD export.
        </MobileDesktopNotice>
      </div>
      <TopoDrawingComposer />
    </div>
  )
}
