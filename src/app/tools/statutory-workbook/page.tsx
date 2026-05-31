import StatutoryWorkbookBuilder from '@/components/StatutoryWorkbookBuilder'
import { PageHeader } from '@/components/shared/PageHeader'

export default function StatutoryWorkbookPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Statutory Computation Workbook"
        subtitle="Generate the 9-sheet field abstract and computation workbook used for formal survey submissions."
      />
      <StatutoryWorkbookBuilder />
    </main>
  )
}
