'use client';

import { useState } from 'react'
import Link from 'next/link'
import {
  Users, MessageSquare, FileCheck2, TrendingUp,
  Search, ArrowRight, Star, MapPin,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

const stats = [
  { label: 'Active Surveyors', value: '2,400+', icon: Users },
  { label: 'Peer Reviews', value: '890', icon: FileCheck2 },
  { label: 'Discussions', value: '1,200', icon: MessageSquare },
  { label: 'Countries', value: '14', icon: MapPin },
]

const discussions = [
  { title: 'Best practice for Cassini-Soldner to UTM conversion in Nairobi', author: 'J. Mwangi', replies: 24, views: 312, tags: ['Cadastral', 'Coordinate Systems'] },
  { title: 'KeNHA road project — Bowditch vs Least Squares for control traverse', author: 'P. Achieng', replies: 18, views: 245, tags: ['Engineering', 'Traverse'] },
  { title: 'RTK float vs fixed — when is it acceptable for cadastral?', author: 'S. Kimani', replies: 31, views: 489, tags: ['GNSS', 'Cadastral'] },
  { title: 'NLIMS submission format changes 2026', author: 'M. Omondi', replies: 12, views: 201, tags: ['NLIMS', 'Submission'] },
]

const topSurveyors = [
  { name: 'J. Mwangi', license: 'ISK/LS/2018/042', reviews: 47, rating: 4.9, location: 'Nairobi' },
  { name: 'P. Achieng', license: 'ISK/LS/2019/118', reviews: 39, rating: 4.8, location: 'Kisumu' },
  { name: 'S. Kimani', license: 'ISK/LS/2017/035', reviews: 35, rating: 4.9, location: 'Mombasa' },
  { name: 'M. Omondi', license: 'ISK/LS/2020/156', reviews: 28, rating: 4.7, location: 'Eldoret' },
]

export default function CommunityPage() {
  const [query, setQuery] = useState('')

  const filteredDiscussions = discussions.filter(d =>
    d.title.toLowerCase().includes(query.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        title="Surveyor Community"
        subtitle="Connect with fellow surveyors, share knowledge, and get peer reviews"
        reference="ISK · EBK · ISU · RICS · FIG affiliated"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <span className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Discussions */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-widest">
              Recent Discussions
            </h2>
            <Link href="/community/new" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              New post <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search discussions..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Discussion list */}
          <div className="space-y-3">
            {filteredDiscussions.map((d, i) => (
              <Link
                key={i}
                href={`/community/${i}`}
                className="block p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-all no-underline"
              >
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{d.title}</h3>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>by {d.author}</span>
                  <span>·</span>
                  <span>{d.replies} replies</span>
                  <span>·</span>
                  <span>{d.views} views</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {d.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Top surveyors sidebar */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-5">
            Top Contributors
          </h2>
          <div className="space-y-3">
            {topSurveyors.map((s, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] font-bold text-sm">
                    {s.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{s.license}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-[var(--text-muted)]">
                    <MapPin className="w-3 h-3" />
                    {s.location}
                  </span>
                  <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                    <Star className="w-3 h-3 text-amber-400" />
                    {s.rating} · {s.reviews} reviews
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Peer review CTA */}
          <Link
            href="/peer-review"
            className="block mt-4 p-5 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40 transition-all no-underline"
          >
            <div className="flex items-center gap-3 mb-2">
              <FileCheck2 className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Peer Review</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
              Submit your survey plans for review by licensed colleagues. Earn CPD points for each review completed.
            </p>
            <span className="text-xs text-[var(--accent)] font-medium flex items-center gap-1">
              Request a review <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
