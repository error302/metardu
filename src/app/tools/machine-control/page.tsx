import MachineControlExportPanel from '@/components/engineering/MachineControlExportPanel'
import { PageHeader } from '@/components/shared/PageHeader'

export default function MachineControlPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="Machine Control Export" subtitle="Export design points in formats compatible with Trimble, Leica, and Topcon machine control systems for GPS-guided construction equipment. Supports Trimble CSV, Leica GSI-8, Topcon CSV, and Alignment XML formats." />
      <MachineControlExportPanel />
    </div>
  )
}
