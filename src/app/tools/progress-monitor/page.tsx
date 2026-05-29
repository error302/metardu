import ProgressMonitorPanel from '@/components/engineering/ProgressMonitorPanel'

export default function ProgressMonitorPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Construction Progress Monitor</h1>
        <p className="text-[var(--text-muted)] mt-2">
          Track construction progress against programme milestones. Record inspections, attach photos, and generate progress reports for engineers and contractors.
          Referenced from KENHA Supervision Manual, RDM 1.3 §10.
        </p>
      </div>
      <ProgressMonitorPanel projectId="" />
    </div>
  )
}
