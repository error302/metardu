export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import SubscriptionStatus from '@/components/SubscriptionStatus'
import UpgradePrompt from '@/components/UpgradePrompt'
import { getServerTranslator } from '@/lib/i18n/server'
import { log } from '@/lib/logger'
import { getAuthUser, isAdmin as checkIsAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'

import ProjectCard from '@/components/ProjectCard'
import { ConnectivityIndicator } from '@/components/shared/ConnectivityIndicator'
import OnboardingWrapper from '@/components/shared/OnboardingWrapper'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'

export default async function DashboardPage() {
  let t = (k: string) => k
  try { t = await getServerTranslator() } catch {}

  // Auth check — OUTSIDE try/catch so redirect() works properly
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const userIsAdmin = await checkIsAdmin()

  // ponytail: Phase 6 — was `any[]`; now typed via query builder default
  let projects: Record<string, unknown>[] = []
  let subscription: Record<string, unknown> | null = null

  try {
    const dbClient = await createClient()

    if (userIsAdmin) {
      subscription = { plan_id: 'enterprise', status: 'active', trial_ends_at: null }
      const { data, error } = await dbClient.from('projects').select('*').order('created_at', { ascending: false })
      if (!error) projects = (data as unknown as Record<string, unknown>[]) ?? []
    } else {
      const [pRes, sRes] = await Promise.all([
        dbClient.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        dbClient.from('user_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      ])
      if (!pRes.error) projects = (pRes.data as unknown as Record<string, unknown>[]) ?? []
      if (!sRes.error || sRes.error?.code === 'PGRST116') subscription = (sRes.data as Record<string, unknown>) ?? null
    }
  } catch (err) {
    log({ level: 'error', message: 'Failed to load dashboard data', metadata: { error: err } })
  }

  const canCreateProject = userIsAdmin || subscription?.plan_id !== 'free' || projects.length < 1
  const trialEndsAt = subscription?.trial_ends_at as string | null | undefined
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null

  /* ── Batch point/parcel counts (avoids N+1 queries) ─────────────── */
  let projectsWithCounts = projects
  if (projects.length > 0) {
    try {
      const dbClient = await createClient()
      const projectIds = projects.map(p => p.id)

      const [pointsRes, parcelsRes] = await Promise.all([
        dbClient.from('survey_points').select('project_id').in('project_id', projectIds),
        dbClient.from('parcels').select('project_id').in('project_id', projectIds),
      ])

      // Aggregate counts in JS (2 queries instead of 2N)
      const pointCounts: Record<string, number> = {}
      for (const row of (pointsRes.data as unknown as Record<string, unknown>[]) ?? []) {
        const pid = String(row.project_id)
        pointCounts[pid] = (pointCounts[pid] ?? 0) + 1
      }
      const parcelCounts: Record<string, number> = {}
      for (const row of (parcelsRes.data as unknown as Record<string, unknown>[]) ?? []) {
        const pid = String(row.project_id)
        parcelCounts[pid] = (parcelCounts[pid] ?? 0) + 1
      }

      projectsWithCounts = projects.map(project => ({
        ...project,
        point_count: pointCounts[String(project.id)] ?? 0,
        parcel_count: parcelCounts[String(project.id)] ?? 0,
      }))
    } catch {
      projectsWithCounts = projects.map(project => ({ ...project, point_count: 0, parcel_count: 0 }))
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      {/* Top: connectivity + onboarding + subscription banners */}
      <div className="flex items-center justify-end mb-4">
        <ConnectivityIndicator />
      </div>
      <OnboardingWrapper />
      <SubscriptionStatus subscription={subscription} />

      {subscription?.status === 'trial' && daysLeft !== null && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-md border border-[var(--success)]/30 bg-[var(--success)]/5 text-sm">
          <svg className="w-4 h-4 text-[var(--success)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-[var(--success)]">
            {daysLeft > 0
              ? `Pro trial active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining. `
              : 'Your trial has ended. '}
            <Link href="/pricing" className="underline hover:opacity-80">Upgrade to keep Pro access →</Link>
          </p>
        </div>
      )}

      {/* Header row — editorial headline + actions */}
      <div className="flex items-end justify-between mb-2 gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase mb-2">
            {t('dashboard.title')}
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-[var(--text-primary)] tracking-[-0.025em] leading-[1.05]">
            {user.name?.split(' ')[0] || 'Surveyor'}'s{' '}
            <span className="text-[var(--accent)] italic">workspace.</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/process" prefetch={false} className="px-4 py-2 text-sm text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] rounded-md transition-colors no-underline">
            Process field notes
          </Link>
          {canCreateProject ? (
            <Link href="/project/new" prefetch={false} className="px-4 py-2 text-sm bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-md hover:bg-[var(--accent-dim)] transition-colors no-underline">
              + {t('dashboard.newProject')}
            </Link>
          ) : (
            <Link href="/pricing" className="px-4 py-2 text-sm bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-md hover:bg-[var(--accent-dim)] transition-colors no-underline">
              {t('dashboard.upgradeToCreateMore')}
            </Link>
          )}
        </div>
      </div>

      {!canCreateProject && <UpgradePrompt type="projects" />}

      {/* Stats row — 4 columns, editorial numbers */}
      {projectsWithCounts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mt-8 mb-10 border border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="p-5 border-r border-[var(--border-color)]">
            <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2">Projects</div>
            <div className="font-display text-3xl text-[var(--text-primary)] tracking-[-0.02em]">{projectsWithCounts.length}</div>
          </div>
          <div className="p-5 border-r border-[var(--border-color)]">
            <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2">Survey points</div>
            <div className="font-display text-3xl text-[var(--text-primary)] tracking-[-0.02em]">
              {projectsWithCounts.reduce((sum: number, p: any) => sum + (p.point_count ?? 0), 0).toLocaleString()}
            </div>
          </div>
          <div className="p-5 border-r border-[var(--border-color)]">
            <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2">Parcels</div>
            <div className="font-display text-3xl text-[var(--text-primary)] tracking-[-0.02em]">
              {projectsWithCounts.reduce((sum: number, p: any) => sum + (p.parcel_count ?? 0), 0).toLocaleString()}
            </div>
          </div>
          <div className="p-5">
            <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2">Region</div>
            <div className="font-display text-3xl text-[var(--text-primary)] tracking-[-0.02em]">Kenya</div>
            <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.04em] mt-1">UTM 36S · 37S</div>
          </div>
        </div>
      )}

      {/* Projects + Activity — 2/3 + 1/3 split */}
      {!projectsWithCounts?.length ? (
        <div className="flex flex-col items-center justify-center py-20 border border-[var(--border-color)] bg-[var(--bg-card)] text-center">
          <div className="w-14 h-14 border border-[var(--border-color)] flex items-center justify-center mb-6">
            <svg className="w-7 h-7 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/>
            </svg>
          </div>

          <h2 className="font-display text-2xl text-[var(--text-primary)] tracking-[-0.02em] mb-2">Welcome to Metardu.</h2>
          <p className="text-[var(--text-secondary)] mb-8 max-w-md">Start your first project or jump straight into a tool.</p>

          <div className="flex flex-wrap gap-2 justify-center mb-8">
            <Link href="/project/new" prefetch={false} className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-[var(--bg-primary)] font-medium rounded-md transition-colors no-underline text-sm">
              + New project
            </Link>
            <Link href="/tools/traverse" className="px-5 py-2.5 text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] rounded-md transition-colors no-underline text-sm">
              Open traverse tool
            </Link>
            <Link href="/process" prefetch={false} className="px-5 py-2.5 text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] rounded-md transition-colors no-underline text-sm">
              Process field notes
            </Link>
          </div>

          <div className="w-full max-w-sm border-t border-[var(--border-color)] pt-5 mt-2 text-left">
            <p className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2">New to Metardu?</p>
            <Link href="/docs/first-plan" className="text-sm text-[var(--accent)] hover:opacity-80 transition-opacity inline-flex items-center gap-1 no-underline">
              View survey guide →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
          {/* Projects */}
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-color)]">
              <h2 className="font-display text-xl text-[var(--text-primary)] tracking-[-0.015em]">
                Recent projects
              </h2>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase">
                {projectsWithCounts.length} total
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {projectsWithCounts.map((project: any) => (
                <ProjectCard key={project.id} project={project} openLabel={t('project.open')} />
              ))}
            </div>
          </div>

          {/* Activity */}
          <div>
            <ActivityFeed limit={10} />
          </div>
        </div>
      )}
    </div>
  )
}
