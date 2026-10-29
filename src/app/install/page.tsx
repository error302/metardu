import type { Metadata } from 'next'
import Link from 'next/link'
import { Smartphone, Monitor, Share2, ShieldCheck, BellRing } from 'lucide-react'
import { PWAInstallBanner } from '@/components/app/PWAInstallBanner'

export const metadata: Metadata = {
  title: 'Install METARDU on your phone',
  description: 'Install METARDU on Android, iPhone or iPad and open your survey workspace from the Home Screen.',
}
export default function InstallPage() {
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">METARDU on your device</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Your survey workspace. One tap away.</h1>
    <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">Install METARDU from your browser to open it like an app. Use the same account and projects at metardu.space. No app-store download is required.</p>
    <PWAInstallBanner manual />
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <section aria-labelledby="install-android" className="card p-5 sm:p-6">
        <Smartphone aria-hidden="true" className="h-6 w-6 text-[var(--accent)]" />
        <h2 id="install-android" className="mt-3 text-xl font-semibold">Android</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
          <li>Open metardu.space in Chrome or another browser that supports web app installation.</li>
          <li>Tap <strong>Install</strong> when offered, or open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Confirm the browser’s installation steps, then open METARDU from your Home Screen or app launcher.</li>
        </ol>
      </section>
      <section aria-labelledby="install-ios" className="card p-5 sm:p-6">
        <Share2 aria-hidden="true" className="h-6 w-6 text-[var(--accent)]" />
        <h2 id="install-ios" className="mt-3 text-xl font-semibold">iPhone and iPad</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
          <li>Open metardu.space in <strong>Safari</strong>.</li>
          <li>Open <strong>Share</strong> (it may be inside the More menu), then choose <strong>Add to Home Screen</strong>.</li>
          <li>If shown, turn on <strong>Open as Web App</strong>. Tap <strong>Add</strong>, then launch METARDU from your Home Screen.</li>
        </ol>
      </section>
    </div>
    <section className="mt-5 card p-5 sm:p-6" aria-labelledby="install-desktop">
      <div className="flex items-start gap-3"><Monitor aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" /><div><h2 id="install-desktop" className="text-lg font-semibold">On a computer</h2><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">In Chrome or Edge, use the install icon in the address bar or the browser’s app menu. If installation is unavailable, METARDU still works in a normal browser tab.</p></div></div>
    </section>
    <section className="mt-5 card p-5 sm:p-6" aria-labelledby="install-reminders">
      <div className="flex items-start gap-3"><BellRing aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" /><div><h2 id="install-reminders" className="text-lg font-semibold">Survey reminders on your phone</h2><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">From the installed app, sign in, open Survey schedule and choose <strong>Enable phone reminders</strong>. Allow notifications when asked. Link a job to its project so alerts can identify the project and survey time.</p><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">On iPhone and iPad, enable reminders from the Home Screen app. If notifications are blocked, allow METARDU in your phone or browser notification settings.</p></div></div>
    </section>
    <section className="mt-5 card p-5 sm:p-6" aria-labelledby="install-fieldwork">
      <div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" /><div><h2 id="install-fieldwork" className="text-lg font-semibold">Before leaving for the field</h2><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Sign in from the installed app while connected. Keep the tools and records you need open, check the field book’s saved and delivery status, and export a backup. Installation does not make every page, map or server operation available offline.</p><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Private pages are fetched from the server. Updates wait for you to save your work and choose when to reload; returning online does not reload your working page.</p></div></div>
    </section>
    <div className="mt-8 flex flex-wrap gap-3"><Link href="/schedule" className="btn btn-primary min-h-11">Plan a survey</Link><Link href="/docs/quick-start" className="btn btn-secondary min-h-11">Read the quick start</Link></div>
  </div>
}
