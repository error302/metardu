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
  ChevronRight,
  Clock,
  Compass,
  FileCheck2,
  Globe2,
  MapPin,
  MessageSquare,
  RadioTower,
  Search,
  ShieldCheck,
  Star,
  Store,
  Target,
  Users,
  Zap,
  Eye,
  AlertTriangle,
  Crosshair,
  Cpu,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

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
  { name: 'Amina Otieno', region: 'Nairobi County', county: 'Nairobi', specialty: 'Cadastral & mutation plans', tags: ['Cadastral', 'Mutation'], rating: '4.9', jobs: '128', status: 'Available this week', license: 'ISK/LS/2021/0452' },
  { name: 'Brian Kiplagat', region: 'Uasin Gishu', county: 'Eldoret', specialty: 'GNSS control & road corridors', tags: ['GNSS', 'Roads'], rating: '4.8', jobs: '91', status: 'Field crew ready', license: 'ISK/LS/2019/0318' },
  { name: 'Grace Wanjiku', region: 'Mombasa County', county: 'Mombasa', specialty: 'Hydrographic & port surveys', tags: ['Hydro', 'Port'], rating: '4.9', jobs: '74', status: 'Review slots open', license: 'ISK/LS/2020/0287' },
]

const peerReviewQueue = [
  { title: 'Subdivision deed plan check', meta: 'Kiambu / 12 parcels / bearings & area table', status: 'reviewers', count: 2, href: '/peer-review?tab=open' },
  { title: 'RIM amendment package', meta: 'Kajiado / registry submission prep', status: 'urgent', count: 0, href: '/peer-review?tab=open' },
  { title: 'Road reserve acquisition plan', meta: 'Machakos / wayleave & beacon schedule', status: 'new', count: 0, href: '/peer-review?tab=open' },
]

const equipmentListings = [
  { title: 'Leica TS07 total station', condition: 'Calibrated', location: 'Nairobi', price: 'KSh 310,000', type: 'sale', href: '/marketplace' },
  { title: 'Emlid Reach RS2 rover pair', condition: 'RTK tested', location: 'Eldoret', price: 'KSh 8,000/day', type: 'rental', href: '/marketplace' },
  { title: 'Auto level kit', condition: 'Student friendly', location: 'Kisumu', price: 'KSh 35,000', type: 'sale', href: '/marketplace' },
]

const discussionTopics = [
  { title: 'Handling legacy Cassini coordinates in mixed estates', replies: 18, category: 'Standards', pinned: false },
  { title: 'Recommended control density for rural road design', replies: 7, category: 'Road Design', pinned: false },
  { title: 'Peer-review checklist for mutation plans', replies: 12, category: 'Workflow', pinned: true },
]

const regionalCoverage = [
  { region: 'Kenya', count: '1,284', flag: '🇰🇪', detail: 'ISK, county & registry workflows' },
  { region: 'Uganda', count: '214', flag: '🇺🇬', detail: 'Control & infrastructure' },
  { region: 'Tanzania', count: '188', flag: '🇹🇿', detail: 'Field crews & equipment' },
  { region: 'Rwanda', count: '96', flag: '🇷🇼', detail: 'GNSS & topographic teams' },
]

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString()
}

// ---------------------------------------------------------------------------
// SVG Components — Custom survey-specific icons
// ---------------------------------------------------------------------------

/** Theodolite / Total Station icon */
function TheodoliteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M8 6h8M12 6v4" />
      <circle cx="12" cy="13" r="4" />
      <path d="M12 9v1M12 16v1" />
      <path d="M8.5 10.5l.7.7M14.8 14.8l.7.7M8.5 15.5l.7-.7M14.8 11.2l.7-.7" />
      <path d="M6 20h12M9 17v3M15 17v3" />
    </svg>
  )
}

/** Tripod icon */
function TripodIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v10M8 21l4-8M16 21l-4-8M6 10l6 2M18 10l-6 2" />
      <circle cx="12" cy="3" r="1.5" />
    </svg>
  )
}

