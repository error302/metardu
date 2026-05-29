import TopoDrawingComposer from '@/components/topo/TopoDrawingComposer'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'

export default function TopoDrawingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Topographic Drawing Composer</h1>
        <p className="text-[var(--text-muted)] mt-2">
          Assign feature codes to survey points and produce professional DXF topographic drawings with proper layers, symbols, and sheet layout.
          Referenced from Survey of Kenya Topographic Mapping Standards, ASPRS Guidelines 2023, OGC ISO 19125.
        </p>
      </div>
      <div className="mb-6">
        <MobileDesktopNotice>
          Feature coding and DXF drawing review are desktop-first tasks. On mobile, use this for small checks; use desktop before final CAD export.
        </MobileDesktopNotice>
      </div>
      <TopoDrawingComposer />
    </div>
  )
}
