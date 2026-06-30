'use client'

/**
 * ActivityFeed — Dashboard widget showing recent user activity
 *
 * Shows a chronological feed of:
 * - Project created/updated
 * - Documents generated
 * - Fieldbook entries saved
 * - Computations run
 * - Peer review submissions
 *
 * Fetches from /api/activity
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  FolderKanban, FileText, MapPin, Calculator, FileCheck2,
  Users, CreditCard, Settings, Activity as ActivityIcon,
  Loader2, ChevronRight, Clock,
} from 'lucide-react'

interface Activity {
  id: string
  project_id: string | null
  activity_type: string
  entity_type: string | null
  entity_id: string | null
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

const ACTIVITY_ICONS: Record<string, typeof FolderKanban> = {
  project_created: FolderKanban,
  project_updated: FolderKanban,
  document_generated: FileText,
  fieldbook_saved: FileText,
  computation_run: Calculator,
  map_capture: MapPin,
  peer_review_submitted: FileCheck2,
  peer_review_completed: FileCheck2,
  team_invite: Users,
  payment_received: CreditCard,
  settings_changed: Settings,
}

const ACTIVITY_COLORS: Record<string, string> = {
  // v0.3: single sienna accent + muted grays (impeccable compliance)
  project_created: 'text-[var(--accent)] bg-[var(--accent)]/10',
  project_updated: 'text-[var(--accent)] bg-[var(--accent)]/10',
  document_generated: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
  fieldbook_saved: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
  computation_run: 'text-[var(--success)] bg-[var(--success)]/10',
  map_capture: 'text-[var(--accent)] bg-[var(--accent)]/10',
  peer_review_submitted: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
  peer_review_completed: 'text-[var(--success)] bg-[var(--success)]/10',
  team_invite: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
  payment_received: 'text-[var(--success)] bg-[var(--success)]/10',
  settings_changed: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]',
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })
}

export function ActivityFeed({ limit = 10 }: { limit?: number }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/activity?limit=${limit}`)
      if (!res.ok) throw new Error('Failed to load activity')
      const data = await res.json()
      setActivities(data.data?.activities || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchActivities()
    const interval = setInterval(fetchActivities, 30000) // 30s refresh
    return () => clearInterval(interval)
  }, [fetchActivities])

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-[var(--border-color)]">
        <div>
          <h3 className="font-display text-lg text-[var(--text-primary)] tracking-[-0.015em]">Today</h3>
          <p className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mt-0.5">Recent activity</p>
        </div>
        <Link
          href="/activity"
          className="font-mono text-[10px] text-[var(--accent)] hover:opacity-80 tracking-[0.06em] uppercase no-underline"
        >
          All →
        </Link>
      </div>

      {/* Activity list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <button
            onClick={fetchActivities}
            className="mt-2 font-mono text-[10px] text-[var(--accent)] hover:opacity-80 tracking-[0.06em] uppercase"
          >
            Retry
          </button>
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="w-7 h-7 text-[var(--text-muted)] mb-2" strokeWidth={1.5} />
          <p className="text-sm text-[var(--text-secondary)]">No recent activity</p>
          <p className="font-mono text-[10px] text-[var(--text-muted)] mt-1 tracking-[0.04em]">
            Create a project or run a computation to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {activities.map((activity, idx) => {
            const Icon = ACTIVITY_ICONS[activity.activity_type] || ActivityIcon
            const colorClass = ACTIVITY_COLORS[activity.activity_type] || 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]'
            const href = activity.project_id ? `/project/${activity.project_id}` : null

            const content = (
              <>
                {/* Timeline dot — single sienna accent, no multi-color */}
                {idx < activities.length - 1 && (
                  <div className="absolute left-[11px] top-8 bottom-0 w-px bg-[var(--border-color)]" />
                )}
                <div className={`relative flex items-start gap-3 px-1 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors rounded ${href ? 'cursor-pointer' : ''}`}>
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${colorClass} border border-[var(--border-color)]`}>
                    <Icon className="w-3 h-3" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-primary)] leading-snug">{activity.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-[0.04em]">{timeAgo(activity.created_at)}</span>
                      {activity.entity_type && (
                        <span className="font-mono text-[9px] text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] tracking-[0.04em] uppercase">
                          {activity.entity_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )

            return href ? (
              <Link key={activity.id} href={href} className="no-underline">{content}</Link>
            ) : (
              <div key={activity.id}>{content}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
