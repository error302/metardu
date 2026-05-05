import BillableDocumentsBuilder from '@/components/BillableDocumentsBuilder'

export default function BillableDocumentsPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Billable Survey Documents</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Project, valuation, registry, road reserve, and environmental support documents for client-ready survey work.
      </p>
      <BillableDocumentsBuilder />
    </main>
  )
}
