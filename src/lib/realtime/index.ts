/**
 * Realtime Service — Polling-based replacement for Supabase Realtime
 *
 * Since we migrated from Supabase to direct PostgreSQL, native postgres_changes
 * are no longer available. This service uses HTTP polling + Server-Sent Events
 * to simulate realtime collaboration features.
 */

export interface PresenceUser {
  user_id: string
  user_email: string
  cursor?: { x: number; y: number }
  active_tool?: string
  project_id?: string
  online_at?: string
}

export interface RealtimeConfig {
  table: string
  filter?: string
  onInsert?: (payload: any) => void
  onUpdate?: (payload: any) => void
  onDelete?: (payload: any) => void
}

// In-memory presence tracking (per project)
const presenceStore = new Map<string, Map<string, PresenceUser>>() // projectId -> (userId -> PresenceUser)
const presenceListeners = new Map<string, Set<(users: PresenceUser[]) => void>>()

class RealtimeService {
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private lastChecksums: Map<string, string> = new Map()

  async subscribeToTable(
    projectId: string,
    config: RealtimeConfig,
    user: { id: string; email?: string }
  ): Promise<{ unsubscribe: () => void }> {
    const pollKey = `${config.table}:${projectId}`

    // Initial fetch
    await this.pollTable(projectId, config, user)

    // Set up polling interval (every 3 seconds)
    const interval = setInterval(async () => {
      await this.pollTable(projectId, config, user)
    }, 3000)

    this.intervals.set(pollKey, interval)

    return {
      unsubscribe: () => {
        const timer = this.intervals.get(pollKey)
        if (timer) clearInterval(timer)
        this.intervals.delete(pollKey)
      }
    }
  }

