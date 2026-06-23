'use client';

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Briefcase, Users, Award, Building2, Search, Star, CheckCircle,
  Clock, ArrowRight, TrendingUp, MessageSquare, ThumbsUp, MapPin,
  Sparkles, Activity, Globe2,
} from 'lucide-react'

interface CommunityStats {
  stats: {
    totalSurveyors: number
    totalJobsPosted: number
    totalReviewsCompleted: number
    totalCPDPointsAwarded: number
  }
  openPeerReviews: number
  surveyorsCount: number
}

export default function CommunityPage() {
  const [stats, setStats] = useState<CommunityStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/community/stats')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const features = [
    {
      icon: Briefcase,
      title: 'Equipment Marketplace',
      tagline: 'Buy · Sell · Rent',
      description:
        'List total stations, GNSS rovers, levels, and accessories. Browse vetted gear from fellow professionals across the region, with secure escrow and verified surveyor-only listings.',
      links: [
        { label: 'Browse Equipment', href: '/marketplace' },
        { label: 'List Your Gear', href: '/marketplace?action=list' },
      ],
      gradient: 'from-blue-500/20 to-cyan-500/10',
      iconColor: 'text-blue-400',
      ring: 'ring-blue-500/30',
    },
    {
      icon: Users,
      title: 'Peer Review',
      tagline: 'Signed-off by peers',
      description:
        'Submit your RIM sheets, deed plans, and computation sheets for review by ISK-licensed surveyors before registry submission. Get structured feedback, signed off digitally for your audit trail.',
      links: [
        { label: 'Submit for Review', href: '/peer-review?tab=submit' },
        { label: 'Review Others', href: '/peer-review?tab=open' },
      ],
      gradient: 'from-purple-500/20 to-fuchsia-500/10',
      iconColor: 'text-purple-400',
      ring: 'ring-purple-500/30',
    },
    {
      icon: Award,
      title: 'CPD Tracker',
      tagline: '20 pts / year',
      description:
        'Automatic ISK CPD point logging for completed jobs, peer reviews, and document signatures. Generate renewal-ready certificates and never miss a licensing deadline again.',
      links: [
        { label: 'View My CPD', href: '/cpd' },
        { label: 'Generate Certificate', href: '/cpd?action=generate' },
      ],
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconColor: 'text-emerald-400',
      ring: 'ring-emerald-500/30',
    },
    {
      icon: Building2,
      title: 'Professional Bodies',
      tagline: 'ISK · LSIA · ISTT',
      description:
        'Link your Institution of Surveyors of Kenya (ISK), Land Surveyors Institute of Africa, or other professional body membership. Verified badges display on your profile and reviews.',
      links: [
        { label: 'Manage Memberships', href: '/profile?tab=bodies' },
        { label: 'Find Surveyors', href: '/community' },
      ],
      gradient: 'from-amber-500/20 to-orange-500/10',
      iconColor: 'text-amber-400',
      ring: 'ring-amber-500/30',
    },
  ]

  const quickActions = [
    {
      icon: Search,
      title: 'Find Equipment',
      subtitle: 'Browse marketplace',
      href: '/marketplace',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      icon: Clock,
      title: 'Track CPD Points',
      subtitle: 'ISK renewal ready',
      href: '/cpd',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      icon: Star,
      title: 'Get Peer Review',
      subtitle: 'Before registry',
      href: '/peer-review',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      icon: MessageSquare,
      title: 'Open Discussions',
      subtitle: '12 new today',
      href: '/community/discussions',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
  ]

  const statCards = [
    {
      icon: Users,
      label: 'Surveyors',
      value: stats?.stats.totalSurveyors || 0,
      color: 'text-blue-400',
      ring: 'ring-blue-500/20',
      glow: 'shadow-blue-500/20',
    },
    {
      icon: Briefcase,
      label: 'Jobs Posted',
      value: stats?.stats.totalJobsPosted || 0,
      color: 'text-emerald-400',
      ring: 'ring-emerald-500/20',
      glow: 'shadow-emerald-500/20',
    },
    {
      icon: CheckCircle,
      label: 'Reviews Done',
      value: stats?.stats.totalReviewsCompleted || 0,
      color: 'text-purple-400',
      ring: 'ring-purple-500/20',
      glow: 'shadow-purple-500/20',
    },
    {
      icon: Award,
      label: 'CPD Points',
      value: stats?.stats.totalCPDPointsAwarded || 0,
      color: 'text-amber-400',
      ring: 'ring-amber-500/20',
      glow: 'shadow-amber-500/20',
    },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ════════════════════════════════════════════════════════════
          HERO SECTION — full-bleed gradient with floating accents
          ════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b border-[var(--border-color)]">
        {/* Background glow accents */}
        <div aria-hidden className="absolute inset-0">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-[var(--accent)]/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {/* Eyebrow chip */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-xs font-medium text-[var(--accent)] uppercase tracking-wider">
              East Africa Surveyor Network
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
              Where surveyors
            </span>
            <br />
            <span className="bg-gradient-to-r from-[var(--accent)] via-amber-400 to-orange-300 bg-clip-text text-transparent">
              connect, grow & deliver
            </span>
          </h1>

          <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mb-8 leading-relaxed">
            The professional hub for licensed surveyors across Kenya and the wider East African
            community. Find equipment, get plans peer-reviewed, track CPD points, and stay
            connected with the field — all in one place.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold transition-all shadow-lg shadow-[var(--accent)]/25 active:scale-95"
            >
              <Briefcase className="w-4 h-4" />
              Explore Marketplace
            </Link>
            <Link
              href="/peer-review?tab=submit"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--accent)]/40 text-[var(--text-primary)] font-medium transition-all active:scale-95"
            >
              <ThumbsUp className="w-4 h-4" />
              Submit for Review
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          STAT DASHBOARD — animated counters, glass cards
          ════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-8 sm:-mt-10 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className={`relative bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 ring-1 ${stat.ring} shadow-lg ${stat.glow} hover:-translate-y-0.5 transition-all`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`grid place-items-center w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums">
                {loading ? (
                  <span className="inline-block w-12 h-7 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                ) : (
                  stat.value.toLocaleString()
                )}
              </div>
              <div className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FEATURE GRID — premium cards with gradient headers
          ════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1">What you can do here</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Four pillars of the METARDU professional community
            </p>
          </div>
          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
            <Activity className="w-3.5 h-3.5" />
            Live data
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:border-[var(--accent)]/40 hover:-translate-y-0.5 transition-all"
            >
              {/* Gradient header strip */}
              <div className={`relative h-1.5 w-full bg-gradient-to-r ${feature.gradient}`} />

              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} ring-1 ${feature.ring} shrink-0`}>
                    <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                        {feature.title}
                      </h3>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">
                        {feature.tagline}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                  {feature.description}
                </p>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-[var(--border-color)]">
                  {feature.links.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--accent)] hover:text-amber-300 hover:bg-[var(--accent)]/10 transition-colors group/link"
                    >
                      {link.label}
                      <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          QUICK ACTIONS RAIL
          ════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <h2 className="text-xl font-semibold mb-4">Quick actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 hover:border-[var(--accent)]/40 hover:bg-[var(--bg-secondary)] transition-all active:scale-95"
            >
              <div className={`grid place-items-center w-10 h-10 rounded-lg ${action.bg} ${action.color} mb-3`}>
                <action.icon className="w-5 h-5" />
              </div>
              <p className="font-semibold text-sm mb-0.5">{action.title}</p>
              <p className="text-xs text-[var(--text-muted)]">{action.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          ISK CPD INFO STRIP
          ════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-5 sm:p-6">
          <div aria-hidden className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500/15 rounded-full blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-blue-500/20 ring-1 ring-blue-500/30 shrink-0">
              <Globe2 className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1.5 flex items-center gap-2 flex-wrap">
                ISK CPD Requirement
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                  20 pts / year
                </span>
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                The Institution of Surveyors of Kenya requires <strong className="text-blue-300">20 CPD points per year</strong>{' '}
                for license renewal. METARDU automatically awards points for completed jobs, peer
                reviews, and document signatures — no manual tracking, no missed deadlines.
              </p>
              <Link
                href="/cpd"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium"
              >
                View your CPD dashboard
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SURVEYOR DIRECTORY TEASER
          ════════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30 shrink-0">
              <MapPin className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Find a licensed surveyor near you</h3>
              <p className="text-sm text-[var(--text-muted)] max-w-xl">
                Browse our verified directory of ISK-licensed surveyors across Kenya, Uganda,
                Tanzania, Rwanda, and Ethiopia. Filter by county, specialty, and availability.
              </p>
            </div>
          </div>
          <Link
            href="/community/directory"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--accent)]/15 border border-[var(--border-color)] hover:border-[var(--accent)]/40 text-sm font-medium whitespace-nowrap transition-all active:scale-95"
          >
            Open Directory
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
