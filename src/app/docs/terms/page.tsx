import Link from 'next/link'

const sections = [
  {
    title: 'Use of METARDU',
    body:
      'METARDU provides survey computation, field collection, mapping, project management, and document generation tools for professional and educational use. Users are responsible for confirming that outputs are appropriate for their jurisdiction and project requirements.',
  },
  {
    title: 'Professional responsibility',
    body:
      'Generated calculations, drawings, certificates, schedules, and reports must be reviewed by a qualified professional before submission, construction, registration, or legal use.',
  },
  {
    title: 'User content',
    body:
      'Users retain responsibility for the coordinates, photos, documents, notes, and project data they upload or create. Users must have permission to process and share any personal, land, client, or field data entered into the platform.',
  },
  {
    title: 'Mobile and offline workflows',
    body:
      'Some mobile functions depend on device permissions, network quality, browser support, storage availability, and GPS accuracy. Desktop use is recommended for final review, official drawings, large tables, ZIP packages, and statutory submissions.',
  },
  {
    title: 'Payments and subscriptions',
    body:
      'Paid features may require an active subscription or successful payment. Billing questions can be sent to billing@metardu.app.',
  },
  {
    title: 'Availability',
    body:
      'We work to keep METARDU reliable, but the service may be unavailable during maintenance, network disruption, dependency failure, or emergency security work.',
  },
  {
    title: 'Contact',
    body:
      'For support, account, or terms questions, contact support@metardu.app.',
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/docs" className="mb-8 inline-block text-[var(--accent)] hover:underline">
          Back to Documentation
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">Legal</p>
        <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)]">Terms of Service</h1>
        <p className="mb-10 text-[var(--text-secondary)]">Effective date: May 12, 2026</p>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
              <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">{section.title}</h2>
              <p className="leading-7 text-[var(--text-secondary)]">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
