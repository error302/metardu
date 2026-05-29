/**
 * React Query Configuration for METARDU
 * Client-side data caching with optimistic updates
 */

import {
  QueryClient,
  QueryClientConfig,
  QueryFunction,
  QueryKey,
  QueryFunctionContext,
} from '@tanstack/react-query'
import { cache } from 'react'

// Query client configuration
export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Global defaults
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (previously cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    // Performance
    placeholderData: (previousData: any) => previousData,
    },
    mutations: {
      // Global mutation defaults
      retry: 1,
    },
  },
}

// Create query client instance
export function makeQueryClient(): QueryClient {
  return new QueryClient(queryClientConfig)
}

// Server-side query client (singleton per request)
export const getQueryClient = cache(makeQueryClient)

// Prefetch helpers
export async function prefetchProject(queryClient: QueryClient, projectId: string) {
  await queryClient.prefetchQuery({
    queryKey: ['project', projectId],
    queryFn: fetchProject,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export async function prefetchProjects(queryClient: QueryClient, userId: string) {
  await queryClient.prefetchQuery({
    queryKey: ['projects', userId],
    queryFn: fetchProjects,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

export async function prefetchSurveyPoints(queryClient: QueryClient, projectId: string) {
  await queryClient.prefetchQuery({
    queryKey: ['survey-points', projectId],
    queryFn: fetchSurveyPoints,
    staleTime: 1000 * 60 * 5,
  })
}

// Query functions
const fetchProject: QueryFunction<any, ['project', string]> = async ({ queryKey }) => {
  const [, projectId] = queryKey
  const res = await fetch(`/api/projects/${projectId}`)
  if (!res.ok) throw new Error('Failed to fetch project')
  return res.json()
}

const fetchProjects: QueryFunction<any, ['projects', string]> = async ({ queryKey }) => {
  const [, userId] = queryKey
  const res = await fetch(`/api/projects?userId=${userId}`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

const fetchSurveyPoints: QueryFunction<any, ['survey-points', string]> = async ({ queryKey }) => {
  const [, projectId] = queryKey
  const res = await fetch(`/api/projects/${projectId}/points`)
  if (!res.ok) throw new Error('Failed to fetch survey points')
  return res.json()
}

// Optimistic update helpers
export function optimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updateFn: (old: T | undefined) => T
) {
  const previousData = queryClient.getQueryData<T>(queryKey)
  queryClient.setQueryData<T>(queryKey, updateFn)
  return previousData
}

// Invalidate related queries
export function invalidateProjectQueries(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ['project', projectId] })
  queryClient.invalidateQueries({ queryKey: ['survey-points', projectId] })
  queryClient.invalidateQueries({ queryKey: ['submissions', projectId] })
}

// Query key factories (for consistency)
export const queryKeys = {
  projects: () => ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  surveyPoints: (projectId: string) => ['survey-points', projectId] as const,
  surveyPoint: (projectId: string, pointId: string) => ['survey-points', projectId, pointId] as const,
  submissions: (projectId: string) => ['submissions', projectId] as const,
  submission: (id: string) => ['submission', id] as const,
  documents: (projectId: string) => ['documents', projectId] as const,
  tools: () => ['tools'] as const,
  tool: (name: string) => ['tools', name] as const,
  user: (id: string) => ['user', id] as const,
  profile: () => ['profile'] as const,
}

// Mutation helpers with optimistic updates
export function createOptimisticMutation<T, R>(
  queryClient: QueryClient,
  mutationFn: (data: T) => Promise<R>,
  options: {
    queryKey: QueryKey
    updateFn: (old: any, newData: R) => any
    onError?: (error: any, variables: T, context: any) => void
  }
) {
  return {
    mutationFn,
    onMutate: async (newData: T) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: options.queryKey })
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(options.queryKey)
      
      // Optimistically update
      queryClient.setQueryData(options.queryKey, (old: any) => {
        return options.updateFn(old, newData as unknown as R)
      })
      
      return { previousData }
    },
    onError: (err: any, newData: T, context: any) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(options.queryKey, context.previousData)
      }
      options.onError?.(err, newData, context)
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: options.queryKey })
    },
  }
}

// Performance tracking wrapper
export function withPerformanceTracking<T extends QueryFunction<any, any>>(
  fn: T,
  name: string
): T {
  const wrapped = async (context: QueryFunctionContext) => {
    const start = performance.now()
    try {
      const result = await fn(context)
      console.log(`[Query] ${name} took ${(performance.now() - start).toFixed(2)}ms`)
      return result
    } catch (error) {
      console.error(`[Query] ${name} failed after ${(performance.now() - start).toFixed(2)}ms`)
      throw error
    }
  }
  return wrapped as T
}

// Dev tools configuration
export const devtoolsConfig = {
  enabled: process.env.NODE_ENV === 'development',
}
