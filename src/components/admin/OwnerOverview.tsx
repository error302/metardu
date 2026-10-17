'use client'

import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, CreditCard, FolderKanban, MessageSquare, ShieldCheck, Users } from 'lucide-react'
import type { DashboardData } from '@/lib/admin/dashboardContract'
import { formatPaymentAmount } from '@/lib/admin/paymentCurrency'
import { RevenueLineChart } from './charts/AdminCharts'

export function OwnerOverview({ data }: { data: DashboardData }) {
  const ops = data.operations
  const paid = Object.entries(data.activeSubscriptions).filter(([plan]) => plan !== 'free').reduce((sum, [, count]) => sum + count, 0)
  const tasks = [
    { title: 'Payment claims', count: ops.pendingClaims, detail: 'Check each claim against your merchant statement.', href: '/admin/payments?tab=till-claims', icon: CreditCard },
    { title: 'Professional verification', count: data.iskPendingCount, detail: 'Review the submitted ISK details before approving.', href: '#customers', icon: ShieldCheck },
    { title: 'Customer feedback', count: ops.openFeedback, detail: 'Triage bugs, requests and customer questions.', href: '#feedback', icon: MessageSquare },
    { title: 'Ending within 7 days', count: ops.expiringSubscriptions7d, detail: 'Review active plans and trials approaching their end.', href: '#billing', icon: Users },
  ]
  const metrics = [
    { title: 'Customer accounts', value: ops.accounts, note: `${ops.syntheticAccounts} labelled test accounts excluded`, icon: Users },
    { title: 'Active paid plans', value: paid, note: `${data.trialSubscriptions} trials · manual grants may be included`, icon: CreditCard },
    { title: 'Stored projects', value: data.projects.total, note: `${data.submissionsThisMonth} submissions this month · includes test projects`, icon: FolderKanban },
    { title: 'Completed revenue · KES', value: formatPaymentAmount(data.revenue.total, 'KES'), note: 'All time · original payment currency', icon: CheckCircle2 },
  ]
  return <div className="space-y-6">
    <section aria-label="Business snapshot" className="admin-metric-strip">
      {metrics.map(({ title, value, note, icon: Icon }) => <article key={title} className="admin-metric">
        <div className="admin-metric-heading"><p>{title}</p><span><Icon className="h-4 w-4" aria-hidden="true" /></span></div>
        <strong>{typeof value === 'number' ? value.toLocaleString('en-KE') : value}</strong>
        <small>{note}</small>
      </article>)}
    </section>
    <section className="admin-panel" aria-labelledby="attention-heading">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Daily priorities</p><h2 id="attention-heading">Needs your attention</h2></div><span className="admin-caption">Review before taking action</span></div>
      <div className="admin-action-grid">{tasks.map(({ title, count, detail, href, icon: Icon }) => <Link className="admin-action-row" key={title} href={href}>
        <Icon className="h-5 w-5 text-[var(--accent)]" /><div><span>{title}</span><small>{detail}</small></div><strong className={count ? 'text-[var(--accent)]' : ''}>{count}</strong><ArrowUpRight className="h-4 w-4" />
      </Link>)}</div>
    </section>
    <div className="admin-split">
      <section className="admin-panel" aria-labelledby="revenue-heading">
        <div className="admin-section-heading"><div><p className="admin-eyebrow">Money received</p><h2 id="revenue-heading">Revenue record</h2></div><Link href="/admin/payments" className="admin-text-link">Open ledger <ArrowUpRight className="h-4 w-4" /></Link></div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 pb-4">{(data.revenue.byCurrency.length ? data.revenue.byCurrency : [{ currency: 'KES', total: 0 }]).map(row => <div key={row.currency}><p className="admin-caption">{row.currency} · completed</p><p className="text-xl font-semibold tabular-nums">{formatPaymentAmount(row.total, row.currency)}</p></div>)}</div>
        {data.revenue.byMonth.length ? <RevenueLineChart data={data.revenue.byMonth} /> : <div className="admin-empty"><CreditCard className="h-7 w-7 text-[var(--accent)]" /><h3>Your first completed payment will appear here.</h3><p>Provider-confirmed transactions populate the ledger. Manual plan grants do not create revenue.</p><Link href="/admin/payments" className="admin-text-link">Review payment records →</Link></div>}
        <p className="admin-caption mt-3">Chart: recorded KES months only. Other currencies stay separate; no exchange rate or recurring-revenue estimate is applied.</p>
      </section>
      <section className="admin-panel" aria-labelledby="onboarding-heading"><div className="admin-section-heading"><div><p className="admin-eyebrow">Account readiness</p><h2 id="onboarding-heading">Onboarding & follow-up</h2></div></div>
        <dl className="admin-definition-list"><div><dt>Email ownership unverified</dt><dd>{ops.unverifiedEmails}</dd></div><div><dt>Failed payment attempts · 30 days</dt><dd>{ops.failedPayments30d}</dd></div><div><dt>New stored accounts · this month</dt><dd>{data.users.newThisMonth}</dd></div><div><dt>All stored accounts</dt><dd>{data.users.total}</dd></div></dl>
        <p className="admin-caption mt-4">Stored-account totals include labelled tests. An updated account is not proof of an active customer.</p>
        <Link className="btn btn-secondary mt-5 w-full" href="/admin/users">Open customer directory <ArrowUpRight className="h-4 w-4" /></Link>
        <div className="admin-note mt-5"><CheckCircle2 className="h-4 w-4 shrink-0" /><p>Email ownership and professional ISK verification are separate checks. A plan grant does not verify either.</p></div>
      </section>
    </div>
  </div>
}

export function SubscriptionReview({ data }: { data: DashboardData }) {
  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-eyebrow">Retention</p><h2>Plans ending within 7 days</h2></div><span className="admin-caption">Next 20 by end date</span></div>
    {data.operations.renewals.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><thead><tr className="table-header"><th className="table-cell text-left">Account</th><th className="table-cell text-left">Plan / status</th><th className="table-cell text-right">Ends</th></tr></thead><tbody>{data.operations.renewals.map(row => <tr key={row.id} className="table-row"><td className="table-cell"><Link className="admin-text-link" href={`/admin/users?search=${encodeURIComponent(row.email)}`}>{row.name}</Link><p className="admin-caption">{row.email}</p></td><td className="table-cell">{row.plan} / {row.status}</td><td className="table-cell text-right">{new Date(row.expiresAt).toLocaleDateString('en-KE')}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><h3>No upcoming endings in this window.</h3><p>Only active subscriptions and trials with a recorded end date appear here.</p></div>}
    <div className="mt-5 flex flex-wrap gap-2">{Object.entries(data.activeSubscriptions).map(([plan, count]) => <span className="admin-plan-count" key={plan}>{plan}<strong>{count}</strong></span>)}</div>
    <p className="admin-caption mt-3">Active entitlements by plan; {data.trialSubscriptions} trial accounts are counted separately. Manual grants may be included.</p>
  </section>
}
