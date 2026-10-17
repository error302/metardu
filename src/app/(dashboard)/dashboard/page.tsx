export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import SubscriptionStatus from '@/components/SubscriptionStatus'
import UpgradePrompt from '@/components/UpgradePrompt'
import { getServerTranslator } from '@/lib/i18n/server'
import { log } from '@/lib/logger'
import { getAuthUser, isAdmin as checkIsAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'

import ProjectCard, { type ProjectCardProject } from '@/components/ProjectCard'
import { ConnectivityIndicator } from '@/components/shared/ConnectivityIndicator'
import OnboardingWrapper from '@/components/shared/OnboardingWrapper'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import DashboardSearch from '@/components/dashboard/DashboardSearch'
import EmailVerificationNotice from '@/components/dashboard/EmailVerificationNotice'
import { db, setCurrentUserId } from '@/lib/db'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'

export default async function DashboardPage() {
  let t = (k: string) => k
  try { t = await getServerTranslator() } catch {}

  // Auth check — OUTSIDE try/catch so redirect() works properly
  const user = await getAuthUser()
  if (!user) redirect('/login')

  let emailVerified: boolean | null = null
  try {
    setCurrentUserId(user.id)
    const account = await db.query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE id = $1 LIMIT 1',
      [user.id],
    )
    emailVerified = account.rows[0]?.email_verified ?? null
  } catch (err) {
    log({ level: 'warn', message: 'Could not read email verification status', metadata: { error: err } })
  }

  const userIsAdmin = await checkIsAdmin()

  // ponytail: Phase 6 — was `any[]`; now typed via query builder default
  let projects: ProjectCardProject[] = []
  let subscription: Record<string, unknown> | null = null
  let projectsLoadFailed = false
  let subscriptionLoadFailed = false

  try {
    const dbClient = await createClient()

    if (userIsAdmin) {
      subscription = { plan_id: 'enterprise', status: 'active', trial_ends_at: null }
      const { data, error } = await dbClient.from('projects').select('*').order('created_at', { ascending: false })
      if (error) {
        projectsLoadFailed = true
        log({ level: 'error', message: 'Failed to load dashboard projects', metadata: { error } })
      } else {
        projects = (data as unknown as ProjectCardProject[]) ?? []
      }
    } else {
      const [pRes, sRes] = await Promise.all([
        dbClient.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        getSubscription(user.id, user.email ?? undefined).catch((error: unknown) => {
          subscriptionLoadFailed = true
          log({ level: 'warn', message: 'Failed to load dashboard subscription', metadata: { error } })
          return null
        }),
      ])
      if (pRes.error) {
        projectsLoadFailed = true
        log({ level: 'error', message: 'Failed to load dashboard projects', metadata: { error: pRes.error } })
      } else {
        projects = (pRes.data as unknown as ProjectCardProject[]) ?? []
      }
      if (sRes) {
        subscription = {
          plan_id: sRes.plan,
          status: sRes.status,
          trial_ends_at: sRes.trialEndsAt,
        }
      } else if (!subscriptionLoadFailed) {
        subscription = { plan_id: 'free', status: 'active', trial_ends_at: null }
      }
    }
  } catch (err) {
    projectsLoadFailed = true
    subscriptionLoadFailed = !userIsAdmin
    log({ level: 'error', message: 'Failed to load dashboard data', metadata: { error: err } })
  }

  const canCreateProject = !projectsLoadFailed && (
    userIsAdmin || (subscriptionLoadFailed ? projects.length < 1 : subscription?.plan_id !== 'free' || projects.length < 1)
  )
  const trialEndsAt = subscription?.trial_ends_at as string | null | undefined
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
    : null

  /* ── Batch point/parcel counts (avoids N+1 queries) ─────────────── */
  let projectsWithCounts = projects
  let projectCountsLoadFailed = false
  if (projects.length > 0) {
    try {
      const dbClient = await createClient()
      const projectIds = projects.map(p => p.id)

      const [pointsRes, parcelsRes] = await Promise.all([
        dbClient.from('survey_points').select('project_id').in('project_id', projectIds),
        dbClient.from('parcels').select('project_id').in('project_id', projectIds),
      ])

      projectCountsLoadFailed = Boolean(pointsRes.error || parcelsRes.error)
      if (projectCountsLoadFailed) {
        log({
          level: 'warn',
          message: 'Could not refresh dashboard project counts',
          metadata: { pointsError: pointsRes.error, parcelsError: parcelsRes.error },
        })
      }

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
        point_count: projectCountsLoadFailed ? undefined : pointCounts[String(project.id)] ?? 0,
        parcel_count: projectCountsLoadFailed ? undefined : parcelCounts[String(project.id)] ?? 0,
        countsAvailable: !projectCountsLoadFailed,
      }))
    } catch {
      projectCountsLoadFailed = true
      projectsWithCounts = projects.map(project => ({ ...project, countsAvailable: false }))
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-10">
      <OnboardingWrapper />
      <header className="flex flex-col gap-5 border-b border-[var(--border-color)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">METARDU workspace</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">{t('dashboard.title')}</h1>
            {!projectsLoadFailed && (
              <span className="text-sm font-medium text-[var(--text-muted)]">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Keep survey projects, field observations, checks, and deliverables together.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectivityIndicator />
          {!projectsLoadFailed && (!subscriptionLoadFailed || projects.length === 0) && canCreateProject ? (
            <Link href="/project/new" prefetch={false} className="btn btn-primary">
              {t('dashboard.newProject')}
            </Link>
          ) : !projectsLoadFailed && !subscriptionLoadFailed ? (
            <Link href="/pricing" className="btn btn-primary">
              {t('dashboard.upgradeToCreateMore')}
            </Link>
          ) : null}
        </div>
      </header>
      {emailVerified === false && <EmailVerificationNotice email={user.email} />}
      {!subscriptionLoadFailed && <SubscriptionStatus subscription={subscription} />}

      {subscriptionLoadFailed && (
        <div role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Subscription details could not be refreshed. Your survey data is still available; try reloading this page.
        </div>
      )}

      {subscription?.status === 'trial' && daysLeft !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-green-400">
            {daysLeft > 0
              ? `Pro trial active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining. `
              : 'Your trial has ended. '}
            <Link href="/pricing" className="underline hover:text-green-300">Upgrade to keep Pro access →</Link>
          </p>
        </div>
      )}

      {projectsLoadFailed && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your projects could not be loaded</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Your saved survey data has not been changed. Reload the dashboard to try again.</p>
          </div>
          <a href="/dashboard" className="btn btn-secondary shrink-0">Reload dashboard</a>
        </div>
      )}

      {projectCountsLoadFailed && !projectsLoadFailed && (
        <div role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Project point and parcel totals could not be refreshed. Open a project to review its current records.
        </div>
      )}

      {/* UI-13 (2026-07-24): DashboardSearch — 561 LOC component that was
          built but never imported. Now wired in so surveyors can search
          across projects, submissions, and surveyors from the dashboard. */}
      {!projectsLoadFailed && projectsWithCounts.length > 0 && (
        <div>
          <DashboardSearch />
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Field to finish</p>
          <h2 className="font-semibold text-[var(--text-primary)] mb-1">
            {t('dashboard.processFieldNotesTitle')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('dashboard.processFieldNotesSubtitle')}
          </p>
        </div>
        <Link href="/process" prefetch={false} className="btn btn-primary shrink-0">
          {t('dashboard.startProcessing')}
        </Link>
      </section>

      {!projectsLoadFailed && !subscriptionLoadFailed && !canCreateProject && <UpgradePrompt type="projects" />}


      {!projectsLoadFailed && !projectsWithCounts.length ? (
        <section className="grid gap-8 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 md:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="flex flex-col items-start justify-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Start your survey</p>
            <h2 className="max-w-xl text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">One workspace from field points to finished plans.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Set up the project once, then keep its observations, map, checks, and deliverables together as the work progresses.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/project/new" prefetch={false} className="btn btn-primary">Create your first project</Link>
              <Link href="/fieldbook" prefetch={false} className="btn btn-secondary">Open field book</Link>
            </div>
          </div>

          <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { number: '01', title: 'Set up the project', description: 'Choose the survey type and enter its location and coordinate reference.' },
              { number: '02', title: 'Collect field points', description: 'Record observations in the field book and keep the source attached.' },
              { number: '03', title: 'Review and deliver', description: 'Check the map and computations before preparing project outputs.' },
            ].map((step) => (
              <li key={step.number} className="flex gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                <span className="font-mono text-sm font-semibold text-[var(--accent)]">{step.number}</span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : !projectsLoadFailed ? (
        <section aria-label="Your survey projects">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Your projects</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Open a survey to continue collecting, checking, or preparing its records.</p>
            </div>
            <Link href="/fieldbook" prefetch={false} className="btn btn-secondary shrink-0">Open field book</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
            {projectsWithCounts.map((project, index) => (
              <div
                key={project.id}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <ProjectCard project={project} openLabel={t('project.open')} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Activity Feed — recent user actions */}
      <div className="mt-8">
        <ActivityFeed limit={10} />
      </div>
    </div>
  )
}
