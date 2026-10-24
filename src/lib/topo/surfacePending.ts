import { z } from 'zod'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { requestUuid, surfaceRequestSchema, surfaceExportRequestSchema, surfaceRequestPayload, surfaceExportPayload, type SurfaceRequest, type SurfaceExportRequest } from './surfaceRequest'
export type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type PendingLock = <T>(key: string, work: () => T | Promise<T>) => Promise<T>
export type PendingSurfaceRequest = { version: 1; ownerId: string; projectId: string; createdAt: string } & ({ kind: 'surface'; body: SurfaceRequest } | { kind: 'dxf'; body: SurfaceExportRequest })
const common = { version: z.literal(1), ownerId: requestUuid, projectId: requestUuid, createdAt: z.string().datetime() }
const pendingSchema = z.discriminatedUnion('kind', [z.object({ ...common, kind: z.literal('surface'), body: surfaceRequestSchema }).strict(), z.object({ ...common, kind: z.literal('dxf'), body: surfaceExportRequestSchema }).strict()])
const key = (ownerId: string, projectId: string) => `metardu:surface-request:v1:${requestUuid.parse(ownerId)}:${requestUuid.parse(projectId)}`
const browserLock: PendingLock = async (name, work) => {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('A browser session lock is unavailable. No recoverable request was sent; use a browser that supports Web Locks.')
  return navigator.locks.request(name, work)
}
export function readPending(ownerId: string, projectId: string, storage: PendingStorage = window.localStorage): PendingSurfaceRequest | null {
  const value = storage.getItem(key(ownerId, projectId))
  if (value === null) return null
  let pending: PendingSurfaceRequest
  try { pending = pendingSchema.parse(JSON.parse(value)) } catch { throw new Error('The device recovery record is invalid. It was preserved; no new request was sent.') }
  if (pending.ownerId !== ownerId || pending.projectId !== projectId || pending.body.expectedUserId !== ownerId || pending.kind === 'dxf' && pending.body.projectId !== projectId) throw new Error('The device recovery record belongs to a different account or project. It was preserved.')
  return pending
}
function payload(pending: PendingSurfaceRequest) {
  return canonicalJson(pending.kind === 'surface' ? surfaceRequestPayload(pending.body) : surfaceExportPayload(pending.body))
}
export async function preparePending(ownerId: string, projectId: string, kind: 'surface' | 'dxf', body: SurfaceRequest | SurfaceExportRequest, storage: PendingStorage = window.localStorage, lock: PendingLock = browserLock): Promise<PendingSurfaceRequest> {
  const name = key(ownerId, projectId)
  return lock(name, () => {
    const pending = pendingSchema.parse({ version: 1, ownerId, projectId, kind, body, createdAt: new Date().toISOString() })
    if (pending.body.expectedUserId !== ownerId || pending.kind === 'dxf' && pending.body.projectId !== projectId) throw new Error('The request does not belong to this account and project.')
    const current = readPending(ownerId, projectId, storage)
    if (current) {
      if (current.kind === pending.kind && payload(current) === payload(pending)) return current
      throw new Error('An unconfirmed request is already retained for this project. Recover it before starting different work.')
    }
    storage.setItem(name, canonicalJson(pending))
    const retained = readPending(ownerId, projectId, storage)
    if (!retained || canonicalJson(retained) !== canonicalJson(pending)) throw new Error('The device did not acknowledge the recovery record. No request was sent.')
    return retained
  })
}
export async function acknowledgePending(pending: PendingSurfaceRequest, storage: PendingStorage = window.localStorage, lock: PendingLock = browserLock): Promise<boolean> {
  const name = key(pending.ownerId, pending.projectId)
  return lock(name, () => {
    const current = readPending(pending.ownerId, pending.projectId, storage)
    if (!current || canonicalJson(current) !== canonicalJson(pending)) return false
    storage.removeItem(name)
    if (storage.getItem(name) !== null) throw new Error('The acknowledged device request could not be cleared. Recovering it again will reuse its identity.')
    return true
  })
}
