'use client';

/**
 * ProjectPicker — project selection screen for field tools
 *
 * Shows a list of the user's projects and lets them pick one
 * to start a field session. Also lets them pick the survey type.
 */

import { useState, useEffect } from 'react'
import { FolderKanban, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/api-client/client'
import { logger } from '@/lib/logger'
import { formatRoadChainage, parseRoadFieldPlan, roadFieldPlanCrsIsBoundToProject } from '@/lib/engineering/roadFieldPlan'
import type { OfflineRoadFieldPlan } from '@/lib/offline/fieldBookDB'

interface Project {
  id: string
  name: string
  survey_type?: string
  county?: string
  created_at?: string
}

interface ProjectPickerProps {
  onPick: (projectId: string, surveyType?: string) => void
  title: string
  subtitle: string
  initialProjectId?: string | null
  initialSurveyType?: string
  allowOfflineRoadPlans?: boolean
}

export function ProjectPicker({ onPick, title, subtitle, initialProjectId, initialSurveyType, allowOfflineRoadPlans = false }: ProjectPickerProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [offlineRoadPlans, setOfflineRoadPlans] = useState<OfflineRoadFieldPlan[]>([])
  const [showingOfflinePlans, setShowingOfflinePlans] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    async function loadProjects() {
      const loadOfflineRoadPlans = async (): Promise<boolean> => {
        if (!allowOfflineRoadPlans) return false
        try {
          const { listCachedRoadFieldPlans } = await import('@/lib/offline/fieldBookDB')
          const cachedPlans = await listCachedRoadFieldPlans()
          const validPlans = cachedPlans.filter((cached) => {
            const plan = parseRoadFieldPlan(cached.plan)
            return !!plan
              && Number.isFinite(Date.parse(cached.cachedAt))
              && roadFieldPlanCrsIsBoundToProject(plan.projectCrs, cached.projectCrsCode)
          })
          if (!current) return true

          setShowingOfflinePlans(true)
          setError(null)
          if (initialProjectId) {
            const selected = validPlans.find((cached) => cached.projectId === initialProjectId)
            if (selected) {
              onPick(selected.projectId, initialSurveyType || 'engineering')
            } else {
              setError('No verified offline road plan is cached for this project. Open its field plan online before leaving for the field.')
            }
            return true
          }

          setOfflineRoadPlans(validPlans)
          return true
        } catch (err) {
          logger.error('[project-picker] Failed to load cached road plans:', { error: err })
          return false
        }
      }

      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const loadedOfflinePlans = await loadOfflineRoadPlans()
          if (!loadedOfflinePlans && current) setError(allowOfflineRoadPlans
            ? 'This field project list needs a connection. Reopen a road field plan online to prepare an offline copy.'
            : 'Connect to load your projects. Your existing device records are retained.')
          return
        }

        setShowingOfflinePlans(false)
        const db = createClient()
        if (initialProjectId) {
          const selected = await db
            .from('projects')
            .select('id, name, survey_type, county, created_at')
            .eq('id', initialProjectId)
            .limit(1) as unknown as { data: Project[] | null; error: unknown }

          if (selected.error) throw selected.error
          const matchingProject = selected.data?.[0]
          if (matchingProject) {
            if (current) {
              setProjects([matchingProject])
              onPick(matchingProject.id, initialSurveyType || matchingProject.survey_type)
            }
            return
          }
        }

        const { data, error } = await db
          .from('projects')
          .select('id, name, survey_type, county, created_at')
          .order('created_at', { ascending: false })
          .limit(50) as unknown as { data: Project[] | null; error: unknown }

        if (error) throw error
        if (current) setProjects((data ?? []) as Project[])
      } catch (err) {
        logger.error('[project-picker] Failed to load projects:', { error: err })
        const networkFailure = typeof navigator !== 'undefined' && !navigator.onLine
          || err instanceof TypeError && /fetch|network|load failed/i.test(err.message)
        const loadedOfflinePlans = networkFailure ? await loadOfflineRoadPlans() : false
        if (!loadedOfflinePlans && current) setError('Failed to load projects. Check your connection.')
      } finally {
        if (current) setLoading(false)
      }
    }

    void loadProjects()
    return () => { current = false }
  }, [allowOfflineRoadPlans, initialProjectId, initialSurveyType, onPick, attempt])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-6 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-5 h-5 text-[var(--accent)]" />
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{title}</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p role="alert" className="text-sm text-[var(--error)]">{error}</p>
            <button type="button" onClick={() => {
              setLoading(true)
              setError(null)
              setAttempt(value => value + 1)
            }} className="mt-4 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
              Retry project list
            </button>
          </div>
        ) : showingOfflinePlans ? (
          offlineRoadPlans.length > 0 ? (
            <div>
              <p role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-[var(--text-secondary)]">
                These are device-cached road plans. METARDU will ask you to check the selected copy against the issued field brief before capture.
              </p>
              <div className="space-y-2">
                {offlineRoadPlans.map((cached) => {
                  const plan = parseRoadFieldPlan(cached.plan)
                  if (!plan) return null
                  return (
                    <button
                      key={cached.projectId}
                      type="button"
                      onClick={() => onPick(cached.projectId, initialSurveyType || 'engineering')}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[var(--bg-secondary)]"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-medium text-[var(--text-primary)]">{cached.projectName || `Road project · ${cached.projectId.slice(0, 8)}`}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      </span>
                      <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                        CH {formatRoadChainage(plan.startChainageM)}–{formatRoadChainage(plan.endChainageM)} · {cached.projectCrsCode}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">
                        Cached {new Date(cached.cachedAt).toLocaleString()}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-[var(--text-muted)]">No verified road field plans are cached on this device.</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Open each project’s field plan online before leaving for the field.</p>
            </div>
          )
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <FolderKanban className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">No projects yet</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Create a project from the dashboard first
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onPick(project.id, project.survey_type)}
                className="w-full flex items-center gap-3 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[var(--bg-secondary)] transition-all text-left"
              >
                <FolderKanban className="w-5 h-5 text-[var(--accent)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)] truncate">
                    {project.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                    {project.survey_type && (
                      <span className="capitalize">{project.survey_type}</span>
                    )}
                    {project.county && <span>· {project.county}</span>}
                    {project.created_at && (
                      <span>· {new Date(project.created_at).toLocaleDateString('en-KE')}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