/** Beacon / Monument icon */
function BeaconIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3" />
      <path d="M12 11v6M8 17h8M9 21h6" />
      <path d="M10 4l2-2 2 2" />
    </svg>
  )
}

/** Level Staff icon */
function LevelStaffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="2" width="4" height="20" rx="1" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
      <path d="M10 4h4" strokeWidth="2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// CPD Progress Ring (SVG)
// ---------------------------------------------------------------------------

function CpdRing({ percent, points, target }: { percent: number; points: number; target: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} stroke="var(--border-color)" strokeWidth="6" fill="none" />
        <circle
          cx="50" cy="50" r={radius}
          stroke="#34d399"
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold text-[var(--text-primary)]">{points}</span>
        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">of {target}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    urgent: { bg: 'bg-red-500/10 border-red-500/25', text: 'text-red-400', icon: <AlertTriangle className="w-3 h-3" /> },
    reviewers: { bg: 'bg-blue-500/10 border-blue-500/25', text: 'text-blue-400', icon: <Eye className="w-3 h-3" /> },
    new: { bg: 'bg-amber-500/10 border-amber-500/25', text: 'text-amber-400', icon: <Zap className="w-3 h-3" /> },
    active: { bg: 'bg-green-500/10 border-green-500/25', text: 'text-green-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    guide: { bg: 'bg-purple-500/10 border-purple-500/25', text: 'text-purple-400', icon: <Compass className="w-3 h-3" /> },
    sale: { bg: 'bg-emerald-500/10 border-emerald-500/25', text: 'text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    rental: { bg: 'bg-sky-500/10 border-sky-500/25', text: 'text-sky-400', icon: <Clock className="w-3 h-3" /> },
  }
  const c = config[status] || config.new

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${c.bg} ${c.text}`}>
      {c.icon}
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CommunityPage() {
  const [stats, setStats] = useState<CommunityStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/community/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setStats(data) })
      .catch(() => { if (!cancelled) setStats(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reviewCount = useMemo(() => stats?.openPeerReviews ?? 0, [stats])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
              <TheodoliteIcon className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">East Africa Surveyor Network</h1>
              <p className="text-sm text-[var(--text-muted)]">Professional community for cadastral, engineering &amp; GNSS surveyors</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/community/directory" className="btn btn-primary text-sm flex items-center gap-2">
            <Search className="w-4 h-4" /> Find Surveyor
          </Link>
          <Link href="/peer-review?tab=submit" className="btn btn-secondary text-sm flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" /> Submit Review
          </Link>
        </div>
      </div>

      {/* ── Live Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{loading ? '—' : formatCount(stats?.stats.totalSurveyors)}</p>
            <p className="text-xs text-[var(--text-muted)]">Verified Surveyors</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{loading ? '—' : formatCount(stats?.stats.totalReviewsCompleted)}</p>
            <p className="text-xs text-[var(--text-muted)]">Reviews Completed</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{loading ? '—' : formatCount(stats?.stats.totalCPDPointsAwarded)}</p>
            <p className="text-xs text-[var(--text-muted)]">CPD Points Earned</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{loading ? '—' : reviewCount}</p>
            <p className="text-xs text-[var(--text-muted)]">Open Peer Reviews</p>
          </div>
        </div>
      </div>

      {/* ── Main Content: Directory + Sidebar ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* ── Surveyor Directory ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Verified Surveyor Directory</h2>
              </div>
              <Link href="/community/directory" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                Open directory <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {surveyorDirectory.map((s) => (
                <Link key={s.name} href="/community/directory" className="card p-5 hover:border-[var(--accent)]/30 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] text-xs font-bold shrink-0">
                          {s.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">{s.name}</h3>
                          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {s.county}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-amber-400 shrink-0">
                      <Star className="w-3.5 h-3.5 fill-current" /> {s.rating}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                        {tag}
                      </span>
                    ))}
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--accent)]/5 text-[var(--accent)] border border-[var(--accent)]/20 flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5" /> ISK
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{s.specialty}</p>
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-muted)]">{s.jobs} completed jobs</span>
                    <span className="text-green-400 font-medium">{s.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Plan Review Desk ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Plan Review Desk</h2>
              </div>
              <Link href="/peer-review?tab=open" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                Review queue <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="card divide-y divide-[var(--border-color)]">
              {peerReviewQueue.map((item, i) => (
                <Link key={i} href={item.href} className="flex items-center gap-4 p-4 hover:bg-[var(--bg-tertiary)]/50 transition-colors first:rounded-t-xl last:rounded-b-xl">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.meta}</p>
                  </div>
                  <StatusBadge status={item.status} />
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          {/* ── Regional Coverage ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Globe2 className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Regional Coverage</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {regionalCoverage.map((item) => (
                <div key={item.region} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.flag}</span>
                      <h3 className="font-semibold text-[var(--text-primary)]">{item.region}</h3>
                    </div>
                    <RadioTower className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{item.count}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Discussions ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Discussions</h2>
              </div>
              <Link href="/community/discussions" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                Open board <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="card divide-y divide-[var(--border-color)]">
              {discussionTopics.map((item, i) => (
                <Link key={i} href="/community/discussions" className="flex items-center gap-4 p-4 hover:bg-[var(--bg-tertiary)]/50 transition-colors first:rounded-t-xl last:rounded-b-xl">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.pinned ? 'bg-amber-500/10' : 'bg-[var(--bg-tertiary)]'}`}>
                    <MessageSquare className={`w-4 h-4 ${item.pinned ? 'text-amber-400' : 'text-[var(--text-muted)]'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                      {item.pinned && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium shrink-0">Pinned</span>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{item.replies} replies · {item.category}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-6">
          {/* CPD Progress */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Award className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">CPD Progress</h3>
                <p className="text-[10px] text-[var(--text-muted)]">Annual renewal target</p>
              </div>
            </div>
            <div className="flex items-center justify-center py-2">
              <CpdRing percent={65} points={13} target={20} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] text-center mt-2">
              13 of 20 CPD points earned this year
            </p>
            <Link href="/cpd" className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline">
              Open CPD dashboard <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Equipment Market */}
          <div className="card">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Equipment Market</h3>
              </div>
              <Link href="/marketplace" className="text-[10px] text-[var(--accent)] hover:underline">Browse</Link>
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {equipmentListings.map((item, i) => (
                <Link key={i} href={item.href} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'rental' ? 'bg-sky-500/10' : 'bg-emerald-500/10'}`}>
                    {item.type === 'rental' ? <Clock className="w-3.5 h-3.5 text-sky-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{item.condition} · {item.location}</p>
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] shrink-0">{item.price}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Network Status */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Network Status</h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border border-green-500/25 bg-green-500/10 text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Open reviews</span>
                <span className="font-semibold text-[var(--text-primary)]">{loading ? '—' : reviewCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Verified professionals</span>
                <span className="font-semibold text-[var(--text-primary)]">{loading ? '—' : formatCount(stats?.surveyorsCount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Countries active</span>
                <span className="font-semibold text-[var(--text-primary)]">5</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom Feature Cards ── */}
      <section className="grid gap-4 md:grid-cols-4 border-t border-[var(--border-color)] pt-8">
        {[
          { icon: ShieldCheck, label: 'Verified Membership', text: 'Professional-body badges, ISK verification, and reviewer history visible on every profile.' },
          { icon: Cpu, label: 'Field-Ready Workflows', text: 'Direct access to COGO tools, review pipelines, crew coordination, and instrument connections.' },
          { icon: CalendarClock, label: 'Renewal Support', text: 'CPD logs and peer-review certificates stay attached to your work automatically.' },
          { icon: Building2, label: 'Firm Visibility', text: 'Teams showcase coverage areas, equipment inventories, and specialty certifications.' },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
              <item.icon className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
