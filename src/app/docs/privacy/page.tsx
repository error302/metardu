import Link from 'next/link'

const sections = [
  {
    title: 'Information we collect',
    body:
      'METARDU collects account details, project records, survey coordinates, field observations, uploaded files, generated documents, billing status, device diagnostics, and feedback that users choose to submit. Mobile field tools may use location, camera, file, and offline storage features when a user starts those workflows.',
  },
  {
    title: 'How we use information',
    body:
      'We use this information to provide survey calculations, project workspaces, document generation, offline field capture, account security, billing, support, audit history, and product reliability improvements.',
  },
  {
    title: 'Location and field data',
    body:
      'Location data is used to capture survey observations, support mapping workflows, and synchronize field records with the user project. Users should only capture coordinates, photos, and notes they are authorized to process.',
  },
  {
    title: 'Sharing',
    body:
      'We do not sell user project data. We may share limited information with service providers that operate hosting, storage, authentication, payments, email, analytics, crash reporting, and support systems, or when required by law.',
  },
  {
    title: 'Retention and deletion',
    body:
      'Project and account records are kept while the account is active or as needed for legal, billing, audit, and support purposes. Users can request export or deletion of account data by contacting support.',
  },
  {
    title: 'Security',
    body:
      'We use access controls, authentication, audit logging, encrypted transport, and scoped storage practices to protect survey records. No online system can be guaranteed completely secure, so users should keep account credentials private.',
  },
  {
    title: 'Contact',
    body:
      'For privacy questions, data export, correction, or deletion requests, contact support@metardu.app.',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/docs" className="mb-8 inline-block text-[var(--accent)] hover:underline">
          Back to Documentation
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">Legal</p>
        <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)]">Privacy Policy</h1>
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
