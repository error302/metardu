'use client';
import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import { z } from 'zod'
import { apiGet, apiPost, ApiError } from '@/lib/api/client'

// ── Schemas ────────────────────────────────────────────────────────────────
const subscriptionResponseSchema = z.object({
  plan: z.enum(['free', 'pro', 'team', 'firm', 'enterprise']),
  status: z.enum(['active', 'cancelled', 'expired', 'trial']),
  trialEndsAt: z.string().datetime().nullish(),
  periodEnd: z.string().datetime().nullish(),
}).passthrough()
const updatePasswordMutationSchema = z.object({ confirmationEmailSent: z.boolean().optional() }).passthrough()

interface Subscription {
  plan_id: string
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  subscription_plans?: { name: string }
}

export default function AccountPage() {
  const { data: session, status } = useSession()
  if (status === 'loading') return <p role="status" className="p-8">Loading account…</p>
  if (!session?.user?.id) return <p className="p-8"><a href="/login?next=%2Faccount" className="underline">Sign in to view your account.</a></p>
  return <AccountDetails key={session.user.id} user={session.user} />
}

function AccountDetails({ user }: { user: NonNullable<Session['user']> }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setSubscriptionLoading(true); setSubscriptionError('')
    async function loadSubscription() {
      try {
        const data = await apiGet(
          '/api/subscription',
          subscriptionResponseSchema,
          { ttlMs: 0, signal: controller.signal, init: { cache: 'no-store' } },
        )
        if (controller.signal.aborted) return
        setSubscription({
          plan_id: data.plan || 'free',
          status: data.status || 'active',
          trial_ends_at: data.trialEndsAt ?? null,
          current_period_end: data.periodEnd ?? null,
        })
      } catch {
        if (!controller.signal.aborted) { setSubscription(null); setSubscriptionError('Could not load your subscription. Check your connection and retry.') }
      } finally { if (!controller.signal.aborted) setSubscriptionLoading(false) }
    }
    loadSubscription()
    return () => controller.abort()
  }, [user.id, subscriptionAttempt])

  async function updatePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    if (newPassword !== confirmPassword) { setMessage('Error: Passwords do not match'); return }
    setSaving(true)
    setMessage('')
    try {
      const result = await apiPost(
        '/api/auth/update-password',
        updatePasswordMutationSchema,
        { currentPassword, password: newPassword },
      )
      await signOut({ redirect: false }).catch(() => null)
      setMessage(result.confirmationEmailSent === false
        ? 'Password updated. The confirmation email could not be sent. Sign in again with your new password.'
        : 'Password updated. A confirmation email was sent. Sign in again with your new password.')
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage('Error: ' + err.message)
      } else {
        setMessage('Error: Password update failed')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-16">
      <div className="max-w-3xl mx-auto px-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-8">Account Settings</h1>

        <div className="space-y-8">
          <Section title="Profile">
            <div className="space-y-4">
              <div>
                <label htmlFor="account-email" className="block text-sm text-[var(--text-secondary)] mb-1">Email</label>
                <input id="account-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-muted)]"
                />
              </div>
            </div>
          </Section>

          <Section title="Change Password">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const form = e.target as HTMLFormElement
                const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value
                const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value
                const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value
                void updatePassword(currentPassword, newPassword, confirmPassword)
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="account-current-password" className="block text-sm text-[var(--text-secondary)] mb-1">Current Password</label>
                <input id="account-current-password" name="currentPassword" type="password" autoComplete="current-password" required className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)]" />
              </div>
              <div>
                <label htmlFor="account-new-password" className="block text-sm text-[var(--text-secondary)] mb-1">New Password</label>
                <input id="account-new-password"
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label htmlFor="account-confirm-password" className="block text-sm text-[var(--text-secondary)] mb-1">Confirm New Password</label>
                <input id="account-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)]" />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg font-medium hover:bg-[var(--accent-dim)] disabled:opacity-50"
              >
                {saving ? 'Updating...' : 'Update Password'}
              </button>
              {message && (
                <p role={message.includes('Error') ? 'alert' : 'status'} className={`text-sm ${message.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                  {message}
                  {!message.includes('Error') && <a href="/login?reset=success" className="ml-2 underline">Sign in again</a>}
                </p>
              )}
            </form>
          </Section>

          <Section title="Subscription">
            {subscriptionLoading ? <p role="status">Loading subscription…</p> : subscriptionError ? <div><p role="alert">{subscriptionError}</p><button type="button" className="mt-3 underline" onClick={() => setSubscriptionAttempt(value => value + 1)}>Retry subscription</button></div> : subscription ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[var(--text-primary)] font-medium capitalize">
                      {subscription.subscription_plans?.name || subscription.plan_id} Plan
                    </p>
                    <p className="text-[var(--text-secondary)] text-sm">
                      {subscription.plan_id === 'free' ? 'Free access'
                        : subscription.status === 'trial' ? subscription.trial_ends_at ? `Trial ends ${new Date(subscription.trial_ends_at).toLocaleDateString()}` : 'Trial end not supplied'
                        : subscription.status !== 'active' ? `${subscription.status === 'cancelled' ? 'Cancelled' : 'Expired'} subscription`
                        : subscription.current_period_end ? `Current period ends ${new Date(subscription.current_period_end).toLocaleDateString()}` : 'Period end not supplied'}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    subscription.plan_id === 'enterprise' ? 'bg-amber-900/50 text-amber-400' :
                    subscription.plan_id === 'firm' ? 'bg-purple-900/50 text-purple-400' :
                    subscription.plan_id === 'team' ? 'bg-blue-900/50 text-blue-400' :
                    subscription.plan_id === 'pro' ? 'bg-green-900/50 text-green-400' :
                    'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}>
                    {subscription.plan_id.toUpperCase()}
                  </span>
                </div>
                <a
                  href="/pricing"
                  className="inline-block bg-[var(--accent)] text-black px-6 py-2 rounded-lg font-medium hover:bg-[var(--accent-dim)]"
                >
                  {subscription.plan_id === 'free' ? 'Upgrade Plan' : 'Manage Plan'}
                </a>
              </div>
            ) : (
              <p className="text-[var(--text-secondary)]">Subscription details are unavailable.</p>
            )}
          </Section>

          <Section title="Payment History">
            <a href="/account/billing" className="text-[var(--text-secondary)] underline">Open billing records</a>
          </Section>

          <Section title="Danger Zone">
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <h4 className="text-red-400 font-medium mb-2">Delete Account</h4>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                Once you delete your account, there is no going back. All your projects and data will be permanently deleted.
              </p>
              <button className="bg-red-900 text-red-400 px-4 py-2 rounded-lg text-sm hover:bg-red-800">
                Delete My Account
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">{title}</h2>
      {children}
    </div>
  )
}
