import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from './fetcher'

// ── Types inferred from API responses ──────────────────────────────────

export interface FieldbookEntry {
  id: string
  project_id: string
  station_name?: string | null
  backsight?: string | null
  foresight?: string | null
  bearing_deg?: number | null
  bearing_min?: number | null
  bearing_sec?: number | null
  slope_distance?: number | null
  horizontal_distance?: number | null
  vertical_angle?: number | null
  bs_reading?: number | null
  fs_reading?: number | null
  easting?: number | null
  northing?: number | null
  elevation?: number | null
  latitude?: number | null
  longitude?: number | null
  notes?: string | null
  row_index?: number | null
  deleted_at?: string | null
  created_at: string
}

interface FieldbookEntriesResponse {
  data: FieldbookEntry[]
}

export interface SyncObservationPayload {
  id: string
  projectId: string
  surveyType: string
  station: string
  backsight?: string
  foresight?: string
  bearingDeg?: number
  bearingMin?: number
  bearingSec?: number
  slopeDistance?: number
  horizontalDistance?: number
  verticalAngle?: number
  backsightReading?: number
  foresightReading?: number
  easting?: number
  northing?: number
  elevation?: number
  latitude?: number
  longitude?: number
  notes?: string
  createdAt: string
}

interface SyncResponse {
  ok: boolean
  id: string
}

interface DeleteEntryResponse {
  ok: boolean
}

// ── Cache keys ─────────────────────────────────────────────────────────

export const fieldbookKeys = {
  all: ['fieldbook'] as const,
  byProject: (projectId: string) => [...fieldbookKeys.all, projectId] as const,
  entries: (projectId: string) => [...fieldbookKeys.byProject(projectId), 'entries'] as const,
}

// ── Default stale time for fieldbook queries ───────────────────────────

const FIELDBOOK_STALE_TIME = 2 * 60 * 1000 // 2 minutes

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * Fetch fieldbook entries for a given project.
 * Uses refetchOnWindowFocus: false to avoid unnecessary refetches
 * of field data that may be actively edited.
 */
export function useFieldbookEntries(projectId: string | undefined) {
  const query = useQuery<FieldbookEntriesResponse, ApiError>({
    queryKey: fieldbookKeys.entries(projectId ?? ''),
    queryFn: () => apiFetch<FieldbookEntriesResponse>(`/api/project/${projectId}/fieldbook`),
    enabled: !!projectId,
    staleTime: FIELDBOOK_STALE_TIME,
    refetchOnWindowFocus: false,
  })

  return {
    entries: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/**
 * Create / sync a fieldbook observation entry.
 * On success the fieldbook entries cache for the relevant project is invalidated.
 */
export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation<SyncResponse, ApiError, SyncObservationPayload>({
    mutationFn: (payload) =>
      apiFetch<SyncResponse>('/api/fieldbook/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: fieldbookKeys.entries(variables.projectId),
      })
    },
  })
}

/**
 * Soft-delete a fieldbook entry by setting its `deleted_at` timestamp.
 * Uses PATCH on the entry resource.
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient()

  return useMutation<
    DeleteEntryResponse,
    ApiError,
    { entryId: string; projectId: string }
  >({
    mutationFn: ({ entryId }) =>
      apiFetch<DeleteEntryResponse>(`/api/fieldbook/sync/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: fieldbookKeys.entries(variables.projectId),
      })
    },
  })
}
