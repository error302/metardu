'use client';

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Users, MessageSquare, FileCheck2,
  Search, ArrowRight, Star, MapPin,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

// Real stats fetched from /api/community/stats
interface CommunityStats {
  totalSurveyors: number
  totalReviewsCompleted: number
  surveyorsCount: number
}

export default function CommunityPage() {
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<CommunityStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/community/stats')
      .then(res => res.json())
      .then(data => {
        setStats({
          totalSurveyors: data.stats?.totalSurveyors ?? 0,
          totalReviewsCompleted: data.stats?.totalReviewsCompleted ?? 0,
          surveyorsCount: data.surveyorsCount ?? 0,
        })
      })
      .catch(() => {
        setStats({ totalSurveyors: 0, totalReviewsCompleted: 0, surveyorsCount: 0 })
      })
      .finally(() => setLoading(false))
  }, [])

  const statCards = [
    { label: 'Registered Surveyors', value: stats ? stats.surveyorsCount.toLocaleString() : '—', icon: Users },
    { label: 'Peer Reviews', value: stats ? stats.totalReviewsCompleted.toLocaleString() : '—', icon: FileCheck2 },
    { label: 'Countries', value: '14', icon: MapPin },
    { label: 'Languages', value: '14', icon: MessageSquare },
  ]

  // Honest empty state — discussions feature is coming soon
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        title="Surveyor Community"
        subtitle="Connect with fellow surveyors across East Africa"
        reference="ISK · EBK · ISU · RICS · FIG"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                  {loading ? '...' : stat.value}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Coming soon banner */}
      <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center shrink-0">
            <MessageSquare className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Community Discussions — Coming Soon
            </h2>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
              We're building a discussion forum where surveyors can ask questions, share knowledge,
              and collaborate on challenging surveys. Features will include topic threads,
              expert peer reviews, and CPD-eligible knowledge sharing.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                Discussion threads
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                Expert Q&A
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                Peer review requests
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                Job marketplace
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What's available now */}
      <div className="grid md:grid-cols-2 gap-6">
        <Link
          href="/marketplace"
          className="group p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-all no-underline"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)]">Equipment Marketplace</h3>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-3">
            Buy, sell, and rent survey equipment. Total stations, GNSS rovers, levels, accessories.
          </p>
          <span className="text-xs text-[var(--accent)] font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            Browse listings <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/cpd"
          className="group p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-all no-underline"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
              <FileCheck2 className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)]">CPD Tracking</h3>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-3">
            Track your Continuing Professional Development points. Auto-logged when you use METARDU tools.
          </p>
          <span className="text-xs text-[var(--accent)] font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            View your CPD <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
    </div>
  )
}
