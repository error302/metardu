import Link from 'next/link'

const sections = [
  {
    title: 'What are cookies',
    body: 'Cookies are small text files stored on your device when you visit METARDU. They help us provide, secure, and improve our services. Similar technologies include localStorage and sessionStorage, which are used by our Progressive Web App (PWA) for offline data caching and session management. This policy covers all these technologies.',
  },
  {
    title: 'Essential cookies',
    body: 'These cookies are strictly necessary for the platform to function and cannot be disabled: Session token — stores your NextAuth JWT authentication state, allowing you to stay logged in as you navigate between pages; CSRF token — prevents cross-site request forgery attacks on state-changing operations; Locale preference — stores your language and region settings for the next-intl internationalization system. Without these cookies, you cannot log in, use the platform, or perform any authenticated actions.',
  },
  {
    title: 'Functional cookies',
    body: 'These cookies enable enhanced functionality and personalization: Theme preference — stores your light/dark mode selection; Map preferences — stores your preferred basemap, zoom level, and map center between sessions; Recent projects — remembers your recently accessed projects for quick navigation; Offline data — stores field survey observations captured in the mobile PWA for later synchronization. These cookies can be disabled, but some features may not work correctly.',
  },
  {
    title: 'Analytics cookies',
    body: 'We use minimal, privacy-respecting analytics to understand platform usage and improve performance: Performance metrics — page load times and error rates collected via Sentry (if enabled), with IP addresses stripped; Aggregate usage — counts of feature usage (e.g., number of traverse computations) with no personal identifiers. We do not use third-party tracking cookies, advertising cookies, or social media tracking pixels. If Sentry error monitoring is configured, crash reports may include anonymized stack traces.',
  },
  {
    title: 'Service worker and offline storage',
    body: 'METARDU operates as a Progressive Web App (PWA). When you install or use the PWA: A service worker is registered to cache application assets for offline use and faster loading; IndexedDB stores offline field survey data (beacons, parcels, coordinates) that you capture in the field; Cache API stores map tiles and static assets for offline access. All offline data is stored locally on your device and is only synchronized with the server when you explicitly trigger a sync. You can clear offline data through your browser settings or by clearing site data.',
  },
  {
    title: 'Third-party services',
    body: 'The following third-party services may set their own cookies when you interact with them: Payment providers — Stripe, PayPal, and M-Pesa may set cookies during the checkout process on their own domains. These are governed by their respective privacy policies; Map tiles — OpenStreetMap, ArcGIS, and CartoCDN serve map tiles and may log tile requests with IP addresses; Fonts — Google Fonts may set cookies when loading web fonts. We minimize third-party cookie usage and do not integrate advertising or social media tracking.',
  },
  {
    title: 'Managing cookies',
    body: 'You can manage or delete cookies through your browser settings: Chrome — Settings > Privacy and Security > Cookies; Firefox — Settings > Privacy & Security > Cookies; Safari — Preferences > Privacy > Manage Website Data; Mobile browsers — vary by platform. Note that deleting essential cookies will log you out of METARDU and you will need to sign in again. Disabling all cookies will prevent the platform from functioning correctly.',
  },
  {
    title: 'Updates to this policy',
    body: 'We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated effective date. If we make significant changes, we will notify you through the platform or by email. Continued use of METARDU after changes constitutes acceptance of the updated policy.',
  },
  {
    title: 'Contact',
    body: 'For questions about our use of cookies and similar technologies, contact support@metardu.app.',
  },
]

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/docs" className="mb-8 inline-block text-[var(--accent)] hover:underline">
          Back to Documentation
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">Legal</p>
        <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)]">Cookie Policy</h1>
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
