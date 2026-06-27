'use client'

import {
  ShieldCheck, Ban, CheckCircle2, Mail,
  Calendar, Crown, Rocket, Building2, User as UserIcon,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'org_admin':
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

function planBadgeClass(plan: string): string {
  switch (plan.toLowerCase()) {
    case 'pro':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'enterprise':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'free':
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

function planIcon(plan: string) {
  switch (plan.toLowerCase()) {
    case 'pro':
      return <Rocket className="w-3 h-3" />
    case 'enterprise':
      return <Building2 className="w-3 h-3" />
    default:
      return <UserIcon className="w-3 h-3" />
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Mobile User Card
// ---------------------------------------------------------------------------

export function MobileUserCard({
  user,
  onRoleClick,
  onSuspendClick,
  onPlanClick,
}: {
  user: UserRecord
  onRoleClick: () => void
  onSuspendClick: () => void
  onPlanClick?: () => void
}) {
  return (
    <div className="card p-4 space-y-3">
      {/* Header row: name + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[var(--text-primary)] font-medium text-sm truncate">
              {user.fullName}
            </p>
            {user.verifiedIsk && (
              <ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3 shrink-0" />
            {user.email}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {onPlanClick && (
            <button
              onClick={onPlanClick}
              className="text-xs text-amber-400 hover:underline px-1.5 py-1 flex items-center gap-0.5"
            >
              <Crown className="w-3 h-3" />
              Plan
            </button>
          )}
          <button
            onClick={onRoleClick}
            className="text-xs text-[var(--accent)] hover:underline px-1.5 py-1"
          >
            Role
          </button>
          <button
            onClick={onSuspendClick}
            className={`text-xs px-1.5 py-1 ${
              user.isSuspended ? 'text-green-400 hover:underline' : 'text-red-400 hover:underline'
            }`}
          >
            {user.isSuspended ? 'Unsuspend' : 'Suspend'}
          </button>
        </div>
      </div>

      {/* Metadata chips */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${roleBadgeClass(user.role)}`}
        >
          {user.role}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${planBadgeClass(user.plan)}`}>
          {planIcon(user.plan)}
          {user.plan}
        </span>
        {user.isSuspended ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30">
            <Ban className="w-3 h-3" /> Suspended
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/30">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        )}
      </div>

      {/* Joined date */}
      <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        Joined {formatDate(user.createdAt)}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile Payment Card
// ---------------------------------------------------------------------------

interface PaymentRecord {
  id: string
  userId: string
  userEmail: string
  userName: string
  amount: number
  currency: string
  status: string
  method: string
  planId: string
  createdAt: string
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'pending':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    case 'failed':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'refunded':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function MobilePaymentCard({ payment }: { payment: PaymentRecord }) {
  return (
    <div className="card p-4 space-y-2.5">
      {/* Amount + Status */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-[var(--text-primary)]">
          {formatCurrency(payment.amount)}
        </p>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${statusBadgeClass(payment.status)}`}
        >
          {payment.status}
        </span>
      </div>

      {/* User info */}
      <div>
        <p className="text-sm text-[var(--text-primary)] font-medium truncate">
          {payment.userName}
        </p>
        <p className="text-xs text-[var(--text-muted)] truncate">{payment.userEmail}</p>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)] capitalize">
          {payment.planId}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)] capitalize">
          {payment.method}
        </span>
      </div>

      {/* Date */}
      <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {formatDate(payment.createdAt)}
      </p>
    </div>
  )
}
