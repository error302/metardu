import { getDB } from './syncQueue'
import type { SavedFieldbook } from '@/app/fieldbook/types'

export async function saveFieldbookOffline(fieldbook: Record<string, unknown>): Promise<void> {
  const db = await getDB()
  await db.put('fieldbooks', fieldbook)
}

export async function getOfflineFieldbooks(projectId: string, type?: string, ownerId?: string): Promise<SavedFieldbook[]> {
  if (!projectId) return []
  const db = await getDB()
  const all = await db.getAll('fieldbooks')
  return all
    .filter((fb: Record<string, unknown>) => {
      if (ownerId && fb.user_id !== ownerId) return false
      if (projectId && fb.project_id !== projectId) return false
      if (type && fb.type !== type) return false
      return true
    })
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? ''))) as SavedFieldbook[]
}

/** Keep the raw book and its retry operation in one IndexedDB transaction. */
export async function stageFieldbookSave(fieldbook: Record<string, unknown>): Promise<number> {
  const db = await getDB()
  const tx = db.transaction(['fieldbooks', 'sync_queue'], 'readwrite')
  await tx.objectStore('fieldbooks').put(fieldbook)
  // Coalesce only this owner's book; repeated offline saves must not replay
  // obsolete copies after the latest observation set.
  const queue = tx.objectStore('sync_queue')
  for (const op of await queue.getAll()) {
    if (op.table === 'fieldbooks' && op.data.id === fieldbook.id && op.data.user_id === fieldbook.user_id && op.id !== undefined) {
      await queue.delete(op.id)
    }
  }
  const id = await queue.add({ type: 'UPSERT', table: 'fieldbooks', data: fieldbook,
    timestamp: String(fieldbook.updated_at), projectId: String(fieldbook.project_id), retries: 0, priority: 'normal' })
  await tx.done
  return id
}

