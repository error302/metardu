import type { FieldbookSaveResult } from '@/lib/fieldbook/delivery'
import { fieldbookSaveRequestSchema } from '@/lib/fieldbook/delivery'
import { retainBookEdit, sendBookEdit, type BookSaveOrigin } from './bookEdits'
import { saveFieldbookOffline } from './fieldbooks'
export async function persistWorkingBook(actor: string, record: Record<string, unknown>, origin: BookSaveOrigin, online: boolean, id = crypto.randomUUID()): Promise<{ requestId: string; pending: boolean; message: string; result?: FieldbookSaveResult }> {
  if (record.user_id !== actor) throw new Error('The open book belongs to another account. It was not reassigned.')
  const raw = fieldbookSaveRequestSchema.parse({ protocol: 'fieldbook-save-v1', requestId: id, projectId: record.project_id, bookId: record.id,
    type: record.type, name: record.name, data: record.data, baseRevision: null })
  const { protocol: _protocol, baseRevision: _base, ...content } = raw
  const recordSnapshot = { ...record, data: JSON.parse(JSON.stringify(raw.data)) as unknown }
  await retainBookEdit(actor, { ...content, basis: origin })
  let cacheWarning = ''
  try { await saveFieldbookOffline({ ...recordSnapshot, localEditId: id }) }
  catch { cacheWarning = ' The saved-book cache could not be updated; this snapshot is available in recovery.' }
  if (!online) return { requestId: id, pending: true, message: `Saved on this device. Use recovery to deliver when connected.${cacheWarning}` }
  try {
    const result = await sendBookEdit(actor, raw.projectId, id, false)
    return { requestId: id, pending: false, result, message: `Delivered revision ${result.receipt.savedRevision}.${result.currentRevision !== result.receipt.savedRevision ? ' The server has a later revision; review it before new edits.' : ''}${cacheWarning}` }
  } catch (error) {
    return { requestId: id, pending: true, message: `Saved on this device. ${error instanceof Error ? error.message : 'Delivery is unconfirmed; retry the retained request in recovery.'}${cacheWarning}` }
  }
}
