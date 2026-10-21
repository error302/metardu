import type { SavedFieldbook } from '@/app/fieldbook/types'
import { readBookEdit, type BookSaveOrigin } from '@/lib/offline/bookEdits'
import { readReviewedBook, BookDeliveryError } from './deliveryClient'
export async function prepareWorkingBook(actor: string, project: string, entry: SavedFieldbook, online: boolean): Promise<{ book: SavedFieldbook; origin: BookSaveOrigin; warning?: string }> {
  if (entry.user_id && entry.user_id !== actor || entry.project_id && entry.project_id !== project) throw new Error('This retained book belongs to a different account or project.')
  if (entry.localEditId) {
    const edit = await readBookEdit(actor, project, entry.localEditId)
    if (edit.bookId !== entry.id) throw new Error('The retained edit does not identify this book. Keep both copies for inspection.')
    return { book: { ...entry, name: edit.name, type: edit.type, data: edit.data }, origin: { kind: 'operation', requestId: edit.requestId } }
  }
  if (entry._origin === 'server' && online) {
    try {
      const reviewed = await readReviewedBook(actor, project, entry.id)
      if (reviewed.status !== 'active' || !['leveling', 'traverse', 'control'].includes(reviewed.type)) throw new Error('This server book is archived or has an unsupported type. Use recovery to inspect or export it.')
      return { book: { ...entry, name: reviewed.name ?? '', type: reviewed.type as SavedFieldbook['type'], data: reviewed.data }, origin: { kind: 'revision', revision: reviewed.revision } }
    } catch (error) {
      if (!(error instanceof BookDeliveryError) || error.code !== 'FIELDBOOK_DELIVERY_SCHEMA') throw error
      return { book: entry, origin: { kind: 'unknown' }, warning: 'Opened the retained content. Revision delivery is not ready on this server; edits will remain on this device for review.' }
    }
  }
  return { book: entry, origin: { kind: 'unknown' } }
}
