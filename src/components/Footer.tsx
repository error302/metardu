import Link from 'next/link'
import Image from 'next/image'

const navigation = [
  { label: 'Explore the demo', href: '/demo' },
  { label: 'Survey tools', href: '/tools' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Quick start', href: '/docs/quick-start' },
  { label: 'Install the app', href: '/install' },
  { label: 'ChatGPT connection', href: '/connect/chatgpt' },
]
const legal = [
  { label: 'Privacy', href: '/docs/privacy' },
  { label: 'ChatGPT notice', href: '/docs/chatgpt-notice' },
  { label: 'Terms', href: '/docs/terms' },
  { label: 'Refunds', href: '/docs/refund' },
  { label: 'Data protection', href: '/docs/data-protection' },
]
const linkStyle = 'inline-flex min-h-11 items-center text-sm text-[#acb6b0] transition-colors hover:text-[#d59669] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59669]'
// Fixed public markup only: Cloudflare must preserve the entire anchor,
// including href and text, for React to hydrate the server-rendered footer.
const contactMarkup = `<!--email_off--><a href="mailto:hello@metardu.app" class="${linkStyle} mt-4">hello@metardu.app <span aria-hidden="true" class="ml-3">↗</span></a><!--/email_off-->`

export default function Footer() {
  return <footer className="border-t border-white/10 bg-[#0f1513] text-[#f2f1eb]">
    <div className="mx-auto max-w-[1360px] px-6 py-12 sm:py-16">
      <div className="grid gap-10 md:grid-cols-[1.3fr_1fr] md:gap-20">
        <div>
          <Link href="/" aria-label="METARDU home" className="inline-flex items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59669]">
            <Image src="/metardu-icon.png" alt="" width={36} height={36} />
            <span className="text-xl font-semibold tracking-[.1em]">METARDU</span>
          </Link>
          <p className="mt-5 max-w-md text-lg leading-relaxed">From the field record<br />to the work you deliver.</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#acb6b0]">Survey calculations, drawings, and project records in one workspace. Built in Kenya.</p>
          <div dangerouslySetInnerHTML={{ __html: contactMarkup }} />
        </div>
        <nav aria-label="Footer navigation">
          <p className="mb-3 text-xs font-mono uppercase tracking-widest text-[#d59669]">Explore METARDU</p>
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">{navigation.map(link => <li key={link.href}><Link href={link.href} prefetch={false} className={linkStyle}>{link.label}</Link></li>)}</ul>
          <div className="mt-5 flex gap-6"><a className={linkStyle} href="https://x.com/itsdosho" target="_blank" rel="noopener noreferrer">X / Twitter ↗</a><a className={linkStyle} href="https://github.com/error302" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>
        </nav>
      </div>
      <div className="mt-10 border-t border-white/10 pt-6">
        <p className="max-w-3xl text-xs leading-relaxed text-[#acb6b0]">Generated drawings and reports require professional review. A software output does not establish certification, boundary ownership, or acceptance by a land authority.</p>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-[#acb6b0]">© {new Date().getFullYear()} METARDU</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6">{legal.map(link => <Link key={link.href} href={link.href} prefetch={false} className={linkStyle}>{link.label}</Link>)}</nav>
        </div>
      </div>
    </div>
  </footer>
}
