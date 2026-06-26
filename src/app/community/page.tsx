'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  MapPin,
  MessageSquare,
  RadioTower,
  Search,
  ShieldCheck,
  Star,
  Store,
  Users,
} from 'lucide-react'
import {
  ActivityRow,
  WorkspaceHero,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceStat,
  WorkspaceStats,
} from '@/components/shared/WorkspacePage'

interface CommunityStats {
  stats: {
    totalSurveyors: number
    totalReviewsCompleted: number
    totalCPDPointsAwarded: number
  }
  openPeerReviews: number
  surveyorsCount: number
}

const surveyorDirectory = [
  {
    name: 'Amina Otieno',
    region: 'Nairobi County',
    specialty: 'Cadastral and mutation plans',
    rating: '4.9',
    jobs: '128',
    status: 'Available this week',
  },
  {
    name: 'Brian Kiplagat',
    region: 'Uasin Gishu',
    specialty: 'GNSS control and road corridors',
    rating: '4.8',
    jobs: '91',
    status: 'Field crew ready',
  },
  {
    name: 'Grace Wanjiku',
    region: 'Mombasa County',
    specialty: 'Hydrographic and port surveys',
    rating: '4.9',
    jobs: '74',
    status: 'Review slots open',
  },
]

const peerReviewQueue = [
  {
    title: 'Subdivision deed plan check',
    meta: 'Kiambu / 12 parcels / bearings and area table',
    status: '2 reviewers',
    href: '/peer-review?tab=open',
  },
  {
    title: 'RIM amendment package',
    meta: 'Kajiado / registry submission prep',
    status: 'urgent',
    href: '/peer-review?tab=open',
  },
  {
    title: 'Road reserve acquisition plan',
    meta: 'Machakos / wayleave and beacon schedule',
    status: 'new',
    href: '/peer-review?tab=open',
  },
]

const equipmentListings = [
  {
    title: 'Leica TS07 total station',
    meta: 'Nairobi / calibrated / tripod included',
    price: 'KSh 310k',
    href: '/marketplace',
  },
  {
    title: 'Emlid Reach RS2 rover pair',
    meta: 'Eldoret / RTK tested / rental available',
    price: 'KSh 8k/day',
    href: '/marketplace',
  },
  {
    title: 'Auto level kit',
    meta: 'Kisumu / staff and stand / student friendly',
    price: 'KSh 35k',
    href: '/marketplace',
  },
]


const discussionTopics = [
  {
    title: 'Handling legacy Cassini coordinates in mixed estates',
    meta: '18 replies / Survey standards',
    status: 'active',
  },
  {
    title: 'Recommended control density for rural road design',
    meta: '7 replies / Road design',
    status: 'field notes',
  },
  {
    title: 'Peer-review checklist for mutation plans',
    meta: 'Pinned / Document workflow',
    status: 'guide',
  },
]

const regionalCoverage = [
  { region: 'Kenya', count: '1,284', detail: 'ISK, county, registry workflows' },
  { region: 'Uganda', count: '214', detail: 'Control and infrastructure jobs' },
  { region: 'Tanzania', count: '188', detail: 'Field crews and equipment rentals' },
  { region: 'Rwanda', count: '96', detail: 'GNSS control and topographic teams' },
]

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString()
}

