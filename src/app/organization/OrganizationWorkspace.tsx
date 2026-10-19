'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

type Organization = {
  id: string
  name: string
  slug: string
  plan: string
  max_seats: number
  owner_id: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  created_at: string
}

type OrganizationMember = {
  id: string
  user_id: string
  email: string
  full_name: string | null
  role: 'org_admin' | 'project_manager' | 'surveyor' | 'viewer'
  accepted_at: string | null
}

type OrganizationInvitation = {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

type WorkspaceDetail = {
  organization: Organization
  role: OrganizationMember['role']
  canManageMembers: boolean
  memberCount: number | null
  projectCount: number | null
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
}

type OrganizationList = {
  organizations: Array<Pick<Organization, 'id' | 'name' | 'slug' | 'plan' | 'max_seats' | 'owner_id' | 'created_at'> & { role: string }>
  plan: string
  canCreate: boolean
  maxSeats: number
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const data: unknown = await response.json().catch(() => ({})) as unknown
  const error = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: unknown }).error
    : undefined
  if (!response.ok) throw new Error(typeof error === 'string' ? error : `Request failed (${response.status})`)
  return data as T
}

const inputClass = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]'
const primaryButton = 'inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent)] disabled:opacity-50'

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function roleLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function OrganizationWorkspace() {
  const { data: session, status: sessionStatus } = useSession()
  const searchParams = useSearchParams()
  const requestedId = searchParams.get('id')
  const [list, setList] = useState<OrganizationList | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(requestedId)
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const isOwner = Boolean(detail?.organization.owner_id && detail.organization.owner_id === session?.user?.id)

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await requestJson<OrganizationList>('/api/organizations', { cache: 'no-store' })
      setList(next)
      const requestedExists = requestedId && next.organizations.some((organization) => organization.id === requestedId)
      const nextId = requestedExists ? requestedId : organizationId && next.organizations.some((organization) => organization.id === organizationId)
        ? organizationId
        : next.organizations[0]?.id ?? null
      setOrganizationId(nextId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load firm workspaces.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, requestedId])

  useEffect(() => {
    if (sessionStatus === 'authenticated') void loadList()
    if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [sessionStatus, loadList, refreshToken])

  useEffect(() => {
    if (!organizationId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    setError('')
    requestJson<WorkspaceDetail>(`/api/organizations/${organizationId}`, { cache: 'no-store' })
      .then((next) => {
        if (!cancelled) setDetail(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load this firm workspace.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => { cancelled = true }
  }, [organizationId, refreshToken])

  useEffect(() => {
    if (organizationId) window.history.replaceState(null, '', `/organization?id=${encodeURIComponent(organizationId)}`)
  }, [organizationId])

  const occupiedSeats = detail?.memberCount ?? 0
  const seatLabel = useMemo(() => {
    if (!detail || detail.memberCount === null) return 'Managed by firm administrators'
    return detail.organization.max_seats < 0
      ? `${occupiedSeats} members · unlimited seats`
      : `${occupiedSeats} of ${detail.organization.max_seats} seats used`
  }, [detail, occupiedSeats])

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await requestJson<{ organization: Organization }>('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          contactEmail: form.get('contactEmail'),
          contactPhone: form.get('contactPhone'),
          address: form.get('address'),
        }),
      })
      setOrganizationId(result.organization.id)
      setRefreshToken((value) => value + 1)
      setNotice('Firm workspace created. Add your colleagues below to begin sharing team access.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create firm workspace.')
    } finally {
      setSaving(false)
    }
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId) return
    const form = new FormData(event.currentTarget)
    setSaving(true); setError(''); setNotice('')
    try {
      await requestJson(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.get('name'),
          contactEmail: form.get('contactEmail'),
          contactPhone: form.get('contactPhone'),
          address: form.get('address'),
        }),
      })
      setRefreshToken((value) => value + 1)
      setNotice('Firm details saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save firm details.')
    } finally {
      setSaving(false)
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSaving(true); setError(''); setNotice(''); setInviteUrl('')
    try {
      const result = await requestJson<{ inviteUrl: string | null; message: string }>(`/api/organizations/${organizationId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), role: form.get('role') }),
      })
      setNotice(result.message)
      setInviteUrl(result.inviteUrl ?? '')
      formElement.reset()
      setRefreshToken((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create invitation.')
    } finally {
      setSaving(false)
    }
  }

  async function updateMember(memberId: string, role: OrganizationMember['role']) {
    if (!organizationId) return
    setSaving(true); setError('')
    try {
      await requestJson(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: 'PATCH', body: JSON.stringify({ role }),
      })
      setNotice('Member role updated.')
      setRefreshToken((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update member role.')
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(member: OrganizationMember) {
    if (!organizationId) return
    if (confirmRemoveId !== member.id) { setConfirmRemoveId(member.id); return }
    setSaving(true); setError(''); setConfirmRemoveId(null)
    try {
      await requestJson(`/api/organizations/${organizationId}/members/${member.id}`, { method: 'DELETE' })
      setNotice(`${member.full_name || member.email} was removed from the firm.`)
      setRefreshToken((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this member.')
    } finally {
      setSaving(false)
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!organizationId) return
    setSaving(true); setError('')
    try {
      await requestJson(`/api/organizations/${organizationId}/invitations/${invitationId}`, { method: 'DELETE' })
      setNotice('Invitation revoked.')
      setRefreshToken((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke invitation.')
    } finally {
      setSaving(false)
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNotice('Invitation link copied. Share it only with the invited person.')
    } catch {
      setError('Could not access the clipboard. Select and copy the link below.')
    }
  }

  if (sessionStatus === 'loading' || loading) {
    return <main className="mx-auto max-w-6xl px-4 py-12 text-sm text-[var(--text-secondary)]">Loading firm workspace…</main>
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-[var(--border-color)] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Team operations</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">Firm workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Manage your surveying firm’s members and shared project access. Invitations require a verified METARDU account using the invited email address.</p>
        </div>
        {list?.organizations.length ? (
          <label className="min-w-56 text-xs font-medium text-[var(--text-secondary)]">
            Firm
            <select value={organizationId ?? ''} onChange={(event) => setOrganizationId(event.target.value)} className={`${inputClass} mt-1`}>
              {list.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : null}
      </header>

      {error ? <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      {notice ? <div role="status" className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {inviteUrl ? (
        <section className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--bg-secondary)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold text-[var(--text-primary)]">One-time invitation link</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">This link expires in seven days and can be used once by the invited email address.</p></div>
            <button type="button" onClick={() => void copyInviteLink()} className={secondaryButton}>Copy link</button>
          </div>
          <input aria-label="Invitation link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className={`${inputClass} mt-4 font-mono text-xs`} />
        </section>
      ) : null}

      {!detail && !detailLoading ? (
        <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-8">
          {list?.organizations.length ? (
            <p className="text-sm text-[var(--text-secondary)]">Choose a firm workspace above to view its members.</p>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-lg text-[var(--accent)]" aria-hidden="true">⌂</div>
                <div><h2 className="text-xl font-semibold text-[var(--text-primary)]">Create your firm workspace</h2><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Bring your survey team into one workspace for shared project access and role-based membership.</p></div>
              </div>
              {list?.canCreate ? (
                <form onSubmit={(event) => void createOrganization(event)} className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm text-[var(--text-secondary)] sm:col-span-2">Firm name<input name="name" required minLength={2} maxLength={255} className={`${inputClass} mt-1`} placeholder="e.g. Northline Surveyors" /></label>
                  <label className="text-sm text-[var(--text-secondary)]">Contact email<input name="contactEmail" type="email" maxLength={255} className={`${inputClass} mt-1`} placeholder="office@example.com" /></label>
                  <label className="text-sm text-[var(--text-secondary)]">Contact phone<input name="contactPhone" maxLength={50} className={`${inputClass} mt-1`} placeholder="+254…" /></label>
                  <label className="text-sm text-[var(--text-secondary)] sm:col-span-2">Office address<input name="address" maxLength={2000} className={`${inputClass} mt-1`} placeholder="Town or office address" /></label>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-4 sm:col-span-2"><p className="text-xs text-[var(--text-muted)]">{list ? (list.maxSeats < 0 ? 'Unlimited team seats' : `${list.maxSeats} team seat${list.maxSeats === 1 ? '' : 's'} included`) : 'Subscription seat limit applies.'}</p><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Creating…' : 'Create firm workspace'}</button></div>
                </form>
              ) : (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">Firm workspaces and member seats are available on Team, Firm, and Enterprise plans.</p>
                  <Link href="/pricing?plan=team" className={`${primaryButton} mt-4`}>Compare team plans</Link>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {detailLoading ? <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-sm text-[var(--text-secondary)]">Loading firm details…</div> : null}

      {detail ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="Workspace plan" value={detail.organization.plan} detail="Controls included team seats" />
            <StatCard label="Team seats" value={detail.memberCount === null ? 'Restricted' : detail.memberCount.toString()} detail={seatLabel} />
            <StatCard label="Shared projects" value={detail.projectCount === null ? 'Restricted' : detail.projectCount.toString()} detail="Projects assigned to this firm" />
          </section>

          <section className="mb-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--text-primary)]">Firm details</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Workspace ID · {detail.organization.slug}</p></div><span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 text-xs font-medium text-[var(--accent)]">{roleLabel(detail.role)}</span></div>
              <form onSubmit={(event) => void saveOrganization(event)} className="space-y-4">
                <label className="block text-sm text-[var(--text-secondary)]">Firm name<input name="name" required minLength={2} maxLength={255} defaultValue={detail.organization.name} disabled={!isOwner} className={`${inputClass} mt-1 disabled:opacity-70`} /></label>
                <label className="block text-sm text-[var(--text-secondary)]">Contact email<input name="contactEmail" type="email" maxLength={255} defaultValue={detail.organization.contact_email ?? ''} disabled={!isOwner} className={`${inputClass} mt-1 disabled:opacity-70`} /></label>
                <label className="block text-sm text-[var(--text-secondary)]">Contact phone<input name="contactPhone" maxLength={50} defaultValue={detail.organization.contact_phone ?? ''} disabled={!isOwner} className={`${inputClass} mt-1 disabled:opacity-70`} /></label>
                <label className="block text-sm text-[var(--text-secondary)]">Address<input name="address" maxLength={2000} defaultValue={detail.organization.address ?? ''} disabled={!isOwner} className={`${inputClass} mt-1 disabled:opacity-70`} /></label>
                {isOwner ? <button type="submit" disabled={saving} className={secondaryButton}>Save firm details</button> : <p className="text-xs text-[var(--text-muted)]">Only the firm owner can edit these details.</p>}
              </form>
            </div>

            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invite a colleague</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">The link is single-use, expires after seven days, and only works for a verified METARDU account with the invited email.</p>
              {detail.canManageMembers ? (
                <form onSubmit={(event) => void inviteMember(event)} className="mt-5 space-y-4">
                  <label className="block text-sm text-[var(--text-secondary)]">Work email<input name="email" type="email" required maxLength={255} className={`${inputClass} mt-1`} placeholder="colleague@example.com" /></label>
                  <label className="block text-sm text-[var(--text-secondary)]">Workspace role<select name="role" defaultValue="surveyor" className={`${inputClass} mt-1`}><option value="project_manager">Project manager</option><option value="surveyor">Surveyor</option><option value="viewer">Viewer · read only</option></select></label>
                  <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">{seatLabel}</p><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Sending…' : 'Send invitation'}</button></div>
                </form>
              ) : (
                <div className="mt-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-secondary)]">A firm administrator manages invitations and team roles.</div>
              )}
            </div>
          </section>

          {detail.canManageMembers ? (
            <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-color)] p-5 sm:px-6"><div><h2 className="text-lg font-semibold text-[var(--text-primary)]">Team members</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Manage who can access firm projects and what they can do.</p></div><span className="text-xs text-[var(--text-muted)]">Created {formatDate(detail.organization.created_at)}</span></div>
              <div className="divide-y divide-[var(--border-color)]">
                {detail.members.map((member) => {
                  const memberIsOwner = member.user_id === detail.organization.owner_id
                  return (
                    <div key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--text-primary)]">{member.full_name || member.email}{memberIsOwner ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">Owner</span> : null}</p><p className="truncate text-xs text-[var(--text-muted)]">{member.email} · joined {formatDate(member.accepted_at)}</p></div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select aria-label={`Role for ${member.email}`} value={member.role} disabled={saving || memberIsOwner || (!isOwner && member.role === 'org_admin')} onChange={(event) => void updateMember(member.id, event.target.value as OrganizationMember['role'])} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2.5 py-2 text-xs text-[var(--text-primary)] disabled:opacity-65">
                          {isOwner ? <option value="org_admin">Firm administrator</option> : null}<option value="project_manager">Project manager</option><option value="surveyor">Surveyor</option><option value="viewer">Viewer · read only</option>
                        </select>
                        {!memberIsOwner ? <button type="button" disabled={saving} onClick={() => void removeMember(member)} className="rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50">{confirmRemoveId === member.id ? 'Confirm remove' : 'Remove'}</button> : null}
                      </div>
                    </div>
                  )
                })}
                {!detail.members.length ? <p className="p-6 text-sm text-[var(--text-muted)]">No active team members are available.</p> : null}
              </div>
            </section>
          ) : null}

          {detail.canManageMembers && detail.invitations.length ? (
            <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <div className="border-b border-[var(--border-color)] p-5 sm:px-6"><h2 className="text-lg font-semibold text-[var(--text-primary)]">Pending invitations</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Links expire after seven days. Resending an invite replaces its previous link.</p></div>
              <div className="divide-y divide-[var(--border-color)]">{detail.invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-sm font-medium text-[var(--text-primary)]">{invitation.email}</p><p className="text-xs text-[var(--text-muted)]">{roleLabel(invitation.role)} · expires {formatDate(invitation.expires_at)}</p></div><button type="button" disabled={saving} onClick={() => void revokeInvitation(invitation.id)} className="self-start rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 sm:self-auto">Revoke</button></div>)}</div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-5"><p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold capitalize text-[var(--text-primary)]">{value}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p></div>
}
