import StatutoryWorkbookBuilder from '@/components/StatutoryWorkbookBuilder'

export default function StatutoryWorkbookPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Statutory Computation Workbook</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Generate the 9-sheet field abstract and computation workbook used for formal survey submissions.
      </p>
      <StatutoryWorkbookBuilder />
    </main>
  )
}
