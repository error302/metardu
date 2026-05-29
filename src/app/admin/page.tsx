'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users, FolderKanban, LandPlot, RadioTower,
  DollarSign, Activity, Clock, Database,
  HardDrive, Cpu, ArrowUpRight, TrendingUp,
  UserPlus, ShieldCheck, Settings2, FileText,
  CreditCard, Loader2, AlertCircle, ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  users: {
    total: number
    newThisMonth: number
    active: number
  }
  projects: {
    total: number
    byStatus: Record<string, number>
  }
  parcels: number
  beacons: number
  revenue: {
    total: number
    byMonth: { month: string; total: number }[]
  }
  recentSignups: {
    id: string
    email: string
    name: string
    role: string
    plan: string
    createdAt: string
  }[]
  system: {
    database: {
      status: string
      latencyMs: number
    }
    uptime: number
    memory: {
      heapUsedMb: number
      heapTotalMb: number
      rssMb: number
    }
    responseTimeMs: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hrs = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hrs}h`
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

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

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  color = 'var(--accent)',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  color?: string
}) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend === 'up' && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <TrendingUp className="w-3 h-3" />
            <span>Up</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        {subValue && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{subValue}</p>
        )}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/dashboard')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (res.status === 403) {
        router.push('/dashboard')
        return
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch dashboard data (${res.status})`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (sessionStatus === 'authenticated') {
      fetchDashboard()
    }
  }, [sessionStatus, fetchDashboard, router])

  // Loading state
  if (sessionStatus === 'loading' || (loading && !data)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 max-w-md w-full mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Failed to Load Dashboard
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={fetchDashboard} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = userRole === 'super_admin'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Admin Dashboard</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Platform overview for Metardu administrators
          </p>
        </div>
        <button
          onClick={fetchDashboard}
          className="btn btn-secondary text-sm"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={data.users.total.toLocaleString()}
          subValue={`${data.users.newThisMonth} new this month`}
          trend="up"
          color="#4ade80"
        />
        <StatCard
          icon={Activity}
          label="Active Users"
          value={data.users.active.toLocaleString()}
          subValue="Last 30 days"
          color="#60a5fa"
        />
        <StatCard
          icon={FolderKanban}
          label="Total Projects"
          value={data.projects.total.toLocaleString()}
          subValue={Object.entries(data.projects.byStatus)
            .map(([s, c]) => `${s}: ${c}`)
            .join(', ')}
          color="#f59e0b"
        />
        <StatCard
          icon={LandPlot}
          label="Total Parcels"
          value={data.parcels.toLocaleString()}
          color="#a78bfa"
        />
        <StatCard
          icon={RadioTower}
          label="Total Beacons"
          value={data.beacons.toLocaleString()}
          color="#f472b6"
        />
      </div>

      {/* Revenue + Recent Signups */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue Overview */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Revenue Overview
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)]">Completed payments</span>
          </div>
          <div className="p-5">
            <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">
              {formatCurrency(data.revenue.total)}
            </p>
            {data.revenue.byMonth.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {data.revenue.byMonth.map((item) => (
                  <div
                    key={item.month}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-[var(--text-secondary)]">{item.month}</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No revenue data yet</p>
            )}
          </div>
        </div>

        {/* Recent Signups */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Recent Signups
              </h2>
            </div>
            <Link
              href="/admin/users"
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-0">
            {data.recentSignups.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-left">Role</th>
                      <th className="px-4 py-2 text-left">Plan</th>
                      <th className="px-4 py-2 text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSignups.map((user) => (
                      <tr key={user.id} className="table-row">
                        <td className="table-cell">
                          <div>
                            <p className="text-[var(--text-primary)] font-medium text-sm truncate max-w-[160px]">
                              {user.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] truncate max-w-[160px]">
                              {user.email}
                            </p>
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
                        <td className="table-cell text-sm text-right text-[var(--text-muted)]">
                          {formatDate(user.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-[var(--text-muted)]">
                No users yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Health + Quick Actions */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[var(--accent)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                System Health
              </h2>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Database */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    data.system.database.status === 'healthy'
                      ? 'bg-green-400'
                      : 'bg-red-400'
                  }`}
                />
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">Database</span>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`text-sm font-medium ${
                    data.system.database.status === 'healthy'
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {data.system.database.status === 'healthy' ? 'Connected' : 'Error'}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-2">
                  {data.system.database.latencyMs}ms
                </span>
              </div>
            </div>

            {/* Uptime */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">Uptime</span>
                </div>
              </div>
              <span className="text-sm text-[var(--text-primary)]">
                {formatUptime(data.system.uptime)}
              </span>
            </div>

            {/* Memory */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">Memory</span>
                </div>
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                {data.system.memory.heapUsedMb}MB / {data.system.memory.heapTotalMb}MB
              </span>
            </div>

            {/* Response Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span className="text-sm text-[var(--text-primary)]">API Response</span>
                </div>
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                {data.system.responseTimeMs}ms
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Quick Actions
            </h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all group"
            >
              <Users className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  User Management
                </p>
                <p className="text-xs text-[var(--text-muted)]">Manage users & roles</p>
              </div>
            </Link>

            <Link
              href="/audit-logs"
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all group"
            >
              <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  Audit Logs
                </p>
                <p className="text-xs text-[var(--text-muted)]">View security logs</p>
              </div>
            </Link>

            <Link
              href="/admin/payments"
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all group"
            >
              <CreditCard className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  Payments
                </p>
                <p className="text-xs text-[var(--text-muted)]">Revenue & billing</p>
              </div>
            </Link>

            <Link
              href="/api/system/optimize"
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all group"
            >
              <Settings2 className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  System
                </p>
                <p className="text-xs text-[var(--text-muted)]">Optimize & maintain</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
