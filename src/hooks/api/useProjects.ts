import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from './fetcher'

// ── Types inferred from API responses ──────────────────────────────────

export interface Project {
  id: string
  name: string
  survey_type: string
  location: string
  utm_zone: number
  hemisphere: 'N' | 'S'
  project_type: 'small' | 'scheme'
  client_name?: string | null
  surveyor_name?: string | null
  country?: string | null
  datum?: string | null
  created_at: string
}

interface ProjectsResponse {
  data: Project[]
}

interface ProjectResponse {
  data: Project
}

export interface CreateProjectPayload {
  name: string
  survey_type: string
  location?: string
  utm_zone?: number
  hemisphere?: 'N' | 'S'
  project_type?: 'small' | 'scheme'
  client_name?: string
  surveyor_name?: string
  country?: string
  datum?: string
  scheme_number?: string
  county?: string
  sub_county?: string
  ward?: string
  planned_parcels?: number
  adjudication_section?: string
}

// ── Cache keys ─────────────────────────────────────────────────────────

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
}

// ── Default stale time for project queries ─────────────────────────────

const PROJECT_STALE_TIME = 2 * 60 * 1000 // 2 minutes

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * Fetch the current user's project list.
 */
export function useProjects() {
  const query = useQuery<ProjectsResponse, ApiError>({
    queryKey: projectKeys.lists(),
    queryFn: () => apiFetch<ProjectsResponse>('/api/projects'),
    staleTime: PROJECT_STALE_TIME,
  })

  return {
    projects: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/**
 * Fetch a single project by ID.
 */
export function useProject(id: string | undefined) {
  const query = useQuery<ProjectResponse, ApiError>({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: () => apiFetch<ProjectResponse>(`/api/projects/${id}`),
    enabled: !!id,
    staleTime: PROJECT_STALE_TIME,
  })

  return {
    project: query.data?.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/**
 * Create a new project with optimistic update — the new project
 * is appended to the cached list immediately before the server confirms.
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  interface MutationContext {
    previousProjects?: ProjectsResponse
  }

  return useMutation<ProjectResponse, ApiError, CreateProjectPayload, MutationContext>({
    mutationFn: (payload) =>
      apiFetch<ProjectResponse>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Optimistic update: add the new project to the cached list
    onMutate: async (newProject) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.lists() })

      const previousProjects = queryClient.getQueryData<ProjectsResponse>(projectKeys.lists())

      if (previousProjects) {
        const optimisticProject: Project = {
          id: `temp-${Date.now()}`,
          name: newProject.name,
          survey_type: newProject.survey_type,
          location: newProject.location ?? '',
          utm_zone: newProject.utm_zone ?? 37,
          hemisphere: newProject.hemisphere ?? 'S',
          project_type: newProject.project_type ?? 'small',
          client_name: newProject.client_name ?? null,
          surveyor_name: newProject.surveyor_name ?? null,
          country: newProject.country ?? null,
          datum: newProject.datum ?? null,
          created_at: new Date().toISOString(),
        }

        queryClient.setQueryData<ProjectsResponse>(projectKeys.lists(), {
          data: [optimisticProject, ...previousProjects.data],
        })
      }

      return { previousProjects }
    },

    onError: (_err, _newProject, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(projectKeys.lists(), context.previousProjects)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}