  private async pollTable(
    projectId: string,
    config: RealtimeConfig,
    _user: { id: string; email?: string }
  ) {
    try {
      const res = await fetch(`/api/realtime/poll?table=${config.table}&projectId=${projectId}`, {
        cache: 'no-store'
      })
      if (!res.ok) return

      const json = await res.json()
      const checksum = JSON.stringify(json.data).hashCode()

      const prev = this.lastChecksums.get(`${config.table}:${projectId}`)
      this.lastChecksums.set(`${config.table}:${projectId}`, checksum)

      if (prev && prev !== checksum) {
        // Data changed — call the appropriate callback
        const prevData = new Map((prev ? JSON.parse(prev) : []).map((r: any) => [r.id, r]))
        const currData = new Map(json.data.map((r: any) => [r.id, r]))

        // Detect inserts
        for (const [id, row] of Array.from(currData)) {
          if (!prevData.has(id)) {
            config.onInsert?.({ eventType: 'INSERT', new: row })
          }
        }

        // Detect updates
        for (const [id, row] of Array.from(currData)) {
          const prevRow = prevData.get(id)
          if (prevRow && JSON.stringify(prevRow) !== JSON.stringify(row)) {
            config.onUpdate?.({ eventType: 'UPDATE', new: row, old: prevRow })
          }
        }

        // Detect deletes
        for (const [id, row] of Array.from(prevData)) {
          if (!currData.has(id)) {
            config.onDelete?.({ eventType: 'DELETE', old: row })
          }
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }

  subscribeToPresence(
    projectId: string,
    callback: (users: PresenceUser[]) => void
  ): () => void {
    if (!presenceListeners.has(projectId)) {
      presenceListeners.set(projectId, new Set())
    }
    presenceListeners.get(projectId)!.add(callback)

    // Send current presence state immediately
    const current = this.getOnlineUsers(projectId)
    callback(current)

    return () => {
      presenceListeners.get(projectId)?.delete(callback)
    }
  }

  async updatePresence(projectId: string, data: Partial<PresenceUser>): Promise<void> {
    if (!data.user_id) return

    if (!presenceStore.has(projectId)) {
      presenceStore.set(projectId, new Map())
    }

    const users = presenceStore.get(projectId)!
    const existing = users.get(data.user_id!) || {} as PresenceUser
    users.set(data.user_id!, { ...existing, ...data, online_at: new Date().toISOString() })

    // Notify listeners
    const listeners = presenceListeners.get(projectId)
    if (listeners) {
      const snapshot = Array.from(users.values())
      listeners.forEach(cb => cb(snapshot))
    }
  }

  async unsubscribe(projectId: string): Promise<void> {
    // Clear polling intervals
    for (const [key, timer] of Array.from(this.intervals)) {
      if (key.includes(projectId)) {
        clearInterval(timer)
        this.intervals.delete(key)
      }
    }

    // Remove presence for this project
    presenceStore.delete(projectId)
    presenceListeners.delete(projectId)
  }

  async unsubscribeAll(): Promise<void> {
    for (const timer of Array.from(this.intervals.values())) {
      clearInterval(timer)
    }
    this.intervals.clear()
    this.lastChecksums.clear()
    presenceStore.clear()
    presenceListeners.clear()
  }

  getOnlineUsers(projectId: string): PresenceUser[] {
    const users = presenceStore.get(projectId)
    if (!users) return []
    return Array.from(users.values())
  }

  // Heartbeat cleanup — remove stale presence entries older than 15s
  startHeartbeatCleanup() {
    setInterval(() => {
      const now = Date.now()
      for (const [projectId, users] of Array.from(presenceStore)) {
        for (const [userId, presence] of Array.from(users)) {
          const onlineAt = presence.online_at ? new Date(presence.online_at).getTime() : 0
          if (now - onlineAt > 15000) {
            users.delete(userId)
          }
        }
      }
    }, 5000)
  }
}

// String hashCode helper
declare global {
  interface String {
    hashCode(): string
  }
}

String.prototype.hashCode = function (): string {
  let hash = 0
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

export const realtimeService = new RealtimeService()

// Start heartbeat cleanup on server startup
if (typeof window === 'undefined') {
  realtimeService.startHeartbeatCleanup()
}

export async function enableRealtimeForTable(_table: string): Promise<void> {
  // No-op — polling handles this automatically
}

export function subscribeToProjectChanges(
  projectId: string,
  user: { id: string; email?: string },
  callbacks: {
    onPointsChange?: (payload: any) => void
    onTraverseChange?: (payload: any) => void
    onLevelingChange?: (payload: any) => void
    onPresenceChange?: (users: PresenceUser[]) => void
  }
): { unsubscribe: () => Promise<void> } {
  const unsubscribers: (() => void)[] = []

  if (callbacks.onPointsChange) {
    realtimeService.subscribeToTable(projectId, {
      table: 'survey_points',
      onInsert: callbacks.onPointsChange,
      onUpdate: callbacks.onPointsChange,
      onDelete: callbacks.onPointsChange
    }, user).then(sub => {
      unsubscribers.push(sub.unsubscribe)
    })
  }

  if (callbacks.onTraverseChange) {
    realtimeService.subscribeToTable(projectId, {
      table: 'traverses',
      onInsert: callbacks.onTraverseChange,
      onUpdate: callbacks.onTraverseChange,
      onDelete: callbacks.onTraverseChange
    }, user).then(sub => {
      unsubscribers.push(sub.unsubscribe)
    })
  }

  if (callbacks.onLevelingChange) {
    realtimeService.subscribeToTable(projectId, {
      table: 'leveling_runs',
      onInsert: callbacks.onLevelingChange,
      onUpdate: callbacks.onLevelingChange,
      onDelete: callbacks.onLevelingChange
    }, user).then(sub => {
      unsubscribers.push(sub.unsubscribe)
    })
  }

  let presenceUnsubscribe: (() => void) | null = null
  if (callbacks.onPresenceChange) {
    presenceUnsubscribe = realtimeService.subscribeToPresence(projectId, callbacks.onPresenceChange)
  }

  return {
    unsubscribe: async () => {
      if (presenceUnsubscribe) presenceUnsubscribe()
      unsubscribers.forEach(fn => fn())
      await realtimeService.unsubscribe(projectId)
    }
  }
}
