import { createClient, SupabaseClient, User, RealtimeChannel } from '@supabase/supabase-js'

export const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface PresenceUser {
  id: string
  email: string
  name?: string
  avatar_url?: string
  status: string
  last_seen: string
  cursor?: { x: number; y: number }
  active_tool?: string
}

interface SubscribeOptions {
  onPresenceChange?: (users: PresenceUser[]) => void
  onPointsChange?: (payload: { eventType: string; new: unknown; old: unknown }) => void
}

const presenceState = new Map<string, PresenceUser[]>()

export const realtimeService = {
  async updatePresence(projectId: string, data: Partial<PresenceUser>) {
    const channel = supabase.channel(`project:${projectId}`)
    await channel.track(data)
  },

  async removePresence(projectId: string) {
    const channel = supabase.channel(`project:${projectId}`)
    await channel.untrack()
  }
}

export function subscribeToProjectChanges(
  projectId: string,
  user: User,
  options?: SubscribeOptions
) {
  const channel = supabase.channel(`project:${projectId}`)
  
  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'projects',
    filter: `id=eq.${projectId}`
  }, (payload) => {
    // Handle project changes
  })

  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'project_fieldbook_entries',
    filter: `project_id=eq.${projectId}`
  }, (payload: unknown) => {
    options?.onPointsChange?.(payload as { eventType: string; new: unknown; old: unknown })
  })

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    const users: PresenceUser[] = Object.values(state).flat() as PresenceUser[]
    presenceState.set(projectId, users)
    options?.onPresenceChange?.(users)
  })

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        id: user.id,
        email: user.email,
        status: 'online',
        last_seen: new Date().toISOString()
      })
    }
  })

  return {
    unsubscribe: async () => {
      await supabase.removeChannel(channel)
    }
  }
}

export type SubscribeCallback = (payload: { eventType: string; new: unknown; old: unknown }) => void

export function subscribeToFieldbookChanges(
  projectId: string,
  callback: SubscribeCallback
) {
  const channel = supabase.channel(`fieldbook:${projectId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'project_fieldbook_entries',
      filter: `project_id=eq.${projectId}`
    }, callback)
    .subscribe()

  return {
    unsubscribe: async () => {
      await supabase.removeChannel(channel)
    }
  }
}

export function subscribeToPresence(
  roomId: string,
  onSync: (state: unknown) => void
) {
  const channel = supabase.channel(roomId)
    .on('presence', { event: 'sync' }, ({ payload }) => {
      onSync(payload)
    })
    .subscribe()

  return {
    track: (payload: Record<string, unknown>) => {
      channel.track(payload)
    },
    untrack: async () => {
      await channel.untrack()
    },
    unsubscribe: async () => {
      await supabase.removeChannel(channel)
    }
  }
}