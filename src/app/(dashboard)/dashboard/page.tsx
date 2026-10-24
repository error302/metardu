export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import SubscriptionStatus from '@/components/SubscriptionStatus'
import { getServerTranslator } from '@/lib/i18n/server'
import { log } from '@/lib/logger'
import { getAuthUser, isPlatformAdmin as checkIsAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/api-client/server'

import ProjectCard, { type ProjectCardProject } from '@/components/ProjectCard'
import { ConnectivityIndicator } from '@/components/shared/ConnectivityIndicator'
import OnboardingWrapper from '@/components/shared/OnboardingWrapper'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import DashboardSearch from '@/components/dashboard/DashboardSearch'
import EmailVerificationNotice from '@/components/dashboard/EmailVerificationNotice'
import { db, setCurrentUserId } from '@/lib/db'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  FolderKanban,
  MapPinned,
  Plus,
  Ruler,
} from 'lucide-react'

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
  const trialEndsAtMs = trialEndsAt ? Date.parse(trialEndsAt) : Number.NaN
  const daysLeft = Number.isFinite(trialEndsAtMs)
    ? Math.max(0, Math.ceil((trialEndsAtMs - Date.now()) / 86400000))
    : null
  const firstName = user.name.trim().split(/\s+/)[0] || 'surveyor'

  /* ── Batch point/parcel counts (avoids N+1 queries) ─────────────── */
  let projectsWithCounts = projects
  let projectCountsLoadFailed = projectsLoadFailed
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

  const totalPointCount = projectCountsLoadFailed
    ? null
    : projectsWithCounts.reduce((total, project) => total + (project.point_count ?? 0), 0)
  const totalParcelCount = projectCountsLoadFailed
    ? null
    : projectsWithCounts.reduce((total, project) => total + (project.parcel_count ?? 0), 0)
  const formatCount = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-KE').format(value)

  const dashboardMetrics = [
    {
      label: 'Projects',
      value: projectsLoadFailed ? '—' : formatCount(projects.length),
      note: userIsAdmin ? 'Across the platform' : 'In your workspace',
      icon: FolderKanban,
    },
    {
      label: 'Field points',
      value: formatCount(totalPointCount),
      note: totalPointCount === null ? 'Count temporarily unavailable' : 'Saved survey observations',
      icon: MapPinned,
    },
    {
      label: 'Parcels',
      value: formatCount(totalParcelCount),
      note: totalParcelCount === null ? 'Count temporarily unavailable' : 'Recorded in projects',
      icon: Ruler,
    },
  ]

  const quickActions = [
    { href: '/field/collect', title: 'Capture field data', detail: 'Connect an instrument or start a field session', icon: MapPinned },
    { href: '/fieldbook', title: 'Open field book', detail: 'Review and manage survey observations', icon: ClipboardList },
    { href: '/process', title: 'Process survey data', detail: 'Import notes and run a supported workflow', icon: Ruler },
  ]

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border-color)] border-l-2 border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--bg-card))] px-5 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-8 -top-10 opacity-[0.045]" aria-hidden="true">
          <Ruler className="h-56 w-56 rotate-[-24deg]" strokeWidth={0.8} />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              {userIsAdmin ? 'METARDU operations' : 'METARDU survey workspace'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] sm:text-4xl">
                {t('dashboard.title')}
              </h1>
              <ConnectivityIndicator />
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
              Welcome back, {firstName}. Pick up a survey, capture field observations, or move a project toward delivery.
            </p>
          </div>
          <div className="relative flex shrink-0 flex-wrap items-center gap-3">
            {userIsAdmin && <Link href="/admin" prefetch={false} className="btn btn-secondary inline-flex items-center gap-2">Administration <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>}
            {!projectsLoadFailed && (!subscriptionLoadFailed || projects.length === 0) && canCreateProject ? (
              <Link href="/project/new" prefetch={false} className="btn btn-primary inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('dashboard.newProject')}
              </Link>
            ) : !projectsLoadFailed && !subscriptionLoadFailed ? (
              <Link href="/pricing" className="btn btn-primary inline-flex items-center gap-2">
                {t('dashboard.upgradeToCreateMore')}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <OnboardingWrapper compact />

      <section aria-label="Workspace totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {dashboardMetrics.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="flex min-w-0 items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent)]">
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-mono text-2xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">{value}</p>
                <p className="text-xs text-[var(--text-muted)]">{note}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
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

      {!projectsLoadFailed && projectsWithCounts.length > 0 && (
        <section aria-label="Search survey records" className="flex flex-col gap-3 border-y border-[var(--border-color)] py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Find a project or record</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Search projects, submissions, and surveyors.</p>
          </div>
          <div className="w-full sm:max-w-md">
            <DashboardSearch />
          </div>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
        <div className="min-w-0">
          {!projectsLoadFailed && !projectsWithCounts.length ? (
            <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)] lg:p-8">
                <div className="flex flex-col items-start justify-center">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Start your survey</p>
                  <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-[var(--text-primary)] md:text-3xl">One workspace from field points to reviewed plans.</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                    Set up the job once, then keep its observations, reference system, checks, and deliverables together as work progresses.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/project/new" prefetch={false} className="btn btn-primary inline-flex items-center gap-2">Create your first project <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    <Link href="/fieldbook" prefetch={false} className="btn btn-secondary">Open field book</Link>
                  </div>
                </div>
                <ol className="grid content-center gap-2.5">
                  {[
                    { number: '01', title: 'Set up the project', description: 'Choose the survey type and establish its location and coordinate reference.' },
                    { number: '02', title: 'Capture observations', description: 'Keep field measurements and their source with the project.' },
                    { number: '03', title: 'Review and deliver', description: 'Check the map and computations before preparing outputs.' },
                  ].map((step) => (
                    <li key={step.number} className="flex gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3.5">
                      <span className="pt-0.5 font-mono text-xs font-semibold text-[var(--accent)]">{step.number}</span>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : !projectsLoadFailed ? (
            <section aria-label={userIsAdmin ? 'Survey projects' : 'Your survey projects'}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Project register</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{userIsAdmin ? 'Survey projects' : 'Your projects'}</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">Open a project to continue collecting, checking, or preparing its records.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                {projectsWithCounts.map((project, index) => (
                  <div
                    key={project.id}
                    className="animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
                    style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                  >
                    <ProjectCard project={project} openLabel={t('project.open')} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5" aria-label="Survey workflow and activity">
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Move work forward</h2>
                <p className="text-xs text-[var(--text-muted)]">Field to office, in a few steps.</p>
              </div>
            </div>
            <nav aria-label="Survey workflow shortcuts" className="divide-y divide-[var(--border-color)]">
              {quickActions.map(({ href, title, detail, icon: Icon }) => (
                <Link key={href} href={href} prefetch={false} className="group flex items-center gap-3 py-3 first:pt-1 last:pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:text-[var(--accent)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{detail}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </section>
          <ActivityFeed limit={6} />
        </aside>
      </div>
    </div>
  )
}
