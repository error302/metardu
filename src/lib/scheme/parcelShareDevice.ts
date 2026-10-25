import {
  parcelShareCommandSchema,
  type ParcelShareCommand,
} from './parcelShareContract'
import type { SchemePendingStorage, SchemePendingLock } from './exportPending'
import { canonicalJSON } from '@/lib/audit/auditHash'
const key = (actor: string, project: string) =>
  `metardu:parcel-share:v1:${parcelShareCommandSchema.shape.expectedUserId.parse(actor)}:${parcelShareCommandSchema.shape.projectId.parse(project)}`
const browserLock: SchemePendingLock = async (name, work) => {
  if (!navigator.locks?.request)
    throw new Error(
      'This browser cannot lock a recoverable sharing request. No link was created.',
    )
  return navigator.locks.request(name, work)
}
export function readParcelSharePending(
  actor: string,
  project: string,
  storage: SchemePendingStorage = window.localStorage,
): ParcelShareCommand | null {
  const text = storage.getItem(key(actor, project))
  if (text === null) return null
  try {
    const body = parcelShareCommandSchema.parse(JSON.parse(text))
    if (body.expectedUserId !== actor || body.projectId !== project)
      throw new Error('Foreign intent')
    return body
  } catch {
    throw new Error(
      'The retained sharing request is invalid or belongs to another account. It was preserved; no new link was created.',
    )
  }
}
export async function prepareParcelSharePending(
  input: ParcelShareCommand,
  storage: SchemePendingStorage = window.localStorage,
  lock: SchemePendingLock = browserLock,
): Promise<ParcelShareCommand> {
  const body = parcelShareCommandSchema.parse(input)
  return lock(key(body.expectedUserId, body.projectId), () => {
    const current = readParcelSharePending(
      body.expectedUserId,
      body.projectId,
      storage,
    )
    if (current) {
      const { requestId: _oldId, key: _oldKey, ...oldIntent } = current
      const { requestId: _newId, key: _newKey, ...newIntent } = body
      if (canonicalJSON(oldIntent) !== canonicalJSON(newIntent))
        throw new Error(
          'Resolve the retained sharing request before starting another.',
        )
      return current
    }
    storage.setItem(
      key(body.expectedUserId, body.projectId),
      canonicalJSON(body),
    )
    const saved = readParcelSharePending(
      body.expectedUserId,
      body.projectId,
      storage,
    )
    if (!saved || canonicalJSON(saved) !== canonicalJSON(body))
      throw new Error(
        'This device did not acknowledge the sharing request. No link was sent.',
      )
    return saved
  })
}
export async function clearParcelSharePending(
  input: ParcelShareCommand,
  storage: SchemePendingStorage = window.localStorage,
  lock: SchemePendingLock = browserLock,
) {
  const body = parcelShareCommandSchema.parse(input)
  return lock(key(body.expectedUserId, body.projectId), () => {
    const current = readParcelSharePending(
      body.expectedUserId,
      body.projectId,
      storage,
    )
    if (!current || canonicalJSON(current) !== canonicalJSON(body)) return false
    storage.removeItem(key(body.expectedUserId, body.projectId))
    if (storage.getItem(key(body.expectedUserId, body.projectId)) !== null)
      throw new Error('The device sharing key could not be removed.')
    return true
  })
}
