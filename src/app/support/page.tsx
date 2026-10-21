import Link from 'next/link'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Support | METARDU',
  description: 'Get help with METARDU survey tools and the ChatGPT integration preview.',
}

export default function SupportPage() {
  const configuredContact = z.string().email().safeParse(process.env.SUPPORT_EMAIL?.trim())
  const supportEmail = configuredContact.success ? configuredContact.data : null
  return <main className="min-h-screen px-6 py-16 text-[var(--text-primary)]">
    <article className="mx-auto max-w-2xl">
      <p className="text-sm font-mono uppercase tracking-widest text-[var(--accent)]">METARDU / Support</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">How can we help?</h1>
      <p className="mt-5 leading-relaxed text-[var(--text-secondary)]">For account access, survey-tool questions, or help with the ChatGPT integration preview, contact the METARDU support team.</p>
      {supportEmail
        ? <a className="mt-6 inline-block break-all rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-black" href={`mailto:${supportEmail}`}>Email {supportEmail}</a>
        : <p role="status" className="mt-6 rounded-lg border border-[var(--border-color)] p-4 text-[var(--text-secondary)]">Support email is not configured for this deployment. The help and documentation links below remain available.</p>}
      <p className="mt-6 leading-relaxed text-[var(--text-secondary)]">Include the page, what you expected, what happened and the time of the problem. For billing, include the payment reference and status shown. Keep passwords, verification codes and private survey files out of an initial support message.</p>
      <nav aria-label="Support resources" className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link className="text-[var(--accent)] underline" href="/help">Help and workflow guidance</Link>
        <Link className="text-[var(--accent)] underline" href="/docs/chatgpt-integration">ChatGPT integration guide</Link>
        <Link className="text-[var(--accent)] underline" href="/docs/privacy">Privacy policy</Link>
        <Link className="text-[var(--accent)] underline" href="/docs/terms">Terms of service</Link>
      </nav>
    </article>
  </main>
}
