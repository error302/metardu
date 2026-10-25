import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  schemeExportRequestSchema,
  schemeExportIntent,
  type SchemeExportRequest,
  type SchemeExportFormat,
} from './exportContract'
export type SchemePendingStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>
export type SchemePendingLock = <T>(
  name: string,
  work: () => T | Promise<T>,
) => Promise<T>
const pendingSchema = z
  .object({
    version: z.literal(1),
    format: z.enum(['dxf', 'geojson']),
    body: schemeExportRequestSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
export type PendingSchemeExport = z.infer<typeof pendingSchema>
const uuid = z.string().uuid()
const key = (actor: string, project: string) =>
  `metardu:scheme-export:v1:${uuid.parse(actor)}:${uuid.parse(project)}`
const browserLock: SchemePendingLock = async (name, work) => {
  if (typeof navigator === 'undefined' || !navigator.locks?.request)
    throw new Error(
      'This browser cannot lock a recoverable request. No export was sent.',
    )
  return navigator.locks.request(name, work)
}
export function readSchemePending(
  actor: string,
  project: string,
  storage: SchemePendingStorage = window.localStorage,
) {
  const text = storage.getItem(key(actor, project))
  if (text === null) return null
  let pending: PendingSchemeExport
  try {
    pending = pendingSchema.parse(JSON.parse(text))
  } catch {
    throw new Error(
      'The retained device request is invalid. It was preserved; no new export was sent.',
    )
  }
  if (
    pending.body.expectedUserId !== actor ||
    pending.body.projectId !== project
  )
    throw new Error(
      'The retained device request belongs to another account or project. It was preserved.',
    )
  return pending
}
export async function prepareSchemePending(
  body: SchemeExportRequest,
  format: SchemeExportFormat,
  storage: SchemePendingStorage = window.localStorage,
  lock: SchemePendingLock = browserLock,
) {
  const pending = pendingSchema.parse({
      version: 1,
      body,
      format,
      createdAt: new Date().toISOString(),
    }),
    actor = pending.body.expectedUserId,
    project = pending.body.projectId
  return lock(key(actor, project), () => {
    const current = readSchemePending(actor, project, storage)
    if (current) {
      if (
        canonicalJSON(schemeExportIntent(current.body, current.format)) ===
        canonicalJSON(schemeExportIntent(pending.body, pending.format))
      )
        return current
      throw new Error(
        'An unconfirmed export is retained for this project. Recover or cancel it before starting another.',
      )
    }
    storage.setItem(key(actor, project), canonicalJSON(pending))
    const saved = readSchemePending(actor, project, storage)
    if (!saved || canonicalJSON(saved) !== canonicalJSON(pending))
      throw new Error(
        'The device did not acknowledge the request. No export was sent.',
      )
    return saved
  })
}
export async function acknowledgeSchemePending(
  pending: PendingSchemeExport,
  storage: SchemePendingStorage = window.localStorage,
  lock: SchemePendingLock = browserLock,
) {
  const actor = pending.body.expectedUserId,
    project = pending.body.projectId
  return lock(key(actor, project), () => {
    const current = readSchemePending(actor, project, storage)
    if (!current || canonicalJSON(current) !== canonicalJSON(pending))
      return false
    storage.removeItem(key(actor, project))
    if (storage.getItem(key(actor, project)) !== null)
      throw new Error('The device recovery record could not be cleared.')
    return true
  })
}
export async function schemePendingHash(pending: PendingSchemeExport) {
  const bytes = new TextEncoder().encode(
      canonicalJSON(schemeExportIntent(pending.body, pending.format)),
    ),
    digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}
