import BillableDocumentsBuilder from '@/components/BillableDocumentsBuilder'
import { PageHeader } from '@/components/shared/PageHeader'

export default function BillableDocumentsPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Billable Survey Documents"
        subtitle="Project, valuation, registry, road reserve, and environmental support documents for client-ready survey work."
      />
      <BillableDocumentsBuilder />
    </main>
  )
}
