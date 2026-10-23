'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import MetarduLogo from '@/components/MetarduLogo'
import { OutdoorModeToggle } from '@/components/shared/OutdoorModeToggle'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import './admin.css'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const permitted = role === 'admin' || role === 'super_admin'
  return <div className="admin-workspace min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <header className="admin-shell-header"><div className="admin-shell-inner">
      <Link href="/admin" className="admin-shell-brand" aria-label="METARDU business overview"><MetarduLogo size={30} /></Link>
      <span className="admin-shell-label"><ShieldCheck className="h-3.5 w-3.5" /> Business administration</span>
      <div className="admin-shell-actions"><OutdoorModeToggle /><Link className="admin-text-link text-xs" href="/dashboard">Back to app <ArrowUpRight className="h-3.5 w-3.5" /></Link><NotificationBell /></div>
    </div></header>
    {status === 'loading' ? <div className="mx-auto max-w-7xl px-5 py-12" role="status">Checking administrator access…</div> : !permitted ? <div className="mx-auto max-w-xl px-5 py-16"><h1 className="text-2xl font-semibold">Administrator access required</h1><p className="mt-3 text-[var(--text-secondary)]">This workspace is available to platform administrators.</p><Link href={status === 'unauthenticated' ? '/login?next=%2Fadmin' : '/dashboard'} className="btn btn-primary mt-6">{status === 'unauthenticated' ? 'Sign in' : 'Return to dashboard'}</Link></div> : <>
      <nav className="admin-primary-nav" aria-label="Administration"><div className="admin-shell-inner">{[['/admin', 'Business overview'], ['/admin/users', 'Customer directory'], ['/admin/payments', 'Payment ledger'], ['/audit-logs', 'Audit trail']].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}<span className="ml-auto hidden text-xs text-[var(--text-muted)] md:block">{role?.replace('_', ' ')} · private workspace</span></div></nav>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-7 md:px-8 md:py-10">{children}</div>
      <footer className="admin-shell-inner admin-footer"><span>METARDU · Owner operations</span><div className="flex gap-4"><Link href="/docs/privacy">Privacy</Link><Link href="/docs/terms">Terms</Link><Link href="/support">Support</Link></div></footer>
    </>}
  </div>
}
