/**
 * Re-exports for all React Query data-fetching hooks.
 *
 * Usage:
 *   import { useProjects, useCreateProject } from '@/hooks/api'
 *   import { useFieldbookEntries, useCreateEntry } from '@/hooks/api'
 *   import { useAuditEvents, useVerifyAuditChain } from '@/hooks/api'
 */

export { useProjects, useProject, useCreateProject, projectKeys } from './useProjects'
export type { Project, CreateProjectPayload } from './useProjects'

export {
  useFieldbookEntries,
  useCreateEntry,
  useDeleteEntry,
  fieldbookKeys,
} from './useFieldbook'
export type { FieldbookEntry, SyncObservationPayload } from './useFieldbook'

export { useAuditEvents, useVerifyAuditChain, auditKeys } from './useAudit'
export type { AuditEvent, VerifyPayload, VerifyResponse } from './useAudit'

export { apiFetch, ApiError } from './fetcher'
