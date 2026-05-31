import Link from 'next/link'

const sections = [
  {
    title: '1. Introduction',
    body: `This Privacy Policy describes how METARDU ("we", "us", or "our") collects, uses, discloses, stores, and protects your personal data when you use our survey computation, field collection, mapping, project management, and document generation platform ("the Platform"). This policy is made in accordance with the Data Protection Act, 2019 of Kenya ("KDPA") and applies to all users of the Platform, including individual surveyors, firms, and team members. We are committed to protecting your privacy and ensuring that your personal data is processed lawfully, fairly, and transparently. This policy should be read alongside our Data Protection Policy at /docs/data-protection, which provides additional detail on our data protection practices, your rights under Kenyan law, and our compliance framework.`,
  },
  {
    title: '2. Data Controller',
    body: `METARDU, operated from Kenya, is the data controller for all personal data processed through the Platform. As the data controller, we determine the purposes and means of processing your personal data. Our Data Protection Officer can be reached at dpo@metardu.app for all inquiries related to data protection, data subject access requests, and complaints. You also have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC) of Kenya at any time. Our registered address for data protection correspondence is: METARDU Data Protection, P.O. Box Nairobi, Kenya.`,
  },
  {
    title: '3. Information We Collect',
    body: `We collect the following categories of personal data: (a) Identity and account data — full name, email address, phone number, password (hashed), profile picture, and account preferences. (b) Professional data — ISK/EBK registration number, firm name, license number, surveyor role, and professional verification documents. (c) Project and survey data — survey coordinates, field observations, computed results, generated documents, traverse data, level observations, parcel boundaries, beacon positions, and all related survey information that you create or upload. (d) Client data — client names, ID numbers, addresses, and land ownership information that you enter in connection with your survey projects. (e) Financial data — payment history, billing records, subscription status, payment method identifiers (card tokens, M-Pesa phone numbers, PayPal account identifiers), and transaction details. (f) Technical data — IP addresses, browser type and version, operating system, device identifiers, screen resolution, and access times. (g) Location data — GPS coordinates captured during mobile field workflows, when you explicitly enable location services. (h) Usage data — feature usage patterns, page views, click patterns, session duration, and error reports. (i) Communication data — support tickets, feedback submissions, and correspondence with our team. Mobile field tools may access device camera, file storage, GPS, and Bluetooth (for GNSS receivers) only when you explicitly start those workflows and grant the relevant permissions.`,
  },
  {
    title: '4. Legal Basis for Processing',
    body: `We process your personal data under the following legal bases as required by the KDPA: (a) Contractual necessity — processing your data is necessary to perform our contract with you, including providing survey computation, document generation, project management, and field collection services that you subscribe to. (b) Legitimate interest — we process data for purposes including platform security, fraud prevention, service improvement, bug fixing, and compliance with professional surveying regulations, where such processing does not override your rights and freedoms. (c) Consent — where you provide optional information such as feedback, enable location services on mobile, or opt in to marketing communications. You may withdraw consent at any time by contacting dpo@metardu.app. (d) Legal obligation — where Kenyan law requires us to retain certain records, including audit trails, financial transactions, and tax records under the Survey Act Cap 299, the Kenya Revenue Authority Act, and the Companies Act. Where we rely on consent, we will clearly inform you at the point of collection and you may withdraw consent without affecting the lawfulness of processing carried out before withdrawal.`,
  },
  {
    title: '5. How We Use Your Information',
    body: `We use your personal data for the following purposes: (a) To provide, maintain, and improve the Platform's survey computation, field collection, mapping, and document generation services. (b) To process subscriptions and payments, issue invoices, and manage your account. (c) To authenticate your identity, verify your professional credentials, and secure your account against unauthorized access. (d) To generate survey computations, deed plans, mutation forms, computation sheets, and other documents based on the data you provide. (e) To synchronize field data captured on mobile devices with your cloud-based project workspace. (f) To communicate with you about your account, service updates, security alerts, and support requests. (g) To monitor platform performance, detect and prevent fraud, abuse, and security incidents. (h) To comply with legal obligations, court orders, and regulatory requirements under Kenyan law. (i) To anonymize and aggregate usage data for product improvement and analytical purposes, where such data can no longer identify you. We do not use your survey project data for training machine learning models, selling to third parties, or any purpose unrelated to providing the service.`,
  },
  {
    title: '6. Location and Field Data',
    body: `Location data is collected only when you explicitly enable location services on your mobile device and initiate a field workflow (such as GNSS observation, field walk, or beacon collection). This data is used to capture survey observations, support mapping workflows, and synchronize field records with your project workspace. Location data is stored as part of your project data and is subject to the same access controls and retention policies. You should only capture coordinates, photographs, and notes for land and locations where you are authorized to do so. METARDU does not track your location in the background or when you are not actively using field collection features. GNSS observations from external receivers are transmitted via Bluetooth only with your explicit pairing action, and are not shared with METARDU servers unless you choose to sync them to your project.`,
  },
  {
    title: '7. Data Sharing and Sub-Processors',
    body: `We do not sell, rent, or trade your personal data or survey project data to third parties. We may share limited categories of data with the following types of service providers who assist us in operating the Platform: (a) Cloud hosting providers — for server infrastructure, data storage, and application hosting (currently Google Cloud Platform). (b) Payment processors — Stripe, PayPal, and M-Pesa (Safaricom Daraja API) for processing subscription payments; these providers receive only the payment data necessary to complete your transaction. (c) Mapping tile providers — OpenStreetMap, Esri, and CartoDB for map imagery; these providers receive map viewport coordinates but not your survey project data. (d) Error monitoring services — Sentry for application error tracking; we configure Sentry to scrub API keys, authentication tokens, and sensitive parameters from error reports. (e) Email services — for transactional emails such as account verification, password reset, and billing receipts. All sub-processors are bound by data processing agreements that require them to protect your data in accordance with the KDPA and applicable data protection laws. We maintain a current list of sub-processors and will notify you of material changes. You may request a copy of our sub-processor list by contacting dpo@metardu.app. We may also disclose data when required by law, court order, or regulatory request from Kenyan authorities.`,
  },
  {
    title: '8. Cross-Border Data Transfers',
    body: `METARDU is hosted on cloud infrastructure that may process data outside Kenya. Where personal data is transferred internationally, we ensure appropriate safeguards are in place in accordance with Section 66 of the KDPA, including: (a) Encryption in transit using TLS 1.3 or higher for all data communications. (b) Encryption at rest for all stored data. (c) Contractual protections with service providers that meet Kenyan data protection standards. (d) Row-level security policies and access controls that restrict data access to authorized personnel only. Kenyan surveyors should be aware that survey data submitted to the Platform may be processed on infrastructure located in other jurisdictions, but is always protected by the access controls and encryption measures described in this policy. We will not transfer your data to jurisdictions that do not provide adequate data protection without ensuring appropriate safeguards are in place.`,
  },
  {
    title: '9. Your Rights Under the KDPA',
    body: `Under the Data Protection Act, 2019 of Kenya, you have the following rights: (a) Right of access — you may request a copy of your personal data that we hold. (b) Right to rectification — you may request correction of inaccurate or incomplete personal data. (c) Right to erasure — you may request deletion of your personal data, subject to legal retention requirements such as financial records (7 years under Kenyan tax law) and audit logs (5 years). (d) Right to data portability — you may request export of your project data, survey results, and generated documents in standard formats (GeoJSON, DXF, CSV, PDF). (e) Right to restriction — you may request that we limit the processing of your data in certain circumstances. (f) Right to object — you may object to processing based on legitimate interest. (g) Right not to be subject to automated decision-making — METARDU does not make solely automated decisions with legal effects concerning you. Survey computations are mathematical tools that require your professional judgment and verification. (h) Right to withdraw consent — where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing carried out before withdrawal. To exercise any of these rights, contact our Data Protection Officer at dpo@metardu.app. We will respond to your request within 30 days. You also have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC) of Kenya.`,
  },
  {
    title: '10. Data Retention',
    body: `We retain your personal data for as long as necessary to fulfill the purposes for which it was collected: (a) Active account data is retained for the duration of your account. (b) Upon account deletion, personal data is removed within 30 days, except where retention is required by Kenyan law. (c) Financial records are retained for 7 years as required by the Kenya Revenue Authority Act. (d) Audit logs are retained for 5 years in accordance with professional surveying record-keeping requirements. (e) Survey project data is retained while your account is active and for 90 days after account deletion to allow for potential reactivation. After this period, project data is permanently deleted. (f) Deleted data is purged from backup systems within 90 days. (g) Anonymized and aggregated data that can no longer identify you may be retained indefinitely for analytical purposes. You may request earlier deletion of your data by contacting dpo@metardu.app, subject to legal retention obligations.`,
  },
  {
    title: '11. Data Security',
    body: `We implement the following technical and organizational measures to protect your personal data: (a) Encryption in transit (TLS 1.3) and at rest for all data storage. (b) Row-level security policies that ensure each user can only access their own data. (c) Multi-factor authentication support for account security. (d) Regular security audits and dependency vulnerability scanning. (e) Access controls limiting data access to authorized personnel on a need-to-know basis. (f) Audit logging of all data access and modifications. (g) API key scrubbing in error monitoring systems to prevent credential exposure. (h) Automated backup with encryption and integrity verification. No online system can be guaranteed completely secure. We encourage you to use strong, unique passwords, enable multi-factor authentication, and keep your account credentials private. You are responsible for all activities that occur under your account.`,
  },
  {
    title: '12. Data Breach Notification',
    body: `In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will: (a) Notify affected users within 72 hours of becoming aware of the breach, as required by the KDPA. (b) Notify the Office of the Data Protection Commissioner (ODPC) within 72 hours as required by Section 43 of the Data Protection Act, 2019. (c) Include in our notification: the nature of the breach, the categories and approximate number of data subjects affected, the likely consequences, and the measures taken or proposed to address the breach. (d) Provide guidance on steps you can take to protect yourself. If you become aware of a potential data breach involving the Platform, please report it immediately to security@metardu.app.`,
  },
  {
    title: '13. Children\'s Data',
    body: `The Platform is designed for use by licensed professional surveyors and is not intended for use by individuals under the age of 18. We do not knowingly collect personal data from children. If we become aware that we have collected personal data from a person under the age of 18, we will take steps to delete such data promptly. If you believe that a child has provided us with personal data, please contact dpo@metardu.app.`,
  },
  {
    title: '14. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. Material changes will be communicated by: (a) posting the updated policy on the Platform with a revised "Effective date"; (b) sending an email notification to the address associated with your account; or (c) displaying a prominent notice within the Platform. Material changes will take effect 30 days after such notice. We encourage you to review this policy periodically. Your continued use of the Platform after any changes constitutes acceptance of the revised policy.`,
  },
  {
    title: '15. Contact',
    body: `For privacy questions, data subject access requests, data export, correction, or deletion, contact our Data Protection Officer at dpo@metardu.app. For general support, contact support@metardu.app. For security concerns, contact security@metardu.app. You have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC) of Kenya at any time regarding our processing of your personal data.`,
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
        <p className="mb-10 text-[var(--text-secondary)]">Effective date: May 22, 2026</p>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
              <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">{section.title}</h2>
              <p className="leading-7 text-[var(--text-secondary)]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Related Policies</h2>
          <ul className="space-y-2 text-[var(--text-secondary)]">
            <li><Link href="/docs/terms" className="text-[var(--accent)] hover:underline">Terms of Service</Link></li>
            <li><Link href="/docs/data-protection" className="text-[var(--accent)] hover:underline">Data Protection Policy</Link></li>
            <li><Link href="/docs/refund" className="text-[var(--accent)] hover:underline">Refund Policy</Link></li>
            <li><Link href="/docs/cookies" className="text-[var(--accent)] hover:underline">Cookie Policy</Link></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
