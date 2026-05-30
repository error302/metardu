import ProgressMonitorPanel from '@/components/engineering/ProgressMonitorPanel'
import { PageHeader } from '@/components/shared/PageHeader'

export default function ProgressMonitorPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="Construction Progress Monitor" subtitle="Track construction progress against programme milestones. Record inspections, attach photos, and generate progress reports for engineers and contractors. Referenced from KENHA Supervision Manual, RDM 1.3 §10." />
      <ProgressMonitorPanel projectId="" />
    </div>
  )
}