export default function CommunityPage() {
  const [stats, setStats] = useState<CommunityStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/api/community/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const reviewCount = useMemo(() => stats?.openPeerReviews ?? 0, [stats])

  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="East Africa Surveyor Network"
        title="Find crews, review plans, source instruments, and keep your CPD moving."
        subtitle="A working community layer for cadastral, engineering, GNSS, hydrographic, and mining survey teams across the region."
        primaryAction={{ label: 'Find a Surveyor', href: '/community/directory', icon: Search }}
        secondaryAction={{ label: 'Submit Plan Review', href: '/peer-review?tab=submit', icon: FileCheck2 }}
        aside={
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Network status</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Live professional activity</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Online
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Open reviews</span>
                <span className="font-semibold text-[var(--text-primary)]">{loading ? '...' : reviewCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Verified professionals</span>
                <span className="font-semibold text-[var(--text-primary)]">{loading ? '...' : formatCount(stats?.surveyorsCount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Regional coverage</span>
                <span className="font-semibold text-[var(--text-primary)]">5 countries</span>
              </div>
            </div>
          </div>
        }
      />

      <WorkspaceStats>
        <WorkspaceStat
          icon={Users}
          label="Surveyors"
          value={formatCount(stats?.stats.totalSurveyors)}
          detail="verified"
          loading={loading}
        />
        <WorkspaceStat
          icon={CheckCircle2}
          label="Reviews Done"
          value={formatCount(stats?.stats.totalReviewsCompleted)}
          detail="audit trail"
          loading={loading}
        />
        <WorkspaceStat
          icon={Award}
          label="CPD Points"
          value={formatCount(stats?.stats.totalCPDPointsAwarded)}
          detail="earned"
          loading={loading}
        />
      </WorkspaceStats>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="space-y-2">
          <WorkspaceSection
            title="Verified Surveyor Directory"
            subtitle="Shortlist professionals by county, specialty, availability, and completed work."
            action={{ label: 'Open directory', href: '/community/directory' }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              {surveyorDirectory.map((surveyor) => (
                <Link
                  key={surveyor.name}
                  href="/community/directory"
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--accent)]/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{surveyor.name}</h3>
                        <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <MapPin className="h-3.5 w-3.5" />
                        {surveyor.region}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {surveyor.rating}
                    </span>
                  </div>
                  <p className="mt-4 min-h-[40px] text-sm leading-5 text-[var(--text-secondary)]">
                    {surveyor.specialty}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3 text-xs">
                    <span className="text-[var(--text-muted)]">{surveyor.jobs} completed jobs</span>
                    <span className="text-green-300">{surveyor.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Plan Review Desk"
            subtitle="Move registry-bound work through peer review before submission."
            action={{ label: 'Review queue', href: '/peer-review?tab=open' }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 md:col-span-1">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-purple-500/10 text-purple-300">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Registry readiness</h3>
                <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
                  Attach computation sheets, deed plans, beacon schedules, and review notes in one audit trail.
                </p>
                <Link href="/peer-review?tab=submit" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                  Submit package
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-3 md:col-span-2">
                {peerReviewQueue.map((item) => (
                  <ActivityRow
                    key={item.title}
                    icon={FileCheck2}
                    title={item.title}
                    meta={item.meta}
                    status={item.status}
                    href={item.href}
                  />
                ))}
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Regional Coverage"
            subtitle="Where the network is currently strongest."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {regionalCoverage.map((item) => (
                <div key={item.region} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{item.region}</h3>
                    <RadioTower className="h-4 w-4 text-[var(--accent)]" />
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums">{item.count}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        </div>

        <aside className="space-y-6">
          <WorkspaceSection
            title="Equipment Market"
            subtitle="Buy, sell, or rent field-ready instruments."
            action={{ label: 'Browse', href: '/marketplace' }}
            className="py-0"
          >
            <div className="space-y-3">
              {equipmentListings.map((item) => (
                <ActivityRow
                  key={item.title}
                  icon={Store}
                  title={item.title}
                  meta={item.meta}
                  status={item.price}
                  href={item.href}
                />
              ))}
            </div>
          </WorkspaceSection>

          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <Award className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">CPD Progress</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Track peer reviews, signed documents, jobs, and training toward annual renewal.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-[var(--bg-tertiary)] p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Annual target</span>
                <span className="font-semibold text-emerald-300">20 pts</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/30">
                <div className="h-full w-[65%] rounded-full bg-emerald-400" />
              </div>
            </div>
            <Link href="/cpd" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
              Open CPD dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <WorkspaceSection
            title="Discussions"
            subtitle="Practical notes from active survey teams."
            action={{ label: 'Open board', href: '/community/discussions' }}
            className="py-0"
          >
            <div className="space-y-3">
              {discussionTopics.map((item) => (
                <ActivityRow
                  key={item.title}
                  icon={MessageSquare}
                  title={item.title}
                  meta={item.meta}
                  status={item.status}
                  href="/community/discussions"
                />
              ))}
            </div>
          </WorkspaceSection>
        </aside>
      </div>

      <section className="mt-6 grid gap-3 border-t border-[var(--border-color)] pt-6 md:grid-cols-4">
        {[
          { icon: ShieldCheck, label: 'Verified membership', text: 'Professional-body badges and reviewer history.' },
          { icon: Gauge, label: 'Field-ready workflows', text: 'Fast access to tools, reviews, jobs, and crews.' },
          { icon: CalendarClock, label: 'Renewal support', text: 'CPD logs and certificates stay attached to work.' },
          { icon: Building2, label: 'Firm visibility', text: 'Teams can show coverage, equipment, and specialties.' },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
            <div>
              <h3 className="text-sm font-semibold">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.text}</p>
            </div>
          </div>
        ))}
      </section>
    </WorkspacePage>
  )
}
