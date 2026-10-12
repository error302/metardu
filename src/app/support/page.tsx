import Link from 'next/link'

export const metadata = {
  title: 'Support | METARDU',
  description: 'Get help with METARDU survey tools and the ChatGPT integration preview.',
}

export default function SupportPage() {
  return <main className="min-h-screen px-6 py-16 text-[var(--text-primary)]">
    <article className="mx-auto max-w-2xl">
      <p className="text-sm font-mono uppercase tracking-widest text-[var(--accent)]">METARDU / Support</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">How can we help?</h1>
      <p className="mt-5 leading-relaxed text-[var(--text-secondary)]">For account access, survey-tool questions, or help with the ChatGPT integration preview, contact the METARDU support team.</p>
      <a className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-black" href="mailto:support@metardu.app">Email support@metardu.app</a>
      <nav aria-label="Support resources" className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link className="text-[var(--accent)] underline" href="/docs/chatgpt-integration">ChatGPT integration guide</Link>
        <Link className="text-[var(--accent)] underline" href="/docs/privacy">Privacy policy</Link>
        <Link className="text-[var(--accent)] underline" href="/docs/terms">Terms of service</Link>
      </nav>
    </article>
  </main>
}
