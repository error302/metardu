'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Users, Search, Filter, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, ShieldCheck, Ban,
  CheckCircle2, X, RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRecord {
  id: string
  email: string
  fullName: string
  role: string
  verifiedIsk: boolean
  isSuspended: boolean
  suspensionReason: string | null
  plan: string
  subscriptionStatus: string | null
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

interface UsersResponse {
  users: UserRecord[]
  pagination: Pagination
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'org_admin':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'admin':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'project_manager':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'surveyor':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'viewer':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

const AVAILABLE_ROLES = ['super_admin', 'org_admin', 'project_manager', 'surveyor', 'viewer']

// ---------------------------------------------------------------------------
// Role Assignment Modal
// ---------------------------------------------------------------------------

function RoleAssignModal({
  user,
  currentCallerRole,
  onClose,
  onAssigned,
}: {
  user: UserRecord
  currentCallerRole: string
  onClose: () => void
  onAssigned: () => void
}) {
  const [selectedRole, setSelectedRole] = useState(user.role)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSuperAdmin = currentCallerRole === 'super_admin'

  const canAssign = (role: string): boolean => {
    if (!isSuperAdmin) return false
    return true
  }

  const handleSubmit = async () => {
    if (selectedRole === user.role) {
      onClose()
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to assign role')
      }
      onAssigned()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="card-header">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Assign Role
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">
              User: <span className="text-[var(--text-primary)] font-medium">{user.fullName}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>

          {!isSuperAdmin && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
              Only super_admin can assign roles.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={!isSuperAdmin || submitting}
              className="input w-full"
            >
              {AVAILABLE_ROLES.map((role) => (
                <option key={role} value={role} disabled={!canAssign(role)}>
                  {role}
                  {!canAssign(role) ? ' (insufficient privilege)' : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn btn-secondary text-sm">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isSuperAdmin || selectedRole === user.role}
              className="btn btn-primary text-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Assign'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suspend/Unsuspend Modal
// ---------------------------------------------------------------------------

function SuspendModal({
  user,
  onClose,
  onAction,
}: {
  user: UserRecord
  onClose: () => void
  onAction: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSuspend = !user.isSuspended

  const handleSubmit = async () => {
    if (isSuspend && !reason.trim()) {
      setError('Suspension reason is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/suspend`, {
        method: isSuspend ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: isSuspend ? JSON.stringify({ reason }) : undefined,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Action failed')
      }
      onAction()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md">
        <div className="card-header">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {isSuspend ? 'Suspend User' : 'Unsuspend User'}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">
              User: <span className="text-[var(--text-primary)] font-medium">{user.fullName}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>

          {isSuspend && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Reason for suspension
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason..."
                className="input w-full min-h-[80px] resize-none"
                rows={3}
              />
            </div>
          )}

          {!isSuspend && (
            <p className="text-sm text-[var(--text-secondary)]">
              This will restore the user&apos;s access to the platform.
            </p>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn btn-secondary text-sm">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`btn text-sm ${
                isSuspend
                  ? 'bg-red-500/90 hover:bg-red-600 text-white'
                  : 'btn-primary'
              }`}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSuspend ? (
                'Suspend'
              ) : (
                'Unsuspend'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()

  const [users, setUsers] = useState<UserRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasMore: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeModal, setActiveModal] = useState<
    | { type: 'role'; user: UserRecord }
    | { type: 'suspend'; user: UserRecord }
    | null
  >(null)

  const currentRole = (session?.user as { role?: string })?.role ?? ''

  const fetchUsers = useCallback(
    async (page = 1) => {
      try {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams({
          page: String(page),
          limit: '25',
        })
        if (search) params.set('search', search)
        if (roleFilter) params.set('role', roleFilter)
        if (statusFilter) params.set('status', statusFilter)

        const res = await fetch(`/api/admin/users?${params}`)
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (res.status === 403) {
          router.push('/dashboard')
          return
        }
        if (!res.ok) throw new Error('Failed to fetch users')

        const data: UsersResponse = await res.json()
        setUsers(data.users)
        setPagination(data.pagination)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      } finally {
        setLoading(false)
      }
    },
    [search, roleFilter, statusFilter, router],
  )

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (sessionStatus === 'authenticated') {
      fetchUsers(1)
    }
  }, [sessionStatus, fetchUsers, router])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionStatus === 'authenticated') {
        fetchUsers(1)
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, statusFilter])

  const handlePageChange = (newPage: number) => {
    fetchUsers(newPage)
  }

  // Auth loading
  if (sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">User Management</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage platform users, roles, and access
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="input pl-9 pr-8 min-w-[140px]"
              >
                <option value="">All Roles</option>
                {AVAILABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input min-w-[130px]"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchUsers(pagination.page)}
            className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin mx-auto" />
                    <p className="text-sm text-[var(--text-muted)] mt-2">Loading users...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--text-muted)]">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="table-row">
                    <td className="table-cell">
                      <div>
                        <p className="text-[var(--text-primary)] font-medium text-sm">
                          {user.fullName}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                        {user.verifiedIsk && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400 mt-0.5">
                            <ShieldCheck className="w-3 h-3" /> ISK Verified
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${roleBadgeClass(user.role)}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="table-cell text-sm capitalize">
                      {user.plan}
                    </td>
                    <td className="table-cell">
                      {user.isSuspended ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400">
                          <Ban className="w-3 h-3" /> Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-sm text-[var(--text-muted)]">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        {currentRole === 'super_admin' && (
                          <button
                            onClick={() =>
                              setActiveModal({ type: 'role', user })
                            }
                            className="text-xs text-[var(--accent)] hover:underline"
                            title="Change role"
                          >
                            Role
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setActiveModal({ type: 'suspend', user })
                          }
                          className={`text-xs ${
                            user.isSuspended
                              ? 'text-green-400 hover:underline'
                              : 'text-red-400 hover:underline'
                          }`}
                          title={user.isSuspended ? 'Unsuspend' : 'Suspend'}
                        >
                          {user.isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-muted)]">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="btn btn-secondary text-xs px-4 py-2.5 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.hasMore}
                className="btn btn-secondary text-xs px-4 py-2.5 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal?.type === 'role' && (
        <RoleAssignModal
          user={activeModal.user}
          currentCallerRole={currentRole}
          onClose={() => setActiveModal(null)}
          onAssigned={() => fetchUsers(pagination.page)}
        />
      )}
      {activeModal?.type === 'suspend' && (
        <SuspendModal
          user={activeModal.user}
          onClose={() => setActiveModal(null)}
          onAction={() => fetchUsers(pagination.page)}
        />
      )}
    </div>
  )
}
