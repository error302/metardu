'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/api-client/client'
import Link from 'next/link'
import {
  ArrowLeft, Plus, LayoutGrid, MapPin, FileText, Users,
  AlertCircle, CheckCircle2, Clock, BarChart3, Settings
} from 'lucide-react'
import type { SchemeDetails, Block, Parcel, ParcelStatus } from '@/types/scheme'
import { SCHEME_STATUS_LABELS, PARCEL_STATUS_LABELS, PARCEL_STATUS_COLORS } from '@/types/scheme'

interface ProjectRow {
  id: number
  name: string
  survey_type: string
  location: string
  project_type: string
  utm_zone: number
  hemisphere: string
}

export default function SchemeWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const dbClient = createClient()

  const [project, setProject] = useState<ProjectRow | null>(null)
  const [schemeDetails, setSchemeDetails] = useState<SchemeDetails | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [parcelCounts, setParcelCounts] = useState<Record<ParcelStatus, number>>({
    pending: 0, field_complete: 0, computed: 0, plan_generated: 0, submitted: 0, approved: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadSchemeData = async () => {
      try {
        // Load project
        const { data: proj } = await dbClient.from('projects').select('*').eq('id', projectId).single()
        if (!proj) {
          setError('Project not found')
          setLoading(false)
          return
        }
        setProject(proj as ProjectRow)

        // Load scheme details
        const { data: scheme } = await dbClient.from('scheme_details').select('*').eq('project_id', projectId).maybeSingle()
        if (scheme) {
          setSchemeDetails(scheme as SchemeDetails)
        }

        // Load blocks
        const { data: blks } = await dbClient.from('blocks').select('*').eq('project_id', projectId).order('block_number')
        if (blks) {
          setBlocks(blks as Block[])

          // Load parcel counts per status
          const blockIds = (blks as Block[]).map(b => b.id)
          if (blockIds.length > 0) {
            // Get all parcels for these blocks and count by status
            const allParcels: Parcel[] = []
            for (const blockId of blockIds) {
              const { data: p } = await dbClient.from('parcels').select('*').eq('block_id', blockId)
              if (p) allParcels.push(...(p as Parcel[]))
            }

            const counts: Record<ParcelStatus, number> = {
              pending: 0, field_complete: 0, computed: 0, plan_generated: 0, submitted: 0, approved: 0
            }
            for (const parcel of allParcels) {
              counts[parcel.status] = (counts[parcel.status] || 0) + 1
            }
            setParcelCounts(counts)
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load scheme data')
      } finally {
        setLoading(false)
      }
    }

    void loadSchemeData()
  }, [projectId, dbClient])

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading scheme workspace...
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-[calc(100vh-8rem)] bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-[var(--text-secondary)]">{error || 'Project not found'}</p>
          <Link href="/dashboard" className="text-sm text-[var(--accent)] hover:underline">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const totalParcels = Object.values(parcelCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[var(--bg-primary)]">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
          <Link href="/dashboard" className="hover:text-[var(--accent)] transition-colors">Dashboard</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link href={`/project/${projectId}`} className="hover:text-[var(--accent)] transition-colors">{project.name}</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-orange-400">Scheme Workspace</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{project.name}</h1>
              <span className="px-2.5 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-medium rounded-full">
                Scheme
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {project.location} {schemeDetails ? `— ${schemeDetails.county}, ${schemeDetails.sub_county}, ${schemeDetails.ward}` : ''}
            </p>
            {schemeDetails && (
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                {schemeDetails.scheme_number && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {schemeDetails.scheme_number}
                  </span>
                )}
                {schemeDetails.adjudication_section && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {schemeDetails.adjudication_section}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3" />
                  {blocks.length} block{blocks.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--border-hover)] transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Project View
            </button>
            <Link
              href={`/project/${projectId}/scheme/blocks`}
              className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Manage Blocks
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          <StatCard
            label="Blocks"
            value={String(blocks.length)}
            icon={<LayoutGrid className="w-4 h-4" />}
            color="text-blue-400"
          />
          <StatCard
            label="Total Parcels"
            value={String(totalParcels)}
            icon={<BarChart3 className="w-4 h-4" />}
            color="text-[var(--accent)]"
          />
          {schemeDetails && (
            <StatCard
              label="Planned"
              value={String(schemeDetails.planned_parcels)}
              icon={<Clock className="w-4 h-4" />}
              color="text-gray-400"
            />
          )}
          {(Object.entries(PARCEL_STATUS_LABELS) as [ParcelStatus, string][]).map(([status, label]) => {
            if (status === 'pending' && parcelCounts[status] === 0) return null
            return (
              <StatCard
                key={status}
                label={label}
                value={String(parcelCounts[status])}
                icon={<CheckCircle2 className="w-4 h-4" />}
                color={status === 'approved' ? 'text-emerald-400' : status === 'submitted' ? 'text-purple-400' : 'text-[var(--text-secondary)]'}
              />
            )
          })}
        </div>

        {/* Blocks Table */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-orange-400" />
              Blocks
            </h2>
            {blocks.length === 0 && (
              <Link
                href={`/project/${projectId}/scheme/blocks`}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add First Block
              </Link>
            )}
          </div>

          {blocks.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <LayoutGrid className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-30" />
              <p className="text-sm text-[var(--text-secondary)] mb-1">No blocks created yet</p>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                Blocks group parcels together. Start by creating your first block.
              </p>
              <Link
                href={`/project/${projectId}/scheme/blocks`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-sm font-semibold rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                Create Block
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-color)]">
                    <th className="px-5 py-3 font-medium">Block</th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Parcels</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block) => (
                    <tr key={block.id} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-5 py-3 font-mono text-[var(--accent)]">{block.block_number}</td>
                      <td className="px-5 py-3 text-[var(--text-primary)]">{block.block_name || '—'}</td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">—</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full border border-gray-200">
                          Pending
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/project/${projectId}/scheme/blocks/${block.id}`}
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Phase Info */}
        <div className="mt-8 p-4 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)]/50 text-xs text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)] mb-1">Phase 25 — Scheme Workspace</p>
          <p>
            This is the scheme management hub. Future phases will add: parcel CRUD within blocks,
            batch traverse computation, bulk deed plan generation, Registry Index Maps,
            mutation forms, and multi-surveyor assignment.
          </p>
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, icon, color }: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}
