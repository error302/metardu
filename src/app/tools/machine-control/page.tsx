import MachineControlExportPanel from '@/components/engineering/MachineControlExportPanel'

export default function MachineControlPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Machine Control Export</h1>
        <p className="text-[var(--text-muted)] mt-2">
          Export design points in formats compatible with Trimble, Leica, and Topcon machine control systems for GPS-guided construction equipment.
          Supports Trimble CSV, Leica GSI-8, Topcon CSV, and Alignment XML formats.
        </p>
      </div>
      <MachineControlExportPanel />
    </div>
  )
}
