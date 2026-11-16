'use client'

/**
 * ProjectSharingPanel — who has access to this project, and (for managers)
 * invite / role-change / revoke controls backed by
 * /api/projects/[id]/members. The API remains the authority; this panel
 * only renders what the caller's resolved policy allows.
 */

import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Users, X } from 'lucide-react'

interface MemberInfo {
  id: string
  userId: string
  name: string | null
  email: string | null
  role: string
  addedAt: string
}

interface MembersResponse {
  data: {
    owner: { id: string; name: string | null; email: string | null } | null
    members: MemberInfo[]
    callerRole: string | null
    canManage: boolean
  }
}

const MEMBER_ROLES = [
  { value: 'viewer', label: 'Viewer — read only' },
  { value: 'surveyor', label: 'Surveyor — capture & advance' },
  { value: 'project_manager', label: 'Project manager — manage members' },
] as const

export function ProjectSharingPanel({ projectId }: { projectId: string }) {
  const [owner, setOwner] = useState<MembersResponse['data']['owner']>(null)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('surveyor')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`)
      const body = (await res.json()) as MembersResponse & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Could not load project members')
      setOwner(body.data.owner)
      setMembers(body.data.members)
      setCanManage(Boolean(body.data.canManage))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load project members')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const invite = useCallback(async () => {
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Invite failed')
      setEmail('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }, [busy, email, load, projectId, role])

  const changeRole = useCallback(async (userId: string, nextRole: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: nextRole }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Role change failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Role change failed')
    } finally {
      setBusy(false)
    }
  }, [load, projectId])

  const revoke = useCallback(async (userId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Revoke failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }, [load, projectId])

  return (
    <section aria-label="Project sharing" className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sharing</h3>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading members…</p>
      ) : (
        <>
          {owner && (
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              Owner: <span className="font-medium text-[var(--text-primary)]">{owner.name || owner.email || 'Project owner'}</span>
              {owner.email && owner.name ? <span className="text-[var(--text-muted)]"> ({owner.email})</span> : null}
            </p>
          )}

          {members.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No invited members yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--text-primary)]">{member.name || member.email || 'Member'}</p>
                    {member.email && member.name ? (
                      <p className="truncate text-xs text-[var(--text-muted)]">{member.email}</p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <>
                      <select
                        aria-label={`Role for ${member.email || member.name || 'member'}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(e) => void changeRole(member.userId, e.target.value)}
                        className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-primary)]"
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.value}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${member.email || member.name || 'member'}`}
                        disabled={busy}
                        onClick={() => void revoke(member.userId)}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                      {member.role}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => { e.preventDefault(); void invite() }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Invite by email"
                aria-label="Member email address"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Member role"
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-2 text-sm text-[var(--text-primary)]"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Invite
              </button>
            </form>
          )}

          {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
        </>
      )}
    </section>
  )
}
