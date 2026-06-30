'use client'

/**
 * PresenceIndicator — Shows who's online in a project
 */

import { Users, WifiOff } from 'lucide-react'
import type { Collaborator } from '@/lib/realtime/useCollaboration'

interface PresenceIndicatorProps {
  collaborators: Collaborator[]
  isConnected: boolean
  max?: number
}

export function PresenceIndicator({ collaborators, isConnected, max = 5 }: PresenceIndicatorProps) {
  if (!isConnected) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-500/10 text-gray-400">
        <WifiOff className="w-3 h-3" />
        <span className="text-[10px]">Offline</span>
      </div>
    )
  }

  const visible = collaborators.slice(0, max)
  const overflow = collaborators.length - max

  function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1">
        <Users className="w-3 h-3 text-emerald-400" />
        <span className="text-[10px] text-gray-400">{collaborators.length + 1}</span>
      </div>
      <div className="flex -space-x-1.5">
        {visible.map((c) => (
          <div
            key={c.userId}
            className="w-6 h-6 rounded-full border-2 border-[var(--bg-card)] flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ backgroundColor: c.color }}
            title={`${c.userName}${c.cursor ? ' — viewing map' : ''}`}
          >
            {getInitials(c.userName)}
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full border-2 border-[var(--bg-card)] bg-gray-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  )
}
