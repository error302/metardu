'use client';

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { createClient } from '@/lib/api-client/client'

interface ProjectRow {
  id: string
  survey_type: string | null
  created_at: string
}

interface PointRow {
  id: string
  created_at: string
}

interface AnalyticsData {
  totalProjects: number
  activeProjects: number
  completedSurveys: number
  totalPoints: number
  storageUsed: number
  apiCalls: number
  userActivity: { date: string; count: number }[]
  projectTypes: { type: string; count: number }[]
}

const emptyData: AnalyticsData = {
  totalProjects: 0,
  activeProjects: 0,
  completedSurveys: 0,
  totalPoints: 0,
  storageUsed: 0,
  apiCalls: 0,
  userActivity: [],
  projectTypes: [],
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession()
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState<AnalyticsData>(emptyData)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user?.id) {
      setLoading(false)
      return
    }

    const userId = session.user.id

    async function fetchAnalytics() {
      const dbClient = createClient()

      const [projectsRes, pointsRes] = await Promise.all([
        dbClient.from('projects').select('id, survey_type, created_at').eq('user_id', userId),
        dbClient.from('survey_points').select('id, created_at').eq('user_id', userId),
      ])

      const projects = (projectsRes.data ?? []) as ProjectRow[]
      const points = (pointsRes.data ?? []) as PointRow[]

      const last7Days: { date: string; count: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const count = projects.filter((p) => p.created_at?.startsWith(dateStr)).length
        last7Days.push({ date: dateStr, count })
      }

      const projectTypesMap: Record<string, number> = {}
      projects.forEach((p) => {
        const type = p.survey_type ?? 'Other'
        projectTypesMap[type] = (projectTypesMap[type] ?? 0) + 1
      })

      setData({
        totalProjects: projects.length,
        activeProjects: projects.length,
        completedSurveys: projects.filter((p) => p.survey_type !== null).length,
        totalPoints: points.length,
        storageUsed: Math.round(points.length * 0.001 * 100) / 100,
        apiCalls: 0,
        userActivity: last7Days,
        projectTypes: Object.entries(projectTypesMap).map(([type, count]) => ({ type, count })),
      })
      setLoading(false)
    }

    fetchAnalytics()
  }, [session?.user?.id, status, period])

  const maxActivity = data.userActivity.length > 0
    ? Math.max(...data.userActivity.map((d) => d.count))
    : 1 // prevent division by zero in bar chart

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Analytics</h1>
            <p className="text-[var(--text-muted)]">Track your METARDU usage</p>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="p-2 border rounded-lg"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Projects', value: data.totalProjects, delta: '+12%' },
            { label: 'Active Projects', value: data.activeProjects, delta: '+5%' },
            { label: 'Completed Surveys', value: data.completedSurveys, delta: '+23%' },
            { label: 'API Calls', value: `${(data.apiCalls / 1000).toFixed(1)}K`, delta: '+18%' },
          ].map((card) => (
            <div key={card.label} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
              <p className="text-sm text-[var(--text-muted)] mb-1">{card.label}</p>
              <p className="text-3xl font-bold">{card.value}</p>
              <p className="text-xs text-green-600 mt-1">↑ {card.delta} from last month</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold mb-4">User Activity</h2>
            <div className="flex items-end gap-1 h-40">
              {data.userActivity.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${(d.count / maxActivity) * 100}%` }}
                  />
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {new Date(d.date).getDate()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold mb-4">Projects by Type</h2>
            <div className="space-y-3">
              {data.projectTypes.map((pt, i) => {
                const percentage = data.totalProjects > 0 ? (pt.count / data.totalProjects) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{pt.type}</span>
                      <span className="text-[var(--text-muted)]">{pt.count}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold mb-2">Storage</h2>
            <div className="relative pt-4">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-green-500 h-4 rounded-full" style={{ width: `${Math.min((data.storageUsed / 5) * 100, 100)}%` }} />
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-2">{data.storageUsed} GB of 5 GB used</p>
            </div>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold mb-2">API Usage</h2>
            <div className="relative pt-4">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-blue-500 h-4 rounded-full" style={{ width: `${Math.min((data.apiCalls / 50000) * 100, 100)}%` }} />
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-2">{data.apiCalls.toLocaleString()} of 50,000 calls</p>
            </div>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold mb-2">Team Members</h2>
            <p className="text-3xl font-bold">5</p>
            <p className="text-sm text-[var(--text-muted)]">of 10 seats used</p>
            <button className="mt-4 text-sm text-blue-600 hover:underline">Manage team →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
