'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, UserPlus, ShieldCheck,
  CreditCard, Loader2, AlertCircle, ChevronRight,
  Megaphone, Check, X, ArrowUpRight,
} from 'lucide-react'
import { z } from 'zod'
import { getPlan, PLAN_CATALOG, type PlanId } from '@/lib/subscription/catalog'
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api/client'
import dynamic from 'next/dynamic'
import { OwnerOverview, SubscriptionReview } from '@/components/admin/OwnerOverview'
import FeedbackInbox from '@/components/admin/FeedbackInbox'
import { dashboardResponseSchema, type DashboardData } from '@/lib/admin/dashboardContract'
import SystemHealthPanel from '@/components/admin/SystemHealthPanel'

const PerformanceDashboard = dynamic(
  () => import('@/components/PerformanceDashboard').then(m => m.default || m),
  { ssr: false },
)

// Mutation responses are validated separately from the shared dashboard contract.


const announcementMutationSchema = z.object({
  ok: z.boolean().optional(),
  id: z.union([z.string(), z.number()]).optional(),
}).passthrough()

const overridePlanMutationSchema = z.object({
  ok: z.boolean().optional(),
  plan: z.string().optional(),
}).passthrough()

const verifyIskMutationSchema = z.object({
  ok: z.boolean().optional(),
  verified: z.boolean().optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatUpdatedAt(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Update time unavailable'
  return date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'org_admin':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'admin':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'project_manager':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'surveyor':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'viewer':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState('overview')
  const [broadcastReviewed, setBroadcastReviewed] = useState(false)
  const [overrideReviewed, setOverrideReviewed] = useState(false)
  useEffect(() => {
    const sync = () => { const hash = window.location.hash.slice(1); setSection(['customers', 'billing', 'communications', 'feedback', 'system'].includes(hash) ? hash : 'overview') }
    sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync)
  }, [])


  // Broadcast state
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [announcementTarget, setAnnouncementTarget] = useState('all')
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Subscription override state
  const [overrideEmail, setOverrideEmail] = useState('')
  const [overridePlan, setOverridePlan] = useState<PlanId>('pro')
  const [overrideDays, setOverrideDays] = useState('30')
  const [overrideSending, setOverrideSending] = useState(false)
  const [overrideResult, setOverrideResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => setBroadcastReviewed(false), [announcementTitle, announcementBody, announcementTarget])
  useEffect(() => setOverrideReviewed(false), [overrideEmail, overridePlan, overrideDays])

  // ISK queue processing
  const [iskProcessing, setIskProcessing] = useState<Set<string>>(new Set())

  const requestedOverrideDays = overrideDays.trim() === '' ? 30 : Number(overrideDays)
  const overrideDurationIsValid = Number.isInteger(requestedOverrideDays)
    && requestedOverrideDays >= 1
    && requestedOverrideDays <= 3650

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGet('/api/admin/dashboard', dashboardResponseSchema, { ttlMs: 0 })
      setData(json)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isUnauthorized) {
          router.push('/login')
          return
        }
        if (err.isForbidden) {
          router.push('/dashboard')
          return
        }
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      }
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (sessionStatus === 'authenticated') {
      fetchDashboard()
    }
  }, [sessionStatus, fetchDashboard, router])

  const handleBroadcast = async () => {
    if (!announcementTitle.trim() || !announcementBody.trim() || !broadcastReviewed) return
    setBroadcastSending(true)
    setBroadcastResult(null)
    try {
      await apiPost(
        '/api/admin/announcements',
        announcementMutationSchema,
        {
          title: announcementTitle,
          body: announcementBody,
          target: announcementTarget,
        },
      )
      setBroadcastResult({ ok: true, msg: 'In-app announcement published. No email was sent.' })
      setAnnouncementTitle('')
      setAnnouncementBody('')
      await fetchDashboard()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Network error'
      setBroadcastResult({ ok: false, msg })
    } finally {
      setBroadcastSending(false)
    }
  }

  const handleOverride = async () => {
    if (!overrideEmail || !overridePlan || !overrideDurationIsValid || !overrideReviewed) return
    setOverrideSending(true)
    setOverrideResult(null)
    try {
      await apiPatch(
        '/api/admin/users/override-plan',
        overridePlanMutationSchema,
        {
          email: overrideEmail,
          plan: overridePlan,
          ...(overrideDays.trim() ? { days: requestedOverrideDays } : {}),
        },
      )
      setOverrideResult({ ok: true, msg: `Plan updated to ${overridePlan} for ${requestedOverrideDays} days` })
      setOverrideEmail('')
      await fetchDashboard()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Network error'
      setOverrideResult({ ok: false, msg })
    } finally {
      setOverrideSending(false)
    }
  }

  const handleIskAction = async (userId: string, approve: boolean) => {
    setIskProcessing(prev => new Set(prev).add(userId))
    try {
      await apiPatch(
        `/api/admin/users/${userId}/verify-isk`,
        verifyIskMutationSchema,
        { verified: approve, updated_at: data?.iskQueue.find(user => user.id === userId)?.updatedAt },
      )
      // Remove only after the server accepts the version-bound change.
      setData(prev => prev ? {
        ...prev,
        iskQueue: prev.iskQueue.filter(u => u.id !== userId),
        iskPendingCount: Math.max(0, prev.iskPendingCount - 1),
      } : prev)
    } catch (err) {
      // ponytail: surface the failure so the admin knows to retry — previously this was a silent swallow
      const msg = err instanceof ApiError ? err.message : 'Failed to update ISK status'
      setError(msg)
    } finally {
      setIskProcessing(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  // Loading state
  if (sessionStatus === 'loading' || (loading && !data)) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading admin dashboard">
        <div className="flex flex-col gap-4 border-b border-[var(--border-color)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3"><div className="h-3 w-44 animate-pulse rounded bg-[var(--bg-tertiary)]" /><div className="h-10 w-64 max-w-full animate-pulse rounded bg-[var(--bg-secondary)]" /><div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--bg-secondary)]" /></div>
          <div className="h-10 w-28 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
        </div>
        <div className="flex gap-2 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">{[0,1,2,3,4,5].map(i => <div key={i} className="h-9 min-w-24 flex-1 animate-pulse rounded-md bg-[var(--bg-tertiary)]" />)}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]" />)}</div>
        <div className="h-64 animate-pulse rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]" />
      </div>
    )
  }

  // Error state
  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 max-w-md w-full mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Failed to Load Dashboard
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={fetchDashboard} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdminRole = userRole === 'admin' || userRole === 'super_admin'
  const canOverridePlans = isAdminRole

  return (
    <div className="space-y-6">
      <header className="admin-page-heading">
        <div><p className="admin-eyebrow">The business behind the fieldwork</p><h1>Owner’s workspace</h1><p className="admin-description">A clear view of your customers, payments and the work that needs you.</p></div>
        <div className="flex flex-wrap items-center gap-3"><span className="admin-caption">Updated {formatUpdatedAt(data.generatedAt)}</span><button onClick={fetchDashboard} className="btn btn-secondary" disabled={loading} aria-label={loading ? 'Refreshing business dashboard' : 'Refresh business dashboard'}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Refresh</button></div>
      </header>
      <nav aria-label="Business workspace sections" className="admin-section-nav">{[['overview','Overview'],['customers','Customers'],['billing','Billing'],['communications','Communications'],['feedback','Feedback'],['system','System']].map(([id,label]) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}{id === 'feedback' && data.operations.openFeedback > 0 && <span>{data.operations.openFeedback}</span>}</a>)}</nav>
      {error && <div className="admin-error" role="alert">{error} <button onClick={fetchDashboard} className="underline ml-2">Retry</button></div>}
      {section === 'overview' && <OwnerOverview data={data} />}
      {section === 'customers' && <div className="space-y-5"><div className="admin-section-heading"><div><h2>Customer accounts & verification</h2><p className="admin-caption">Recent customers exclude explicitly labelled verification fixtures. All accounts remain in the directory.</p></div><Link href="/admin/users" className="btn btn-primary">Manage customers <ArrowUpRight className="h-4 w-4" /></Link></div><div className="admin-split">{/* Recent Signups */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Recent Signups
              </h2>
            </div>
            <Link
              href="/admin/users"
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-0">
            {data.recentSignups.length > 0 ? (
              <div className="max-h-72 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-left">Role</th>
                      <th className="px-4 py-2 text-left">Plan</th>
                      <th className="px-4 py-2 text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSignups.map((user) => (
                      <tr key={user.id} className="table-row">
                        <td className="table-cell">
                          <div>
                            <p className="text-[var(--text-primary)] font-medium text-sm truncate max-w-[160px]">
                              {user.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] truncate max-w-[160px]">
                              {user.email}
                            </p>
                          </div>
                        </td>
                        <td className="table-cell">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${roleBadgeClass(user.role)}`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="table-cell text-sm capitalize">
                          {user.plan}
                        </td>
                        <td className="table-cell text-sm text-right text-[var(--text-muted)]">
                          {formatDate(user.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-[var(--text-muted)]">
                No users yet
              </div>
            )}
          </div>
        </div>{/* ISK Verification Queue */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                ISK Verification Queue
              </h2>
            </div>
            <Link href="/admin/users?role=surveyor" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-0">
            {(data.iskQueue ?? []).length > 0 ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2 text-left">Surveyor</th>
                      <th className="px-4 py-2 text-left">ISK No.</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.iskQueue.map((user) => (
                      <tr key={user.id} className="table-row">
                        <td className="table-cell">
                          <div>
                            <p className="text-[var(--text-primary)] font-medium text-sm truncate max-w-[160px]">
                              {user.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] truncate max-w-[160px]">
                              {user.email}
                            </p>
                          </div>
                        </td>
                        <td className="table-cell text-sm font-mono">
                          {user.iskNumber}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleIskAction(user.id, true)}
                              disabled={iskProcessing.has(user.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                              aria-label={`Approve ISK for ${user.name}`} title="Approve ISK"
                            >
                              {iskProcessing.has(user.id) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleIskAction(user.id, false)}
                              disabled={iskProcessing.has(user.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              aria-label={`Reject ISK for ${user.name}`} title="Reject ISK"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-[var(--text-muted)]">
                No pending ISK verifications
              </div>
            )}
          </div>
        </div></div></div>}
      {section === 'billing' && <div className="space-y-5"><div className="admin-section-heading"><div><h2>Subscriptions & billing</h2><p className="admin-caption">Review incoming payments, upcoming plan endings and exceptional access grants.</p></div><Link href="/admin/payments" className="btn btn-primary">Open payment ledger <ArrowUpRight className="h-4 w-4" /></Link></div><SubscriptionReview data={data} />{/* Manual plan grant (admin/super_admin) */}
        {canOverridePlans && (
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Manual plan grant
                </h2>
              </div>
            </div>
            <div className="p-5 space-y-3"><p className="admin-caption">Use for agreed exceptions or support adjustments. This changes access immediately, is audited, and does not record a payment.</p><label className="admin-confirm"><input type="checkbox" checked={overrideReviewed} onChange={e => setOverrideReviewed(e.target.checked)} />I reviewed the account, plan and duration below.</label>
              <input
                type="email"
                aria-label="User email" placeholder="User email..."
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] outline-none transition-all"
                value={overrideEmail}
                onChange={e => setOverrideEmail(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-all"
                  aria-label="Grant plan" value={overridePlan}
                  onChange={e => {
                    const selectedPlan = getPlan(e.target.value)
                    if (selectedPlan) setOverridePlan(selectedPlan.id)
                  }}
                >
                  {PLAN_CATALOG.map(plan => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  aria-label="Override duration (days)" placeholder="Days"
                  className="w-24 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-all"
                  value={overrideDays}
                  onChange={e => setOverrideDays(e.target.value)}
                />
                <button
                  onClick={handleOverride}
                  className="btn btn-primary flex items-center gap-2"
                  disabled={!overrideEmail || !overrideDurationIsValid || !overrideReviewed || overrideSending}
                >
                  {overrideSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Apply
                </button>
              </div>
              {overrideResult && (
                <p className={`text-xs ${overrideResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {overrideResult.msg}
                </p>
              )}
            </div>
          </div>
        )}</div>}
      {section === 'communications' && <div className="admin-split"><div>{/* Publish an in-app announcement */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Publish an in-app announcement
              </h2>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <input
              type="text"
              maxLength={200} aria-label="Announcement title" placeholder="Announcement title..."
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] outline-none transition-all"
              value={announcementTitle}
              onChange={e => setAnnouncementTitle(e.target.value)}
            />
            <textarea
              placeholder="Announcement message..."
              aria-label="Announcement message" rows={3} maxLength={5000}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm resize-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] outline-none transition-all"
              value={announcementBody}
              onChange={e => setAnnouncementBody(e.target.value)}
            />
            <label className="admin-confirm"><input type="checkbox" checked={broadcastReviewed} onChange={e => setBroadcastReviewed(e.target.checked)} />I reviewed this message for the {announcementTarget} audience. Publishing makes it visible in the app; it does not send email.</label><div className="flex gap-2">
              <select
                className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-all"
                aria-label="Announcement audience" value={announcementTarget}
                onChange={e => setAnnouncementTarget(e.target.value)}
              >
                <option value="all">All Users</option>
                <option value="pro">Pro Users Only</option>
                <option value="free">Free Users Only</option>
                <option value="team">Team Users Only</option><option value="firm">Firm Users Only</option><option value="enterprise">Enterprise Only</option>
              </select>
              <button
                onClick={handleBroadcast}
                className="btn btn-primary flex items-center gap-2"
                disabled={!announcementTitle.trim() || !announcementBody.trim() || !broadcastReviewed || broadcastSending}
              >
                {broadcastSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Publish
              </button>
            </div>
            {broadcastResult && (
              <p className={`text-xs ${broadcastResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {broadcastResult.msg}
              </p>
            )}
          </div>
        </div><div className="admin-note mt-4">Marketing reminders use the existing opt-in scheduler and unsubscribe rules. Publishing an announcement does not trigger a marketing send.</div></div><section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-eyebrow">Published in the app</p><h2>Announcement history</h2></div></div>{data.operations.announcements.length ? data.operations.announcements.map(item => <article className="border-b border-[var(--border-color)] py-4 last:border-0" key={item.id}><p className="admin-caption">{item.target} · {formatDate(item.createdAt)}</p><h3 className="mt-2 font-medium">{item.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">{item.body}</p></article>) : <div className="admin-empty"><h3>No announcements published yet.</h3><p>Keep notices short and relevant to the selected audience.</p></div>}</section></div>}

      {section === 'feedback' && <FeedbackInbox items={data.operations.feedback} onUpdated={fetchDashboard} />}
      {section === 'system' && <div id="system" className="space-y-5"><div className="admin-section-heading"><div><h2>Platform operations</h2><p className="admin-caption">Process and database diagnostics. These readings do not establish field accuracy or backup recoverability.</p></div><Link className="admin-text-link" href="/audit-logs">Open audit trail →</Link></div><SystemHealthPanel /><details className="admin-panel"><summary className="cursor-pointer font-medium">Browser performance diagnostics</summary><div className="mt-5"><PerformanceDashboard /></div></details><div className="admin-note">Backups, migrations and production promotion stay in the controlled deployment workflow. This dashboard does not run Docker cleanup or database migrations.</div></div>}
    </div>
  )
}
