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

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import {
  FolderKanban, FileText, MapPin, Calculator, FileCheck2,
  Users, CreditCard, Settings, Activity as ActivityIcon,
  Loader2, Clock,
} from 'lucide-react'

const activityResponseSchema = z.object({ activities: z.array(z.object({
  id: z.string(), project_id: z.string().nullable(), activity_type: z.string(),
  entity_type: z.string().nullable(), description: z.string(), created_at: z.string(),
})) })
type Activity = z.infer<typeof activityResponseSchema>['activities'][number]

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

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
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
  const [hasLoaded, setHasLoaded] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const fetchActivities = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    try {
      setLoading(true)
      const res = await fetch(`/api/activity?limit=${limit}`, { signal: controller.signal })
      if (!res.ok) throw new Error('Failed to load activity')
      const data = activityResponseSchema.parse(await res.json())
      if (controller.signal.aborted) return
      setActivities(data.activities)
      setHasLoaded(true)
      setError(null)
    } catch {
      if (!controller.signal.aborted) setError('Activity could not be refreshed. Please try again.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchActivities()
    const interval = setInterval(fetchActivities, 30000) // 30s refresh
    return () => { clearInterval(interval); requestRef.current?.abort() }
  }, [fetchActivities])

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center">
            <ActivityIcon className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</h3>
            <p className="text-xs text-[var(--text-muted)]">Updates from your survey work</p>
          </div>
        </div>
      </div>

      {/* Activity list */}
      {error && <div role="status" className="mb-3 text-xs leading-5 text-[var(--text-secondary)]"><p>{error}</p><button type="button" onClick={fetchActivities} disabled={loading} className="mt-1 text-[var(--accent)] hover:underline disabled:opacity-50">Retry activity</button></div>}
      {loading && !hasLoaded ? (
        <div role="status" aria-label="Loading recent activity" className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
        </div>
      ) : !hasLoaded ? null : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="w-8 h-8 text-[var(--text-muted)] mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">No recent activity</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Create a project or run a computation to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity, idx) => {
            const Icon = ACTIVITY_ICONS[activity.activity_type] || ActivityIcon
            const href = activity.project_id ? `/project/${activity.project_id}` : null

            const content = (
              <>
                {/* Timeline dot */}
                {idx < activities.length - 1 && (
                  <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--border-color)]" />
                )}
                <div className={`relative flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors ${href ? 'cursor-pointer' : ''}`}>
                  <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--accent)] bg-[var(--accent-subtle)] border border-[var(--border-color)]">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-primary)] leading-tight">{activity.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[var(--text-muted)]">{timeAgo(activity.created_at)}</span>
                      {activity.entity_type && (
                        <span className="text-[10px] text-[var(--text-muted)] px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">
                          {activity.entity_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )

            return href ? (
              <Link key={activity.id} href={href}>{content}</Link>
            ) : (
              <div key={activity.id}>{content}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
