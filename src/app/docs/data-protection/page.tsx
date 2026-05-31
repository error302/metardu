import Link from 'next/link'

const sections = [
  {
    title: 'Data controller',
    body: 'METARDU, operated from Kenya, is the data controller for all personal and survey data processed through the platform. As a data controller, METARDU determines the purposes and means of processing user data, including survey coordinates, project records, and billing information. For inquiries regarding data processing, contact support@metardu.app.',
  },
  {
    title: 'Legal basis for processing',
    body: 'METARDU processes user data under the following legal bases: (1) Contractual necessity — providing the survey computation, document generation, and project management services you subscribe to; (2) Legitimate interest — maintaining platform security, preventing fraud, improving service quality, and complying with professional surveying regulations; (3) Consent — where you provide optional information such as feedback or enable location services on mobile; (4) Legal obligation — where Kenyan law requires retention of certain records, including audit trails and financial transactions under the Survey Act Cap 299 and related regulations.',
  },
  {
    title: 'Data protection principles',
    body: 'METARDU adheres to the following data protection principles: Lawfulness, fairness, and transparency — we only process data for stated purposes; Purpose limitation — data collected for survey computation is not repurposed for unrelated activities; Data minimization — we collect only what is necessary to provide the service; Accuracy — users can update their profile and project data at any time; Storage limitation — data is retained only while the account is active or as required by law; Integrity and confidentiality — all data is protected by access controls, encryption in transit, and row-level security policies.',
  },
  {
    title: 'Categories of personal data',
    body: 'We process the following categories of personal data: Identity data (full name, email, ISK/EBK registration number); Professional data (firm name, license number, surveyor role); Account data (authentication credentials, session tokens, subscription status); Project data (survey coordinates, field observations, computed results, generated documents); Financial data (payment history, billing records, payment method identifiers); Technical data (IP addresses, browser type, device information, error logs). Survey coordinates and project data are owned by the surveyor and treated as professional work product.',
  },
  {
    title: 'Cross-border data transfers',
    body: 'METARDU is hosted on servers that may process data outside Kenya. Where data is transferred internationally, we ensure appropriate safeguards are in place, including encryption in transit (TLS 1.3), encryption at rest, and contractual protections with service providers. Kenyan surveyors should be aware that survey data submitted to the platform may be processed on infrastructure located in other jurisdictions, but is always protected by the access controls and encryption measures described in this policy.',
  },
  {
    title: 'Your rights',
    body: 'You have the right to: Access — request a copy of your personal data; Rectification — correct inaccurate data; Erasure — request deletion of your data, subject to legal retention requirements; Portability — export your project data, survey results, and generated documents in standard formats; Restriction — limit how we process your data in certain circumstances; Objection — object to processing based on legitimate interest. To exercise these rights, contact support@metardu.app. We will respond within 30 days.',
  },
  {
    title: 'Data retention',
    body: 'Active account data is retained for the duration of the account. Upon account deletion, personal data is removed within 30 days, except where retention is required by Kenyan law or professional regulations. Financial records are retained for 7 years as required by Kenyan tax law. Audit logs are retained for 5 years. Survey project data is deleted upon request unless subject to legal hold. Deleted data is purged from backups within 90 days.',
  },
  {
    title: 'Data breach notification',
    body: 'In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, METARDU will notify affected users within 72 hours of becoming aware of the breach. Notifications will include the nature of the breach, categories of data affected, and measures taken. We will also notify the Office of the Data Protection Commissioner (ODPC) where required under the Data Protection Act, 2019 of Kenya.',
  },
  {
    title: 'Contact',
    body: 'For data protection inquiries, data subject access requests, or to report a data protection concern, contact our Data Protection Officer at dpo@metardu.app or write to: METARDU Data Protection, P.O. Box Nairobi, Kenya. You also have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC) in Kenya.',
  },
]

export default function DataProtectionPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/docs" className="mb-8 inline-block text-[var(--accent)] hover:underline">
          Back to Documentation
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">Legal</p>
        <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)]">Data Protection Policy</h1>
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
