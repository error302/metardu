'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Users, ArrowLeft, Loader2, XCircle, UserPlus
} from 'lucide-react'

interface TeamMember {
  user: { id: string; email: string; full_name: string; role: string }
  blocks: {
    block_id: string
    block_number: string
    block_name: string | null
    assigned_at: string
    stats: { total_parcels: number; approved: number; in_progress: number; pending: number }
  }[]
}

interface UnassignedBlock {
  id: string
  block_number: string
  block_name: string | null
  stats: { total_parcels: number; approved: number; in_progress: number; pending: number }
}

export default function TeamPage() {
  const params = useParams()
  const projectId = params.id as string
  const [team, setTeam] = useState<TeamMember[]>([])
  const [unassignedBlocks, setUnassignedBlocks] = useState<UnassignedBlock[]>([])
  const [owner, setOwner] = useState<any>(null)
  const [schemeStatus, setSchemeStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [showActivity, setShowActivity] = useState(false)

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheme/team?project_id=${projectId}`)
      const data = await res.json()
      if (data.data) {
        setOwner(data.data.owner)
        setTeam(data.data.team)
        setUnassignedBlocks(data.data.unassigned_blocks)
      }
    } catch {}
  }, [projectId])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheme/status?project_id=${projectId}`)
      const data = await res.json()
      if (data.data) setSchemeStatus(data.data.current_status)
    } catch {}
  }, [projectId])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheme/activity?project_id=${projectId}`)
      const data = await res.json()
      if (data.data) setActivityLog(data.data.slice(0, 20))
    } catch {}
  }, [projectId])

  useEffect(() => {
    Promise.all([fetchTeam(), fetchStatus(), fetchActivity()])
      .finally(() => setLoading(false))
  }, [fetchTeam, fetchStatus, fetchActivity])

  const handleAssign = async (blockId: string, surveyorId: string) => {
    setAssigning(blockId)
    try {
      const res = await fetch('/api/scheme/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, block_id: blockId, assigned_to: surveyorId }),
      })
      if (res.ok) {
        await fetchTeam()
        await fetchActivity()
      }
    } catch {} finally {
      setAssigning(null)
    }
  }

  const handleUnassign = async (blockId: string) => {
    setAssigning(blockId)
    try {
      const res = await fetch(`/api/scheme/assign?block_id=${blockId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchTeam()
        await fetchActivity()
      }
    } catch {} finally {
      setAssigning(null)
    }
  }

  const statusColors: Record<string, string> = {
    planning: 'bg-gray-600',
    in_progress: 'bg-blue-600',
    review: 'bg-yellow-600',
    approved: 'bg-green-600',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading team data...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <a href={`/project/${projectId}/scheme`} className="hover:text-gray-300 transition-colors">
            Scheme
          </a>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-300">Team & Workflow</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-purple-400" />
              Team & Workflow
            </h1>
            <p className="text-sm text-gray-400 mt-1">Manage surveyor assignments and scheme status</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Scheme Status:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[schemeStatus] || 'bg-gray-600'}`}>
              {schemeStatus.replace('_', ' ').toUpperCase()}
            </span>
            <button
              onClick={() => setShowActivity(!showActivity)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg transition-colors border border-gray-700"
            >
              {showActivity ? 'Hide Activity' : 'Show Activity'}
            </button>
          </div>
        </div>

        {/* Activity Log */}
        {showActivity && (
          <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Activity</h3>
            {activityLog.length === 0 ? (
              <p className="text-gray-600 text-sm">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {activityLog.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-600 whitespace-nowrap text-xs">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                    <span className="text-gray-300">{a.action.replace(/_/g, ' ')}</span>
                    <span className="text-gray-600 text-xs">by {a.user_name || a.user_email || 'user'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Owner Card */}
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Owner</h3>
          {owner && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-lg font-bold">
                {owner.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-medium">{owner.full_name}</div>
                <div className="text-sm text-gray-400">{owner.email}</div>
              </div>
            </div>
          )}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Members */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Assigned Surveyors
              <span className="text-sm font-normal text-gray-500">({team.length})</span>
            </h3>
            {team.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <Users className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No surveyors assigned yet.</p>
                <p className="text-gray-600 text-xs mt-1">Assign blocks from the panel on the right.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {team.map((member, idx) => (
                  <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-sm font-bold">
                          {member.user.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{member.user.full_name}</div>
                          <div className="text-xs text-gray-500">{member.user.email}</div>
                        </div>
                      </div>
                      <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">
                        {member.blocks.length} block{member.blocks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {member.blocks.map((block) => (
                        <div key={block.block_id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/50">
                          <div>
                            <span className="text-sm font-medium text-gray-200">Block {block.block_number}</span>
                            {block.block_name && (
                              <span className="text-xs text-gray-500 ml-2">{block.block_name}</span>
                            )}
                            <div className="text-xs text-gray-500 mt-0.5">
                              {block.stats.total_parcels} parcels &mdash;{' '}
                              <span className="text-green-400">{block.stats.approved} approved</span>,{' '}
                              <span className="text-yellow-400">{block.stats.in_progress} in progress</span>,{' '}
                              <span className="text-gray-400">{block.stats.pending} pending</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnassign(block.block_id)}
                            disabled={assigning === block.block_id}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                          >
                            {assigning === block.block_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {assigning === block.block_id ? '' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unassigned Blocks */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Unassigned Blocks
              <span className="text-sm font-normal text-gray-500">({unassignedBlocks.length})</span>
            </h3>
            {unassignedBlocks.length === 0 ? (
              <div className="bg-gray-900 border border-green-800/30 rounded-xl p-8 text-center">
                <span className="text-green-400 text-sm">All blocks are assigned!</span>
              </div>
            ) : (
              <div className="space-y-2">
                {unassignedBlocks.map((block) => (
                  <div key={block.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-medium text-gray-200">Block {block.block_number}</span>
                        {block.block_name && (
                          <span className="text-sm text-gray-500 ml-2">{block.block_name}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {block.stats.total_parcels} parcel{block.stats.total_parcels !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {team.length > 0 ? (
                        team.map((member, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleAssign(block.id, member.user.id)}
                            disabled={assigning === block.id}
                            className="flex-1 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors truncate"
                            title={`Assign to ${member.user.full_name}`}
                          >
                            {assigning === block.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            {member.user.full_name.split(' ')[0]}
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-600">No team members to assign</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Back link */}
        <div className="mt-8 pt-6 border-t border-gray-800">
          <a
            href={`/project/${projectId}/scheme`}
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Scheme Overview
          </a>
        </div>
      </main>
    </div>
  )
}
